//! A small, transparent companion. The main window remains the only conversation/action owner.
use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "spike";
pub const COMMAND: &str = "epizen://pet-command";
const STATE_EVENT: &str = "epizen://pet-state";
const WIDTH: f64 = 180.0;
const HEIGHT: f64 = 220.0;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PetState { pub animation: String, pub label: String, pub motion: bool }
impl Default for PetState {
    fn default() -> Self { Self { animation: "idle".to_owned(), label: "Talk to Spike".to_owned(), motion: true } }
}
#[derive(Default)]
pub struct Pet { enabled: AtomicBool, state: Mutex<PetState>, owner: Mutex<Option<String>>, operation: tokio::sync::Mutex<()> }
impl Pet { pub fn enabled(&self) -> bool { self.enabled.load(Ordering::SeqCst) } }
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("Only the main workspace controls the companion.".to_owned()) }
}
fn pet_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == LABEL { Ok(()) } else { Err("This command belongs to the desktop companion.".to_owned()) }
}
pub fn close(app: &AppHandle) {
    app.state::<Pet>().enabled.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window(LABEL) { let _ = window.destroy(); }
}
pub fn remember_position(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL)
        && let Ok(position) = window.outer_position()
    {
        let _ = app.state::<crate::Settings>().update(serde_json::Map::from_iter([("desktopPetPosition".to_owned(), serde_json::json!({ "x": position.x, "y": position.y }))]));
    }
}
fn create(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(LABEL) { return Ok(window); }
    // Agent previews and E2E must stay on Desktop 2 instead of covering the user's Space.
    let all_workspaces = !cfg!(feature = "e2e") && std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_none();
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("pet.html".into()))
        .title("Spike · Epizen").inner_size(WIDTH, HEIGHT).resizable(false)
        .maximizable(false).minimizable(false).closable(false).decorations(false)
        .transparent(true).shadow(false).always_on_top(true).skip_taskbar(true)
        .visible_on_all_workspaces(all_workspaces).accept_first_mouse(true).focused(false)
        .visible(false);
    if !all_workspaces { builder = builder.parent(&app.get_webview_window("main").ok_or("The workspace is unavailable.")?).map_err(|error| error.to_string())?; }
    let window = builder.build().map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let panel = window.clone();
        window.run_on_main_thread(move || {
            use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
            if objc2::MainThreadMarker::new().is_none() { return; }
            if let Ok(raw) = panel.ns_window() {
                // SAFETY: Tauri's live NSWindow, accessed only on the AppKit main thread.
                let native = unsafe { &*raw.cast::<NSWindow>() };
                let mut behavior = native.collectionBehavior() | NSWindowCollectionBehavior::Transient;
                if all_workspaces { behavior |= NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::FullScreenAuxiliary; }
                native.setCollectionBehavior(behavior);
                native.setExcludedFromWindowsMenu(true);
            }
        }).map_err(|error| error.to_string())?;
    }
    Ok(window)
}
fn within(position: (i32, i32), area: (i32, i32, u32, u32), size: (i32, i32)) -> bool {
    let (x, y) = position; let (left, top, width, height) = area;
    i64::from(x) >= i64::from(left) && i64::from(y) >= i64::from(top)
        && i64::from(x) + i64::from(size.0) <= i64::from(left) + i64::from(width)
        && i64::from(y) + i64::from(size.1) <= i64::from(top) + i64::from(height)
}
fn place(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("The workspace is unavailable.")?;
    let monitors = main.available_monitors().map_err(|error| error.to_string())?;
    let settings = app.state::<crate::Settings>().load();
    let saved = settings.get("desktopPetPosition");
    if !cfg!(feature = "e2e") && std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_none()
        && let Some((x, y)) = saved.and_then(|value| Some((i32::try_from(value["x"].as_i64()?).ok()?, i32::try_from(value["y"].as_i64()?).ok()?)))
        && monitors.iter().any(|monitor| { let area = monitor.work_area(); within((x, y), (area.position.x, area.position.y, area.size.width, area.size.height), ((WIDTH * monitor.scale_factor()).round() as i32, (HEIGHT * monitor.scale_factor()).round() as i32)) }) {
            return window.set_position(PhysicalPosition::new(x, y)).map_err(|error| error.to_string());
    }
    let monitor = crate::companion_display::select(&main, cfg!(feature = "e2e") || std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_some())?;
    let area = monitor.work_area(); let scale = monitor.scale_factor();
    let x = area.position.x + (f64::from(area.size.width) - (WIDTH + 24.0) * scale).max(0.0).round() as i32;
    let y = area.position.y + (f64::from(area.size.height) - (HEIGHT + 24.0) * scale).max(0.0).round() as i32;
    window.set_position(PhysicalPosition::new(x, y)).map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn pet_enable(app: AppHandle, window: WebviewWindow, root: String, enabled: bool) -> Result<(), String> {
    main_only(&window)?;
    let state = app.state::<Pet>(); let _operation = state.operation.lock().await;
    let vault = app.state::<std::sync::RwLock<crate::VaultState>>();
    let guard = vault.read().unwrap_or_else(|p| p.into_inner());
    let current = guard.vault().ok().map(|vault| vault.root());
    if enabled && current.as_deref() != Some(root.as_str()) { return Err("The vault changed.".to_owned()); }
    if !enabled && current.as_deref() != Some(root.as_str()) && state.owner.lock().unwrap_or_else(|p| p.into_inner()).as_deref() != Some(root.as_str()) { return Ok(()); }
    drop(guard);
    if enabled {
        let pet = create(&app)?;
        place(&app, &pet)?;
        pet.set_focusable(false).map_err(|error| error.to_string())?;
        if vault.read().unwrap_or_else(|p| p.into_inner()).vault()?.root() != root { return Err("The vault changed.".to_owned()); }
        pet.show().map_err(|error| error.to_string())?;
        *state.owner.lock().unwrap_or_else(|p| p.into_inner()) = Some(root);
        app.state::<Pet>().enabled.store(true, Ordering::SeqCst);
    } else {
        remember_position(&app);
        if let Some(pet) = app.get_webview_window(LABEL) { pet.hide().map_err(|error| error.to_string())?; }
        app.state::<Pet>().enabled.store(false, Ordering::SeqCst);
        *state.owner.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }
    Ok(())
}
#[tauri::command]
pub fn pet_publish(app: AppHandle, window: WebviewWindow, root: String, state: PetState) -> Result<(), String> {
    main_only(&window)?;
    if app.state::<std::sync::RwLock<crate::VaultState>>().read().unwrap_or_else(|p| p.into_inner()).vault()?.root() != root { return Ok(()); }
    if !["idle", "left", "right", "greeting", "happy", "error", "listening", "thinking", "review"].contains(&state.animation.as_str()) || state.label.len() > 120 { return Err("Invalid companion state.".to_owned()); }
    *app.state::<Pet>().state.lock().unwrap_or_else(|p| p.into_inner()) = state.clone();
    app.emit_to(LABEL, STATE_EVENT, state).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn pet_state(pet: State<'_, Pet>) -> PetState { pet.state.lock().unwrap_or_else(|p| p.into_inner()).clone() }
#[derive(Serialize)]
pub struct PetPosition { x: i32, y: i32, scale: f64 }
#[tauri::command]
pub fn pet_position(window: WebviewWindow) -> Result<PetPosition, String> {
    pet_only(&window)?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    Ok(PetPosition { x: position.x, y: position.y, scale: window.scale_factor().map_err(|error| error.to_string())? })
}
#[tauri::command]
pub fn pet_move(window: WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    pet_only(&window)?;
    window.set_position(PhysicalPosition::new(x, y)).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn pet_open_main(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    pet_only(&window)?;
    if let Some(main) = app.get_webview_window("main") {
        main.unminimize().map_err(|error| error.to_string())?;
        main.show().map_err(|error| error.to_string())?;
        if !cfg!(feature = "e2e") && std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_none() { main.set_focus().map_err(|error| error.to_string())?; }
        let root = app.state::<Pet>().owner.lock().unwrap_or_else(|p| p.into_inner()).clone();
        app.emit_to("main", COMMAND, serde_json::json!({ "type": "open", "root": root })).map_err(|error| error.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub async fn pet_hide(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    pet_only(&window)?;
    let state = app.state::<Pet>(); let _operation = state.operation.lock().await;
    remember_position(&app);
    window.hide().map_err(|error| error.to_string())?;
    app.state::<Pet>().enabled.store(false, Ordering::SeqCst);
    let root = state.owner.lock().unwrap_or_else(|p| p.into_inner()).take();
    app.emit_to("main", COMMAND, serde_json::json!({ "type": "hide", "root": root })).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn pet_motion(app: AppHandle, window: WebviewWindow, motion: bool) -> Result<(), String> {
    pet_only(&window)?;
    let pet = app.state::<Pet>(); let mut state = pet.state.lock().unwrap_or_else(|p| p.into_inner()); state.motion = motion;
    app.emit_to(LABEL, STATE_EVENT, state.clone()).map_err(|error| error.to_string())?;
    let root = pet.owner.lock().unwrap_or_else(|p| p.into_inner()).clone();
    app.emit_to("main", COMMAND, serde_json::json!({ "type": "motion", "motion": motion, "root": root })).map_err(|error| error.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restored_positions_must_fit_the_display_without_changing_its_arrangement() {
        assert!(within((-1200, 100), (-1728, 0, 1728, 1080), (180, 220)));
        assert!(!within((-100, 100), (-1728, 0, 1728, 1080), (180, 220)));
        assert!(!within((3000, 1800), (0, 0, 3456, 2160), (360, 440)));
        assert!(within((3000, 1700), (0, 0, 3456, 2160), (360, 440)));
    }
}
