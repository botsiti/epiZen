use crate::Settings;
use serde_json::Value;
use tauri::{State, Window, window::Color};

#[tauri::command]
pub fn get_appearance(settings: State<'_, Settings>) -> Option<Value> {
    settings.load().remove("appearance")
}

// The main NSWindow (including its native title bar) always has an opaque backing.
// Glass panes and local wallpaper are composited inside the workspace webview.
#[tauri::command]
pub fn apply_appearance(window: Window, background: [u8; 3]) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the workspace may change its appearance.".into());
    }
    let [red, green, blue] = background;
    window.set_background_color(Some(Color(red, green, blue, 255))).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_title_bar_uses_opaque_workspace_backing_in_production_and_previews() {
        for config in [include_str!("../tauri.conf.json"), include_str!("../tauri.e2e.conf.json")] {
            let config: Value = serde_json::from_str(config).unwrap();
            let workspace = config["app"]["windows"].as_array().unwrap().iter()
                .find(|window| window["label"] == "main").unwrap();
            assert!(!workspace["transparent"].as_bool().unwrap_or(false));
            assert_eq!(workspace["backgroundColor"], "#121416");
            // Transparent title chrome exposes the NSWindow color above the webview.
            assert_eq!(workspace["titleBarStyle"], "Transparent");
        }
    }
}
