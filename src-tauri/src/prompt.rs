//! A small capture window. Only the main workspace may accept requests or execute actions.
use std::{collections::HashSet, sync::Mutex};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use crate::assistant::voice::{VoiceProvider, VoiceSettings};

pub const LABEL: &str = "spike-prompt";
pub const EVENT: &str = "epizen://prompt-state";
pub const COMMAND: &str = "epizen://prompt-command";
pub const TEXT_SHORTCUT: &str = "Command+Shift+Space";
pub const VOICE_SHORTCUT: &str = "Command+Alt+Shift+Space";
const WIDTH: f64 = 440.0;
const HEIGHT: f64 = 64.0;
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Capture { pub id: String, pub text: String, pub error: Option<String> }
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document { pub revision: u64, pub draft: String, pub pending: Option<Capture> }
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Status { pub connected: bool, pub busy: bool, pub review: bool, pub label: String, pub reply: String, pub voice: VoiceSettings, #[serde(default)] pub glass: bool }
impl Default for Status {
    fn default() -> Self { Self { glass: false, connected: false, busy: false, review: false, label: "Connect Spike to start".into(), reply: String::new(), voice: VoiceSettings { provider: VoiceProvider::Local, model: String::new() } } }
}
#[derive(Clone, Default, Serialize)]
pub struct Shortcuts { typing: bool, dictation: bool }
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { pub shortcuts: Shortcuts, pub root: String, pub visible: bool, pub opened: u64, pub dictate: bool, pub status: Status, pub document: Document }
#[derive(Default)]
struct Runtime { enabled: bool, snapshot: Snapshot, issued: HashSet<String> }
#[derive(Default)]
pub struct Prompt { state: Mutex<Runtime>, operation: tokio::sync::Mutex<()>, flush: Mutex<Option<tokio::sync::oneshot::Sender<Result<(), String>>>> }
impl Prompt { pub fn enabled(&self) -> bool { self.state.lock().unwrap_or_else(|p| p.into_inner()).enabled } }
/// Companion renderers receive no general vault, calendar, settings, or assistant execution commands.
/// Tauri's plugin ACL covers plugin commands; app commands need this explicit window boundary.
pub fn command_allowed(label: &str, command: &str) -> bool {
    match label {
        LABEL => matches!(command, "prompt_state" | "prompt_save" | "prompt_submit" | "prompt_open" | "prompt_hide" | "prompt_resize" | "prompt_open_main" | "prompt_consumed" | "prompt_flushed" | "assistant_transcribe" | "assistant_cancel"),
        crate::pet::LABEL => matches!(command, "pet_state" | "pet_position" | "pet_move" | "pet_open_main" | "pet_hide" | "pet_motion" | "prompt_open"),
        _ => true,
    }
}
fn from_window(window: &WebviewWindow, allowed: &[&str]) -> Result<(), String> {
    if allowed.contains(&window.label()) { Ok(()) } else { Err("This command is unavailable in this window.".into()) }
}
fn document(app: &AppHandle, root: &str) -> Result<Document, String> {
    let value = app.state::<crate::Settings>().prompt_document(root).map_err(|error| error.to_string())?;
    let doc: Document = serde_json::from_value(value).map_err(|_| "The saved quick prompt is invalid. Its original file is preserved.")?;
    validate_document(&doc)?; Ok(doc)
}
fn validate_document(doc: &Document) -> Result<(), String> {
    if doc.draft.len() > 40_000 || doc.pending.as_ref().is_some_and(|item| item.id.is_empty() || item.id.len() > 80 || !item.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') || item.text.trim().is_empty() || item.text.len() > 40_000 || item.error.as_ref().is_some_and(|error| error.len() > 2000)) {
        return Err("This quick prompt is invalid or too long.".into());
    }
    Ok(())
}
fn persist(app: &AppHandle, root: &str, doc: &Document) -> Result<Document, String> {
    validate_document(doc)?;
    serde_json::from_value(app.state::<crate::Settings>().save_prompt_document(root, doc.revision, serde_json::to_value(doc).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}
fn current(app: &AppHandle, root: &str) -> Result<(), String> {
    let prompt = app.state::<Prompt>(); let state = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
    if !state.enabled || state.snapshot.root != root { return Err("Spike is disabled or the vault changed. Your prompt has been retained.".into()); }
    let vault = app.state::<std::sync::RwLock<crate::VaultState>>();
    if vault.read().unwrap_or_else(|p| p.into_inner()).vault()?.root() != root { return Err("The vault changed.".into()); }
    Ok(())
}
fn snapshot(app: &AppHandle) -> Snapshot {
    let mut state = app.state::<Prompt>().state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.clone();
    state.shortcuts = Shortcuts { typing: app.global_shortcut().is_registered(TEXT_SHORTCUT), dictation: app.global_shortcut().is_registered(VOICE_SHORTCUT) };
    state
}
fn publish(app: &AppHandle) -> Result<Snapshot, String> {
    let state = snapshot(app);
    app.emit_to(LABEL, EVENT, &state).map_err(|error| error.to_string())?;
    app.emit_to("main", EVENT, &state).map_err(|error| error.to_string())?;
    Ok(state)
}
fn update_document(app: &AppHandle, root: &str, doc: Document) -> Result<(), String> {
    let prompt = app.state::<Prompt>(); let mut runtime = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
    if runtime.snapshot.root != root { return Ok(()); }
    runtime.snapshot.document = doc; drop(runtime); publish(app)?; Ok(())
}
fn shortcut_intent(shortcut: &tauri_plugin_global_shortcut::Shortcut, state: ShortcutState) -> Option<bool> {
    if state != ShortcutState::Pressed { return None; }
    if shortcut == &VOICE_SHORTCUT.parse::<tauri_plugin_global_shortcut::Shortcut>().expect("fixed voice shortcut") { Some(true) }
    else if shortcut == &TEXT_SHORTCUT.parse::<tauri_plugin_global_shortcut::Shortcut>().expect("fixed text shortcut") { Some(false) }
    else { None }
}
#[derive(Debug, PartialEq)]
enum ShortcutAction { Show, ClosePrompt, HidePet }
fn shortcut_action(dictate: bool, prompt_visible: bool, pet_visible: bool) -> ShortcutAction {
    if dictate { ShortcutAction::Show }
    else if prompt_visible { ShortcutAction::ClosePrompt }
    else if pet_visible { ShortcutAction::HidePet }
    else { ShortcutAction::Show }
}
pub fn install(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
        let Some(dictate) = shortcut_intent(shortcut, event.state()) else { return; };
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let prompt = app.state::<Prompt>(); let _operation = prompt.operation.lock().await;
            let visible = prompt.state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.visible;
            let pet_visible = app.get_webview_window(crate::pet::LABEL).is_some_and(|window| window.is_visible().unwrap_or(false));
            let result = match shortcut_action(dictate, visible, pet_visible) {
                ShortcutAction::ClosePrompt => app.emit_to(LABEL, COMMAND, "close").map_err(|error| error.to_string()),
                ShortcutAction::HidePet => crate::pet::hide(&app),
                ShortcutAction::Show => show(&app, dictate),
            };
            if let Err(error) = result { let _ = app.emit_to("main", COMMAND, error); }
        });
    }).build())?;
    Ok(())
}
#[tauri::command]
pub async fn prompt_enable(app: AppHandle, window: WebviewWindow, root: String, enabled: bool) -> Result<(), String> {
    from_window(&window, &["main"])?;
    let prompt = app.state::<Prompt>(); let _operation = prompt.operation.lock().await;
    let root_changed = prompt.state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.root != root;
    if enabled {
        let vault = app.state::<std::sync::RwLock<crate::VaultState>>();
        if vault.read().unwrap_or_else(|p| p.into_inner()).vault()?.root() != root { return Err("The vault changed.".into()); }
        let doc = document(&app, &root)?;
        let mut state = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
        if root_changed { state.snapshot = Snapshot { root: root.clone(), ..Snapshot::default() }; }
        state.snapshot.document = doc;
        state.issued.insert(root); state.enabled = true;
    } else {
        let mut state = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
        if state.snapshot.root != root { return Ok(()); }
        state.enabled = false; state.snapshot.visible = false;
    }
    publish(&app)?;
    if root_changed && let Some(window) = app.get_webview_window(LABEL) { window.hide().map_err(|error| error.to_string())?; }
    // Each registration belongs to this plugin; never unregister another feature's shortcuts.
    if !enabled {
        app.global_shortcut().unregister_multiple([TEXT_SHORTCUT, VOICE_SHORTCUT]).map_err(|error| error.to_string())?;
        if let Some(prompt) = app.get_webview_window(LABEL) { prompt.hide().map_err(|error| error.to_string())?; }
    } else {
        for shortcut in [TEXT_SHORTCUT, VOICE_SHORTCUT] {
            if !app.global_shortcut().is_registered(shortcut) {
                app.global_shortcut().register(shortcut).map_err(|_| format!("Spike couldn’t register {shortcut}. Another app may use it. Clicking Spike still opens the prompt."))?;
            }
        }
    }
    publish(&app)?; Ok(())
}
#[tauri::command]
pub fn prompt_publish(app: AppHandle, window: WebviewWindow, root: String, status: Status) -> Result<(), String> {
    from_window(&window, &["main"])?; current(&app, &root)?;
    if status.label.len() > 2000 || status.reply.len() > 8000 { return Err("The quick prompt status is too long.".into()); }
    let changed = app.state::<Prompt>().state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.status.glass != status.glass;
    if changed && let Some(prompt) = app.get_webview_window(LABEL) { apply_surface(&prompt, status.glass)?; }
    app.state::<Prompt>().state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.status = status;
    publish(&app)?; Ok(())
}
#[tauri::command]
pub fn prompt_state(app: AppHandle, window: WebviewWindow) -> Result<Snapshot, String> {
    from_window(&window, &["main", LABEL])?;
    Ok(snapshot(&app))
}
#[tauri::command]
pub async fn prompt_save(app: AppHandle, window: WebviewWindow, root: String, revision: u64, draft: String) -> Result<Document, String> {
    from_window(&window, &[LABEL])?;
    let prompt = app.state::<Prompt>(); let runtime = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
    // A queued save may finish for a previously opened vault; it never changes the new vault.
    if !runtime.issued.contains(&root) { return Err("This prompt does not belong to an opened vault.".into()); }
    drop(runtime);
    let doc = document(&app, &root)?;
    if doc.pending.is_some() { return Err("Wait for the current prompt before editing it.".into()); }
    let next = persist(&app, &root, &Document { revision, draft, pending: None })?;
    update_document(&app, &root, next.clone())?; Ok(next)
}
#[tauri::command]
pub async fn prompt_submit(app: AppHandle, window: WebviewWindow, root: String, revision: u64, id: String) -> Result<(), String> {
    from_window(&window, &[LABEL])?; current(&app, &root)?;
    let mut doc = document(&app, &root)?;
    if let Some(pending) = &mut doc.pending {
        if pending.id != id { return Err("Another prompt is waiting. Your text is retained.".into()); }
        pending.error = None;
    } else { doc.pending = Some(Capture { id, text: doc.draft.clone(), error: None }); }
    doc.revision = revision;
    update_document(&app, &root, persist(&app, &root, &doc)?)
}
#[tauri::command]
pub async fn prompt_finish(app: AppHandle, window: WebviewWindow, root: String, id: String, error: Option<String>) -> Result<(), String> {
    from_window(&window, &["main"])?;
    let mut doc = document(&app, &root)?;
    if doc.pending.as_ref().is_none_or(|pending| pending.id != id) { return Ok(()); }
    if let Some(error) = error { doc.pending.as_mut().unwrap().error = Some(error.chars().take(500).collect()); }
    else { doc.pending = None; doc.draft.clear(); }
    update_document(&app, &root, persist(&app, &root, &doc)?)
}
pub fn authorize_voice(app: &AppHandle, root: Option<&str>) -> Result<(), String> {
    let root = root.ok_or("The quick prompt has no vault.")?; current(app, root)?;
    let prompt = app.state::<Prompt>(); let state = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
    if !state.snapshot.visible || !state.snapshot.status.connected { return Err("Open and connect Spike before dictating.".into()); }
    Ok(())
}
fn apply_surface(window: &WebviewWindow, glass: bool) -> Result<(), String> {
    let effects = glass.then(|| EffectsBuilder::new().effect(Effect::HudWindow).state(EffectState::Active).radius(24.0).build());
    window.set_effects(effects).map_err(|error| error.to_string())
}
pub fn show(app: &AppHandle, dictate: bool) -> Result<(), String> {
    let root = app.state::<Prompt>().state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.root.clone();
    current(app, &root)?;
    let preview = cfg!(feature = "e2e") || std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_some();
    let main = app.get_webview_window("main").ok_or("The workspace is unavailable.")?;
    let prompt = match app.get_webview_window(LABEL) {
        Some(window) => window,
        None => {
            let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("prompt.html".into())).title("Ask Spike · Epizen")
            .inner_size(WIDTH, HEIGHT).resizable(false).maximizable(false).minimizable(false).decorations(false)
            .transparent(true).shadow(false).always_on_top(true).skip_taskbar(true).visible_on_all_workspaces(!preview)
            .focused(false).visible(false);
            // Child windows inherit the main preview's Space before being ordered on screen.
            // An app-level desktop-manager rule does not cover every borderless utility window.
            if preview { builder = builder.parent(&main).map_err(|error| error.to_string())?; }
            builder.build().map_err(|error| error.to_string())?
        }
    };
    apply_surface(&prompt, app.state::<Prompt>().state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.status.glass)?;
    let pet = crate::pet::for_prompt(app, &root)?;
    let monitor = pet.current_monitor().ok().flatten().ok_or("Spike’s display is unavailable.")?;
    // Preserve the dragged location, adjusting the pair only enough to fit the work area.
    position_pair(&pet, &prompt, &monitor)?;
    crate::pet::attach_prompt(app, true)?;
    crate::companion_display::show(&pet)?;
    { let prompt = app.state::<Prompt>(); let mut state = prompt.state.lock().unwrap_or_else(|p| p.into_inner()); state.snapshot.visible = true; state.snapshot.opened += 1; state.snapshot.dictate = dictate; }
    let _ = app.emit_to(crate::pet::LABEL, "epizen://pet-wake", ());
    publish(app)?; crate::companion_display::show(&prompt)?;
    if !preview { prompt.set_focus().map_err(|error| error.to_string())?; }
    Ok(())
}
/// Keep the two native windows together in physical pixels, including Retina and negative origins.
fn pair_positions(pet: (f64, f64), area: (f64, f64, f64, f64), scale: f64, prompt_height: f64) -> ((i32, i32), (i32, i32)) {
    let (left, top, width, height) = area;
    let offset = (WIDTH - crate::pet::WIDTH) * scale / 2.0;
    let anchor = crate::pet::PROMPT_ANCHOR * scale;
    let x = (pet.0 - offset).clamp(left, left + (width - WIDTH * scale).max(0.0));
    let y = pet.1.clamp(top, top + (height - anchor - prompt_height * scale).max(0.0));
    (((x + offset).round() as i32, y.round() as i32), (x.round() as i32, (y + anchor).round() as i32))
}
fn position_pair(pet: &WebviewWindow, prompt: &WebviewWindow, monitor: &tauri::Monitor) -> Result<(), String> {
    let position = pet.outer_position().map_err(|error| error.to_string())?;
    let area = monitor.work_area(); let scale = monitor.scale_factor();
    let height = prompt.inner_size().map_err(|error| error.to_string())?.height as f64 / prompt.scale_factor().map_err(|error| error.to_string())?;
    let (dog, input) = pair_positions((position.x as f64, position.y as f64), (area.position.x as f64, area.position.y as f64, area.size.width as f64, area.size.height as f64), scale, height);
    pet.set_position(PhysicalPosition::new(dog.0, dog.1)).map_err(|error| error.to_string())?;
    prompt.set_position(PhysicalPosition::new(input.0, input.1)).map_err(|error| error.to_string())
}
pub fn follow_pet(app: &AppHandle) -> Result<(), String> {
    let visible = app.state::<Prompt>().state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.visible;
    if visible && let (Some(pet), Some(prompt)) = (app.get_webview_window(crate::pet::LABEL), app.get_webview_window(LABEL)) {
        let monitor = pet.current_monitor().map_err(|error| error.to_string())?.ok_or("Spike’s display is unavailable.")?;
        position_pair(&pet, &prompt, &monitor)?;
    }
    Ok(())
}
pub async fn request_hide(app: &AppHandle) -> Result<(), String> {
    let prompt = app.state::<Prompt>(); let _operation = prompt.operation.lock().await;
    if prompt.state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.visible {
        // The renderer saves first. A failed save leaves both windows available for recovery.
        app.emit_to(LABEL, COMMAND, "close").map_err(|error| error.to_string())
    } else { crate::pet::hide(app) }
}
#[tauri::command]
pub async fn prompt_open(app: AppHandle, window: WebviewWindow, dictate: bool) -> Result<(), String> {
    from_window(&window, &["main", "spike", LABEL])?;
    let prompt = app.state::<Prompt>(); let _operation = prompt.operation.lock().await;
    show(&app, dictate)
}
#[tauri::command]
pub fn prompt_resize(window: WebviewWindow, height: f64) -> Result<(), String> {
    from_window(&window, &[LABEL])?;
    if !height.is_finite() { return Err("Invalid prompt size.".into()); }
    let height = height.clamp(56.0, 320.0);
    window.set_size(tauri::LogicalSize::new(WIDTH, height)).map_err(|error| error.to_string())?;
    follow_pet(window.app_handle())?;
    Ok(())
}
#[tauri::command]
pub async fn prompt_hide(app: AppHandle, window: WebviewWindow, opened: u64) -> Result<(), String> {
    from_window(&window, &[LABEL])?;
    let prompt = app.state::<Prompt>(); let _operation = prompt.operation.lock().await;
    { let prompt = app.state::<Prompt>(); let mut state = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
      if state.snapshot.opened != opened { return Ok(()); }
      state.snapshot.visible = false;
    }
    publish(&app)?; window.hide().map_err(|error| error.to_string())?;
    crate::pet::hide(&app)
}
#[tauri::command]
pub fn prompt_open_main(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    from_window(&window, &[LABEL])?;
    let root = app.state::<Prompt>().state.lock().unwrap_or_else(|p| p.into_inner()).snapshot.root.clone(); current(&app, &root)?;
    if let Some(main) = app.get_webview_window("main") {
        main.unminimize().map_err(|error| error.to_string())?; crate::companion_display::show(&main)?;
        if !cfg!(feature = "e2e") && std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_none() { main.set_focus().map_err(|error| error.to_string())?; }
        app.emit_to("main", crate::pet::COMMAND, serde_json::json!({"type":"open","root":root})).map_err(|error| error.to_string())?;
    }
    Ok(())
}
pub fn close(app: &AppHandle) { if let Some(window) = app.get_webview_window(LABEL) { let _ = window.destroy(); } }

