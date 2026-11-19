//! Only media explicitly picked for Appearance enters this app-owned library.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs::{self, File}, io::{Read, Write}, path::{Path, PathBuf}, sync::{Mutex, RwLock}};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tempfile::NamedTempFile;

const MAX_BYTES: u64 = 256 * 1024 * 1024;
static IMPORT: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
pub struct Wallpaper { id: String, name: String, kind: &'static str, path: PathBuf }

fn format(header: &[u8]) -> Option<(&'static str, &'static str)> {
    if header.starts_with(b"GIF87a") || header.starts_with(b"GIF89a") { Some(("gif", "gif")) }
    else if header.starts_with(b"\x89PNG\r\n\x1a\n") { Some(("png", "image")) }
    else if header.starts_with(&[0xff, 0xd8, 0xff]) { Some(("jpg", "image")) }
    else if header.starts_with(b"RIFF") && header.get(8..12) == Some(b"WEBP") { Some(("webp", "image")) }
    else if header.get(4..8) == Some(b"ftyp") {
        match header.get(8..12)? {
            b"qt  " => Some(("mov", "video")),
            b"isom" | b"iso2" | b"mp41" | b"mp42" | b"avc1" | b"M4V " | b"iso5" | b"iso6" => Some(("mp4", "video")),
            _ => None,
        }
    } else { None }
}

fn safe_name(name: &str) -> String {
    let mut text = String::new();
    for c in name.chars().filter(|c| !c.is_control() && !"/\\:*?\"<>|".contains(*c)) {
        if text.len() + c.len_utf8() > 110 { break; }
        text.push(c);
    }
    let text = text.trim_matches(['.', ' ']);
    if text.is_empty() { "Wallpaper".into() } else { text.into() }
}

fn entry(path: PathBuf) -> Option<Wallpaper> {
    let filename = path.file_name()?.to_str()?;
    let (hash, name) = filename.split_once("--")?;
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) { return None; }
    let (title, ext) = name.rsplit_once('.')?;
    if safe_name(title) != title || !fs::symlink_metadata(&path).ok()?.is_file() { return None; }
    let kind = match ext { "gif" => "gif", "jpg" | "png" | "webp" => "image", "mp4" | "mov" => "video", _ => return None };
    Some(Wallpaper { id: filename.into(), name: title.into(), kind, path })
}

