//! The macOS menu bar. It is Tauri's default menu with one change: ⌘W closes the tab in front, as
//! in Obsidian, and the window closes with ⇧⌘W. The tab items only tell the page (`MENU_EVENT`);
//! the page keeps the tabs. Most of the time the page sees ⌘T and ⌘W as keys first and the menu
//! never does; the menu is there for when it does, and so the shortcuts can be found.

use tauri::menu::{
    AboutMetadata, HELP_SUBMENU_ID, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Sent to the page with the item's id as its payload.
pub const MENU_EVENT: &str = "epizen://menu";

const NEW_TAB: &str = "new-tab";
const CLOSE_TAB: &str = "close-tab";
const RIGHT_SIDEBAR: &str = "right-sidebar";
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
                        RIGHT_SIDEBAR,
                        "Toggle Right Sidebar",
                        true,
                        Some("CmdOrCtrl+Alt+B"),
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
        NEW_TAB | CLOSE_TAB | RIGHT_SIDEBAR => {
            let _ = app.emit(MENU_EVENT, id);
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