#[tauri::command]
pub async fn prompt_flush(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    from_window(&window, &["main"])?;
    if app.get_webview_window(LABEL).is_none() { return Ok(()); }
    let prompt = app.state::<Prompt>(); let _operation = prompt.operation.lock().await;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    *prompt.flush.lock().unwrap_or_else(|p| p.into_inner()) = Some(sender);
    app.emit_to(LABEL, COMMAND, "flush").map_err(|error| error.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(5), receiver).await.map_err(|_| "The quick prompt hasn’t finished saving. Keep the app open and try again.")?.map_err(|_| "The quick prompt closed before saving.")?
}
#[tauri::command]
pub fn prompt_flushed(app: AppHandle, window: WebviewWindow, error: Option<String>) -> Result<(), String> {
    from_window(&window, &[LABEL])?;
    if let Some(sender) = app.state::<Prompt>().flush.lock().unwrap_or_else(|p| p.into_inner()).take() { let _ = sender.send(error.map_or(Ok(()), Err)); }
    Ok(())
}

#[tauri::command]
pub fn prompt_consumed(app: AppHandle, window: WebviewWindow, opened: u64) -> Result<(), String> {
    from_window(&window, &[LABEL])?;
    let prompt = app.state::<Prompt>(); let mut state = prompt.state.lock().unwrap_or_else(|p| p.into_inner());
    if state.snapshot.opened == opened { state.snapshot.dictate = false; }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn companion_windows_cannot_bypass_the_workspace_write_and_execution_boundary() {
        for command in ["write_note", "write_note_scoped", "create_note", "create_folder", "trash_note", "rename_note", "create_base", "write_base", "save_expense_photo", "fetch_image_into_vault", "calendar_create", "calendar_update", "calendar_delete", "assistant_respond", "assistant_show_workspace", "assistant_prepare_cover", "assistant_apply_note", "assistant_set_key", "voice_set_key", "update_settings", "get_settings", "apply_appearance", "read_all_notes", "prompt_finish"] {
            assert!(!command_allowed(LABEL, command), "{command}");
            assert!(!command_allowed(crate::pet::LABEL, command), "{command}");
            assert!(command_allowed("main", command));
        }
        assert!(command_allowed(LABEL, "assistant_transcribe"));
        assert!(command_allowed(LABEL, "prompt_submit"));
        assert!(command_allowed(crate::pet::LABEL, "prompt_open"));
        assert!(!command_allowed(crate::pet::LABEL, "assistant_transcribe"));
    }
    #[test]
    fn prompt_stays_centered_below_spike_on_retina_and_negative_displays() {
        let (dog, input) = pair_positions((1000.0, 600.0), (0.0, 50.0, 3456.0, 2100.0), 2.0, 64.0);
        assert_eq!(dog, (1000, 600));
        assert_eq!(input, (740, 912));
        let (dog, input) = pair_positions((-1500.0, 100.0), (-1920.0, 0.0, 1920.0, 1080.0), 1.0, 64.0);
        assert_eq!(dog, (-1500, 100)); assert_eq!(input, (-1630, 256));
    }
    #[test]
    fn pair_fits_edges_and_growing_feedback_without_separating() {
        for scale in [1.0, 2.0] {
            for height in [56.0, 96.0, 320.0] {
                for position in [(0.0, 0.0), (3400.0, 2100.0), (-10000.0, -10000.0)] {
                    let (dog, input) = pair_positions(position, (0.0, 50.0, 3456.0, 2100.0), scale, height);
                    assert!(dog.1 >= 50);
                    assert!(input.0 >= 0 && input.0 as f64 + WIDTH * scale <= 3456.0);
                    assert!(input.1 as f64 + height * scale <= 2150.0);
                    assert_eq!(input.1 - dog.1, (crate::pet::PROMPT_ANCHOR * scale) as i32);
                    assert_eq!(dog.0 - input.0, ((WIDTH - crate::pet::WIDTH) * scale / 2.0) as i32);
                }
            }
        }
    }
    #[test]
    fn captures_are_bounded_and_require_a_stable_identity() {
        let mut doc = Document { revision: 0, draft: "My request".into(), pending: Some(Capture { id: "request-1".into(), text: "My request".into(), error: None }) };
        assert!(validate_document(&doc).is_ok());
        doc.pending.as_mut().unwrap().id = "../outside".into(); assert!(validate_document(&doc).is_err());
        doc.pending = None; doc.draft = "x".repeat(40_001); assert!(validate_document(&doc).is_err());
    }
    #[test]
    fn typing_shortcut_hides_spike_even_without_an_open_prompt_and_dictation_still_opens() {
        assert_eq!(shortcut_action(false, false, true), ShortcutAction::HidePet);
        assert_eq!(shortcut_action(false, true, true), ShortcutAction::ClosePrompt);
        assert_eq!(shortcut_action(false, true, false), ShortcutAction::ClosePrompt);
        assert_eq!(shortcut_action(false, false, false), ShortcutAction::Show);
        for prompt in [true, false] { for pet in [true, false] {
            assert_eq!(shortcut_action(true, prompt, pet), ShortcutAction::Show);
        } }
    }
    #[test]
    fn prompt_hotkeys_are_distinct_from_each_other_and_the_sidebar() {
        let typing: tauri_plugin_global_shortcut::Shortcut = TEXT_SHORTCUT.parse().unwrap();
        let voice: tauri_plugin_global_shortcut::Shortcut = VOICE_SHORTCUT.parse().unwrap();
        let sidebar: tauri_plugin_global_shortcut::Shortcut = "Command+8".parse().unwrap();
        assert_ne!(typing.id(), voice.id()); assert_ne!(typing.id(), sidebar.id()); assert_ne!(voice.id(), sidebar.id());
        assert_eq!(shortcut_intent(&typing, ShortcutState::Pressed), Some(false));
        assert_eq!(shortcut_intent(&voice, ShortcutState::Pressed), Some(true));
        assert_eq!(shortcut_intent(&typing, ShortcutState::Released), None);
        assert_eq!(shortcut_intent(&voice, ShortcutState::Released), None);
        assert_eq!(shortcut_intent(&sidebar, ShortcutState::Pressed), None);
    }
}
