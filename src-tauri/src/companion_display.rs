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
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn display_bounds_handle_retina_negative_origins_and_edges() {
        assert!(contains((3000.,1800.), (0,0), (3456,2234)));
        assert!(contains((-1600.,100.), (-1920,0), (1920,1080)));
        assert!(!contains((0.,100.), (-1920,0), (1920,1080)));
        assert!(!contains((f64::NAN,0.), (0,0), (3456,2234)));
    }
}
