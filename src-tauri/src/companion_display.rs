//! Companion display selection. CoreGraphics points are logical global coordinates on macOS;
//! Tao's cursor_position returns scaled pixels, which monitor_from_point cannot consume.
use tauri::{Monitor, WebviewWindow};

#[cfg(target_os = "macos")]
fn pointer() -> Option<(f64, f64)> {
    #[repr(C)] struct Point { x: f64, y: f64 }
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventCreate(source: *const std::ffi::c_void) -> *const std::ffi::c_void;
        fn CGEventGetLocation(event: *const std::ffi::c_void) -> Point;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" { fn CFRelease(value: *const std::ffi::c_void); }
    // SAFETY: a newly created event is owned here and released once after reading its location.
    unsafe {
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() { return None; }
        let point = CGEventGetLocation(event); CFRelease(event);
        Some((point.x, point.y))
    }
}
#[cfg(not(target_os = "macos"))]
fn pointer() -> Option<(f64, f64)> { None }

pub fn select(main: &WebviewWindow, preview: bool) -> Result<Monitor, String> {
    if !preview && let Some((x,y)) = pointer()
        && let Ok(Some(monitor)) = main.monitor_from_point(x,y) { return Ok(monitor); }
    if let Ok(Some(monitor)) = main.current_monitor() { return Ok(monitor); }
    // A hidden window can temporarily have no current screen. Its verified coordinates still
    // identify the preview display; previews must never fall back to an unrelated display.
    let monitors = main.available_monitors().map_err(|error| error.to_string())?;
    if let Ok(position) = main.outer_position()
        && let Some(monitor) = monitors.iter().find(|m| contains((position.x as f64, position.y as f64), (m.position().x, m.position().y), (m.size().width, m.size().height))) { return Ok(monitor.clone()); }
    if !preview {
        if let Ok(Some(monitor)) = main.primary_monitor() { return Ok(monitor); }
        if let Some(monitor) = monitors.into_iter().next() { return Ok(monitor); }
    }
    Err("Spike couldn’t locate its display. Move Epizen onto an available display and try again.".into())
}
fn contains(point: (f64,f64), origin: (i32,i32), size: (u32,u32)) -> bool {
    point.0 >= origin.0 as f64 && point.1 >= origin.1 as f64
        && point.0 < origin.0 as f64 + size.0 as f64 && point.1 < origin.1 as f64 + size.1 as f64
}
/// AppKit can detach a borderless child when it is hidden. Reattach before every
/// preview opening so it stays on the main preview's assigned Space.
pub fn show(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if cfg!(feature = "e2e") || std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_some() {
        use tauri::Manager;
        let main = window.app_handle().get_webview_window("main").ok_or("The preview workspace is unavailable.")?;
        let child = window.clone();
        let (send, receive) = std::sync::mpsc::sync_channel(1);
        window.run_on_main_thread(move || {
            let result = (|| {
                use objc2_app_kit::{NSWindow, NSWindowOrderingMode};
                let parent = main.ns_window().map_err(|error| error.to_string())?;
                let raw = child.ns_window().map_err(|error| error.to_string())?;
                // SAFETY: both handles are live Tauri windows; this closure runs on AppKit's main thread.
                unsafe {
                    let parent = &*parent.cast::<NSWindow>();
                    let native = &*raw.cast::<NSWindow>();
                    if child.label() != "main" {
                        if let Some(previous) = native.parentWindow() { previous.removeChildWindow(native); }
                        parent.addChildWindow_ordered(native, NSWindowOrderingMode::Above);
                    }
                    // Tauri show() makes a window key, which can pull a hidden preview to the
                    // active Space. Order it without activation or keyboard focus instead.
                    native.orderFrontRegardless();
                }
                Ok::<(), String>(())
            })();
            let _ = send.send(result);
        }).map_err(|error| error.to_string())?;
        return receive.recv_timeout(std::time::Duration::from_secs(5)).map_err(|_| "The preview could not be shown without activation.".to_owned())?;
    }
    window.show().map_err(|error| error.to_string())
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn display_bounds_handle_retina_negative_origins_and_edges() {
        assert!(contains((3000.,1800.), (0,0), (3456,2234)));
        assert!(contains((-1600.,100.), (-1920,0), (1920,1080)));
        assert!(!contains((0.,100.), (-1920,0), (1920,1080)));
        assert!(!contains((f64::NAN,0.), (0,0), (3456,2234)));
    }
}
