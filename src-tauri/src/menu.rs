//! The macOS menu bar. Workspace items tell the page (`MENU_EVENT`); the page owns their state.
//! The page normally handles shortcut keys first. Menu accelerators also expose the commands
//! outside the webview. ⌘W closes a tab; ⇧⌘W closes the window through the save guard.

use tauri::menu::{
    AboutMetadata, HELP_SUBMENU_ID, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Sent to the page with the item's id as its payload.
pub const MENU_EVENT: &str = "epizen://menu";

const NEW_TAB: &str = "new-tab";
const CLOSE_TAB: &str = "close-tab";
const RIGHT_SIDEBAR: &str = "right-sidebar";
const SPIKE_SIDEBAR: &str = "spike-sidebar";
const LEFT_SIDEBAR: &str = "left-sidebar";
const COLLAPSE_FOLDERS: &str = "collapse-folders";
const NEW_NOTE: &str = "new-note";
const SETTINGS: &str = "settings";
const HOME: &str = "home";
const LIBRARY: &str = "library";
const TODAY: &str = "today";
const CLOSE_WINDOW: &str = "close-window";

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let info = app.package_info();
    let config = app.config();
    let about = AboutMetadata {
        name: Some(info.name.clone()),
        version: Some(info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };
    let separator = || PredefinedMenuItem::separator(app);
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about))?,
                    &MenuItem::with_id(app, SETTINGS, "Settings…", true, Some("CmdOrCtrl+,"))?,
                    &separator()?,
                    &PredefinedMenuItem::services(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &MenuItem::with_id(app, NEW_NOTE, "New Note", true, Some("CmdOrCtrl+N"))?,
                    &MenuItem::with_id(app, NEW_TAB, "New Tab", true, Some("CmdOrCtrl+T"))?,
                    &separator()?,
                    &MenuItem::with_id(app, CLOSE_TAB, "Close Tab", true, Some("CmdOrCtrl+W"))?,
                    &MenuItem::with_id(
                        app,
                        CLOSE_WINDOW,
                        "Close Window",
                        true,
                        Some("CmdOrCtrl+Shift+W"),
                    )?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &MenuItem::with_id(
                        app,
                        LEFT_SIDEBAR,
                        "Toggle Left Sidebar",
                        true,
                        Some("CmdOrCtrl+7"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        RIGHT_SIDEBAR,
                        "Toggle Right Sidebar",
                        true,
                        Some("CmdOrCtrl+9"),
                    )?,
                    &MenuItem::with_id(app, SPIKE_SIDEBAR, "Toggle Spike Sidebar", true, Some("CmdOrCtrl+8"))?,
                    &MenuItem::with_id(
                        app,
                        COLLAPSE_FOLDERS,
                        "Collapse All Folders",
                        true,
                        Some("Ctrl+3"),
                    )?,
                    &separator()?,
                    &MenuItem::with_id(app, HOME, "Home", true, Some("CmdOrCtrl+Shift+H"))?,
                    &MenuItem::with_id(app, LIBRARY, "Library", true, Some("CmdOrCtrl+Shift+L"))?,
                    &MenuItem::with_id(
                        app,
                        TODAY,
                        "Today's Daily Note",
                        true,
                        Some("CmdOrCtrl+Shift+D"),
                    )?,
                    &separator()?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                ],
            )?,
            &Submenu::with_id_and_items(
                app,
                WINDOW_SUBMENU_ID,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                ],
            )?,
            &Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "Help", true, &[])?,
        ],
    )
}

/// What a click on one of the items above (or its shortcut) does.
pub fn handle<R: Runtime>(app: &AppHandle<R>, id: &str) {
    // With the menu bar's panel in front, ⌘W closes the panel, not a tab behind it.
    if matches!(id, CLOSE_TAB | CLOSE_WINDOW)
        && app
            .get_webview_window(crate::tray::PANEL)
            .is_some_and(|panel| panel.is_focused().unwrap_or(false))
    {
        crate::tray::hide(app);
        return;
    }
    match id {
        NEW_TAB | CLOSE_TAB | LEFT_SIDEBAR | RIGHT_SIDEBAR | SPIKE_SIDEBAR | COLLAPSE_FOLDERS | NEW_NOTE
        | SETTINGS | HOME | LIBRARY | TODAY => {
            // A shortcut in the timer panel must not navigate the workspace behind it.
            if let Some(window) = app.get_webview_window("main")
                && window.is_focused().unwrap_or(false)
            {
                let _ = window.emit(MENU_EVENT, id);
            }
        }
        // Closing goes through the close guard, which waits for the editor's last save.
        CLOSE_WINDOW => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.close();
            }
        }
        _ => {}
    }
}