fn library(dir: &Path) -> Result<Vec<Wallpaper>, String> {
    match fs::symlink_metadata(dir) {
        Ok(meta) if !meta.is_dir() => return Err("The wallpaper library is unavailable.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(error.to_string()),
        _ => {}
    }
    let mut items = Vec::new();
    for item in fs::read_dir(dir).map_err(|e| e.to_string())? {
        if let Some(wallpaper) = entry(item.map_err(|e| e.to_string())?.path()) { items.push(wallpaper); }
    }
    items.sort_by_cached_key(|item| item.name.to_lowercase());
    Ok(items)
}

fn import(dir: &Path, source: &Path) -> Result<Wallpaper, String> {
    let _guard = IMPORT.lock().unwrap_or_else(|e| e.into_inner());
    let items = library(dir)?;
    if !fs::metadata(source).map_err(|e| e.to_string())?.is_file() { return Err("Choose a regular media file.".into()); }
    let mut file = File::open(source).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_BYTES { return Err("Choose a media file up to 256 MB.".into()); }
    let mut header = [0; 12];
    file.read_exact(&mut header).map_err(|_| "This media file is incomplete.")?;
    let (ext, _) = format(&header).ok_or("Choose a GIF, JPEG, PNG, WebP, MP4 or QuickTime movie.")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut copy = NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    hash.update(header);
    copy.write_all(&header).map_err(|e| e.to_string())?;
    let mut size = header.len() as u64;
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        size += n as u64;
        if size > MAX_BYTES { return Err("Choose a media file up to 256 MB.".into()); }
        hash.update(&buffer[..n]);
        copy.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
    let digest = format!("{:x}", hash.finalize());
    if let Some(known) = items.into_iter().find(|item| item.id.starts_with(&digest)) { return Ok(known); }
    let name = safe_name(&source.file_stem().unwrap_or_default().to_string_lossy());
    let path = dir.join(format!("{digest}--{name}.{ext}"));
    copy.as_file().sync_all().map_err(|e| e.to_string())?;
    copy.persist_noclobber(&path).map_err(|e| e.error.to_string())?;
    entry(path).ok_or_else(|| "Unable to open the imported wallpaper.".into())
}

fn directory(window: &WebviewWindow, settings: &crate::Settings, vault: &RwLock<crate::VaultState>) -> Result<PathBuf, String> {
    if window.label() != "main" { return Err("Wallpaper controls belong to the workspace.".into()); }
    let root = vault.read().unwrap_or_else(|e| e.into_inner()).vault()?.root();
    let dir = settings.directory_outside_vault(&root).map_err(|e| e.to_string())?.join("wallpapers");
    if dir.starts_with(&root) { return Err("The wallpaper library must be outside the open vault.".into()); }
    Ok(dir)
}

#[tauri::command]
pub async fn list_wallpapers(app: AppHandle, window: WebviewWindow, settings: State<'_, crate::Settings>, vault: State<'_, RwLock<crate::VaultState>>) -> Result<Vec<Wallpaper>, String> {
    let items = library(&directory(&window, &settings, &vault)?)?;
    for item in &items { app.asset_protocol_scope().allow_file(&item.path).map_err(|e| e.to_string())?; }
    Ok(items)
}

#[tauri::command]
pub async fn choose_wallpaper(app: AppHandle, window: WebviewWindow, settings: State<'_, crate::Settings>, vault: State<'_, RwLock<crate::VaultState>>) -> Result<Option<Wallpaper>, String> {
    directory(&window, &settings, &vault)?;
    let dialog = app.dialog().file().set_title("Add wallpaper").add_filter("Wallpaper", &["gif", "jpg", "jpeg", "png", "webp", "mp4", "mov", "m4v"]);
    let Some(selected) = dialog.blocking_pick_file() else { return Ok(None) };
    let dir = directory(&window, &settings, &vault)?;
    let path = selected.into_path().map_err(|e| e.to_string())?;
    let item = tauri::async_runtime::spawn_blocking(move || import(&dir, &path)).await.map_err(|e| e.to_string())??;
    app.asset_protocol_scope().allow_file(&item.path).map_err(|e| e.to_string())?;
    Ok(Some(item))
}

#[tauri::command]
pub fn remove_wallpaper(window: WebviewWindow, settings: State<'_, crate::Settings>, vault: State<'_, RwLock<crate::VaultState>>, id: String) -> Result<(), String> {
    remove(&directory(&window, &settings, &vault)?, &settings, &id)
}

fn remove(dir: &Path, settings: &crate::Settings, id: &str) -> Result<(), String> {
    let _guard = IMPORT.lock().unwrap_or_else(|e| e.into_inner());
    let item = library(dir)?.into_iter().find(|item| item.id == id).ok_or("This wallpaper is no longer in the library.")?;
    settings.forget_wallpaper(id).map_err(|e| e.to_string())?;
    fs::remove_file(item.path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_and_deduplicates_media_without_modifying_its_source() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("Wave.gif");
        let data = include_bytes!("../../test/fixtures/wallpaper-motion.gif");
        fs::write(&source, data).unwrap();
        let dir = tmp.path().join("library");
        let item = import(&dir, &source).unwrap();
        assert_eq!(item.kind, "gif");
        assert_eq!(import(&dir, &source).unwrap().id, item.id);
        assert_eq!(library(&dir).unwrap().len(), 1);
        assert_eq!(fs::read(&item.path).unwrap(), data);
        let settings = crate::Settings::new(tmp.path().join("config"));
        settings.update(serde_json::Map::from_iter([("appearance".into(), serde_json::json!({"wallpaper":item.id, "surface":"glass"}))])).unwrap();
        assert!(remove(&dir, &settings, "../Wave.gif").is_err());
        remove(&dir, &settings, &item.id).unwrap();
        assert_eq!(settings.load()["appearance"], serde_json::json!({"surface":"glass"}));
        assert!(library(&dir).unwrap().is_empty());
        assert_eq!(fs::read(source).unwrap(), data);
    }
    #[test]
    fn rejects_unrecognized_files_and_symlinked_library_locations() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("bad.gif");
        fs::write(&source, b"<html>example</html>").unwrap();
        assert!(import(&tmp.path().join("library"), &source).is_err());
        assert!(!tmp.path().join("library").exists());
        let link = tmp.path().join("linked");
        std::os::unix::fs::symlink(tmp.path(), &link).unwrap();
        assert!(library(&link).is_err());
    }
}
