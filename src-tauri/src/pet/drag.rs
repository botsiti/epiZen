//! Track one primary-button gesture in AppKit's global point space. WebKit may stop
//! delivering pointer moves when a borderless, non-key panel moves under the mouse.
use tauri::{Manager, WebviewWindow};
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "macos")]
use objc2_foundation::{NSPoint, NSRect, NSSize};

/// The grab offset is measured from the top-left in WebKit. AppKit uses a
/// bottom-left origin. Keep both in points, including fractional Retina points.
#[cfg(target_os = "macos")]
fn drag_origin(mouse: NSPoint, offset: NSPoint, window: NSSize, area: NSRect) -> NSPoint {
    let x = mouse.x - offset.x;
    let y = mouse.y + offset.y - window.height;
    NSPoint::new(
        x.clamp(area.origin.x, area.origin.x + (area.size.width - window.width).max(0.0)),
        y.clamp(area.origin.y, area.origin.y + (area.size.height - window.height).max(0.0)),
    )
}

struct Gesture<'a>(&'a AtomicBool);
impl Drop for Gesture<'_> {
    fn drop(&mut self) { self.0.store(false, Ordering::Release); }
}

#[tauri::command]
pub async fn pet_drag(window: WebviewWindow, x: f64, y: f64) -> Result<bool, String> {
    super::pet_only(&window)?;
    if !(0.0..=super::WIDTH).contains(&x) || !(0.0..=super::HEIGHT).contains(&y) {
        return Err("The drag must begin on Spike.".into());
    }
    let pet = window.state::<super::Pet>();
    if pet.dragging.swap(true, Ordering::AcqRel) { return Ok(true); }
    let _gesture = Gesture(&pet.dragging);
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSEvent, NSScreen, NSWindow};
        let offset = NSPoint::new(x, y);
        let preview = cfg!(feature = "e2e") || std::env::var_os("EPIZEN_PREVIEW_DESKTOP_ONLY").is_some();
        let mut origin = None;
        let mut dragged = false;
        loop {
            let panel = window.clone();
            let (send, receive) = tokio::sync::oneshot::channel();
            window.run_on_main_thread(move || {
                let sample = (|| -> Result<_, String> {
                    let mtm = objc2::MainThreadMarker::new().ok_or("Spike needs its window thread.")?;
                    let raw = panel.ns_window().map_err(|e| e.to_string())?;
                    // SAFETY: Tauri owns this live NSWindow, used only in this main-thread callback.
                    let native = unsafe { &*raw.cast::<NSWindow>() };
                    let frame = native.frame();
                    let start = origin.unwrap_or(frame.origin);
                    let held = NSEvent::pressedMouseButtons() & 1 != 0;
                    if !native.isVisible() { return Ok((start, false, true, false)); }
                    if !held && origin.is_none() { return Ok((start, false, false, false)); }
                    let mouse = NSEvent::mouseLocation();
                    let anchor = NSPoint::new(start.x + offset.x, start.y + frame.size.height - offset.y);
                    let moved = dragged || (mouse.x - anchor.x).hypot(mouse.y - anchor.y) >= 4.0;
                    if !moved { return Ok((start, held, false, false)); }
                    // CGPoint values here are logical AppKit points on every display, even
                    // across a Retina/non-Retina boundary or a negative display origin.
                    let screen = if preview { native.screen() } else {
                        NSScreen::screens(mtm).iter().find(|screen| {
                            let bounds = screen.frame();
                            (bounds.origin.x..bounds.origin.x + bounds.size.width).contains(&mouse.x)
                                && (bounds.origin.y..bounds.origin.y + bounds.size.height).contains(&mouse.y)
                        }).or_else(|| native.screen())
                    }.ok_or("Spike’s display is unavailable.")?;
                    let next = drag_origin(mouse, offset, frame.size, screen.visibleFrame());
                    let changed = next != frame.origin;
                    if changed { native.setFrameOrigin(next); }
                    Ok((start, held, true, changed))
                })();
                let _ = send.send(sample);
            }).map_err(|e| e.to_string())?;
            let (start, held, moved, changed) = receive.await.map_err(|_| "Spike’s window closed.")??;
            origin = Some(start);
            dragged |= moved;
            if changed { crate::prompt::follow_pet(window.app_handle())?; }
            if !held {
                if dragged { super::remember_position(window.app_handle()); }
                return Ok(dragged);
            }
            tokio::time::sleep(std::time::Duration::from_millis(16)).await;
        }
    }
    #[cfg(not(target_os = "macos"))]
    Err("Moving Spike requires macOS.".into())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    #[test]
    fn grab_offset_survives_window_movement_across_display_origins_and_clamps_at_edges() {
        let pet = NSSize::new(164.0, 144.0);
        let grab = NSPoint::new(70.5, 48.0);
        let retina = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1728.0, 1060.0));
        let external = NSRect::new(NSPoint::new(-1920.0, -120.0), NSSize::new(1920.0, 1080.0));
        assert_eq!(drag_origin(NSPoint::new(900.0, 800.0), grab, pet, retina), NSPoint::new(829.5, 704.0));
        assert_eq!(drag_origin(NSPoint::new(-400.0, 800.0), grab, pet, external), NSPoint::new(-470.5, 704.0));
        assert_eq!(drag_origin(NSPoint::new(-1918.0, -110.0), grab, pet, external), external.origin);
        assert_eq!(drag_origin(NSPoint::new(1720.0, 1059.0), grab, pet, retina), NSPoint::new(1564.0, 916.0));
    }
}
