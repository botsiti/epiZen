//! Local images selected for expense notes and library covers.

use crate::{NetError, Vault, VaultError, net};
use std::path::Path;

pub const MAX_PHOTO_BYTES: usize = 10 * 1024 * 1024;

/// The cover name can be taken between the form opening and Save. Reuse identical
/// bytes on retry, or create a numbered sibling without replacing an existing file.
pub fn store_media_cover(vault: &Vault, path: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err("Choose a cover up to 10 MB.".into());
    }
    let format = net::ImageFormat::sniff(bytes).ok_or("Choose a PNG, JPEG, GIF or WebP cover.")?;
    let path = net::image_path(path, format).map_err(|error| error.to_string())?;
    let (stem, ext) = path.rsplit_once('.').ok_or("The cover needs an image extension.")?;
    for number in 1..=10_000 {
        let name = if number == 1 { path.clone() } else { format!("{stem}-{number}.{ext}") };
        match vault.create_file(&name, bytes) {
            Ok(()) => return Ok(name),
            Err(VaultError::Exists(_)) => {
                if vault.read_image(&name).map_err(|error| error.to_string())? == bytes {
                    return Ok(name);
                }
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Couldn't find an available cover name.".into())
}

/// Creates a new attachment in the configured folder, defaulting to _attachments beside the note.
pub fn store_expense_photo(vault: &Vault, note_path: &str, bytes: &[u8], folder: Option<&str>) -> Result<String, String> {
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err("Choose a photo smaller than 10 MB.".to_owned());
    }
    if net::ImageFormat::sniff(bytes).is_none() {
        return Err("Choose a PNG, JPEG, GIF or WebP image.".to_owned());
    }
    // Validate the note through the vault boundary before deriving its attachment folder.
    vault.note_path(note_path).map_err(|err| err.to_string())?;
    let parent = Path::new(note_path)
        .parent()
        .and_then(Path::to_str)
        .unwrap_or("");
    let folder = folder.map(str::to_owned).unwrap_or_else(|| {
        if parent.is_empty() { "_attachments".to_owned() } else { format!("{parent}/_attachments") }
    });
    if folder
        .chars()
        .any(|ch| matches!(ch, '[' | ']' | '|' | '#' | '\r' | '\n'))
    {
        return Err("This folder's name cannot be used in a photo link. Move the note to a folder with a simpler name first.".to_owned());
    }
    let prefix = if folder.is_empty() { folder } else { format!("{folder}/") };
    for number in 1..=10_000 {
        let candidate = format!("{prefix}expense-{number}.jpg");
        match net::store_image(vault, &candidate, bytes) {
            Ok(path) => return Ok(path),
            Err(NetError::Vault(VaultError::Exists(_))) => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Couldn't find an available photo name.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn stores_only_new_valid_images_beside_the_note() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        vault
            .create_note("months/September.md", "Original\n")
            .unwrap();
        let png = b"\x89PNG\r\n\x1a\nphoto";
        let first = store_expense_photo(&vault, "months/September.md", png, None).unwrap();
        let second = store_expense_photo(&vault, "months/September.md", png, None).unwrap();
        assert_eq!(first, "months/_attachments/expense-1.png");
        assert_eq!(second, "months/_attachments/expense-2.png");
        assert_eq!(fs::read(dir.path().join(first)).unwrap(), png);
        assert_eq!(
            vault.read_note("months/September.md").unwrap(),
            "Original\n"
        );
        assert!(store_expense_photo(&vault, "months/September.md", b"not an image", None).is_err());
        assert!(store_expense_photo(&vault, "../outside.md", png, None).is_err());
        assert!(store_expense_photo(&vault, "missing.md", png, None).is_err());
        vault.create_note("hash#folder/note.md", "Keep").unwrap();
        assert!(store_expense_photo(&vault, "hash#folder/note.md", png, None).is_err());
        assert!(!dir.path().join("hash#folder/_attachments").exists());
        assert!(
            store_expense_photo(&vault, "months/September.md", &vec![0; MAX_PHOTO_BYTES + 1], None)
                .is_err()
        );
        assert_eq!(vault.list_files().unwrap().len(), 4);
    }

    #[test]
    fn honors_the_selected_folder_without_escaping_the_vault() {
        let root = tempfile::tempdir().unwrap();
        let vault = Vault::open(root.path()).unwrap();
        vault.create_note("notes/October.md", "Keep").unwrap();
        let png = b"\x89PNG\r\n\x1a\nphoto";
        assert_eq!(store_expense_photo(&vault, "notes/October.md", png, Some("Media")).unwrap(), "Media/expense-1.png");
        assert_eq!(store_expense_photo(&vault, "notes/October.md", png, Some("")).unwrap(), "expense-1.png");
        assert!(store_expense_photo(&vault, "notes/October.md", png, Some("../outside")).is_err());
        assert_eq!(vault.read_note("notes/October.md").unwrap(), "Keep");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_an_attachment_folder_symlink_outside_the_vault() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        vault.create_note("September.md", "Original").unwrap();
        symlink(outside.path(), dir.path().join("_attachments")).unwrap();
        assert!(store_expense_photo(&vault, "September.md", b"\x89PNG\r\n\x1a\nphoto", None).is_err());
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
        assert_eq!(vault.read_note("September.md").unwrap(), "Original");
    }
}
