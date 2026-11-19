//! A user-selected Markdown destination shared by conversations and habit reports.

#[tauri::command]
pub async fn export_markdown(app: tauri::AppHandle, window: tauri::WebviewWindow, settings: tauri::State<'_, crate::Settings>, name: String, text: String) -> Result<Option<String>, String> {
    if window.label() != "main" { return Err("Export from the main workspace.".to_owned()); }
    if name.len() > 240 || !name.ends_with(".md") || std::path::Path::new(&name).components().count() != 1 || text.len() > 40 * 1024 * 1024 { return Err("This Markdown export is invalid or too large.".to_owned()); }
    #[cfg(not(feature = "e2e"))]
    let path = {
        use tauri_plugin_dialog::DialogExt;
        let _ = settings;
        let Some(selected) = app.dialog().file().set_file_name(&name).add_filter("Markdown", &["md"]).blocking_save_file() else { return Ok(None) };
        selected.into_path().map_err(|_| "Choose a local folder for the export.".to_owned())?
    };
    #[cfg(feature = "e2e")]
    let path = { let _ = app; settings.fixture_export_folder().map_err(|error| error.to_string())?.join(&name) };
    // The selected parent is a one-file export scope. Reuse Vault's atomic, no-clobber creation
    // without switching the application's open vault or bypassing its filesystem boundary.
    let parent = path.parent().ok_or("Choose an export folder.")?;
    let filename = path.file_name().and_then(|name| name.to_str()).ok_or("Choose a valid export filename.")?;
    let destination = crate::Vault::open(parent).map_err(|error| error.to_string())?;
    destination.create_note(filename, &text).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
