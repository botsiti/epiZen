use tauri::{WebviewWindow, window::{Effect, EffectState, EffectsBuilder}};
#[tauri::command]
pub fn apply_appearance(window: WebviewWindow, glass: bool) -> Result<(), String> {
    if window.label() != "main" { return Err("Only the workspace may change its appearance.".into()); }
    window.set_effects(glass.then(|| EffectsBuilder::new().effect(Effect::HudWindow).state(EffectState::Active).radius(12.0).build())).map_err(|error| error.to_string())?;
    window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0))).map_err(|error| error.to_string())
}
