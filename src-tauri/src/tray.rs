//! The menu bar item, as Senioro has one: a small ring and, while a focus round runs, its time and
//! the task's category (`00:37 code`), `rest 4:12` while resting, the ring alone when nothing runs.
//! A click opens the panel (`tray.html`) under it.
//!
//! The timer is the main window's (`useTimer`), and stays there. The window publishes what the item
//! and the panel show (`tray_publish`); the panel's buttons go back to it as commands
//! (`tray_command`), which its timer applies as if they were its own. Nothing here writes a note.
//!
//! The title ticks here, on a thread of its own, from the round's timing: WebKit holds a hidden
//! window's timers back, and the item has to keep time while the window is hidden, minimised or
//! behind others. When a round or a rest runs out, the window is told to look (`DUE_EVENT`), so it
//! doesn't wait for its own held-back tick to write the round and start the rest.

use std::sync::{Arc, Condvar, Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::Value;
use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// The panel's window label, and the main window's.
pub const PANEL: &str = "tray";
pub const MAIN: &str = "main";
/// To the main window: a command from one of the panel's buttons, as the panel sent it.
const COMMAND_EVENT: &str = "epizen://tray-command";
/// To the main window: the round or the rest it published has run out.
const DUE_EVENT: &str = "epizen://timer-due";
/// To the panel: what the main window published for it.
const STATE_EVENT: &str = "epizen://tray-state";
/// To the panel: it has just been shown.
const SHOWN_EVENT: &str = "epizen://tray-shown";

/// The panel's size, in points.
const PANEL_WIDTH: f64 = 360.0;
const PANEL_HEIGHT: f64 = 600.0;
/// Space between the menu bar and the panel, and between the panel and the screen's edge.
const PANEL_GAP: f64 = 6.0;
/// The item's ring, in pixels: drawn at 2×, macOS shows it 18 points high.
const ICON_SIZE: u32 = 36;
/// A click on the item this soon after the panel hid on losing focus is the click that hid it.
const REOPEN_GUARD: Duration = Duration::from_millis(400);
/// How long the title's thread sleeps when the title can't change before the next publish.
const IDLE_WAIT: Duration = Duration::from_secs(60);

/// What the item's title is made from: the main window's timer, as `trayClock` in
/// `src/lib/tray.ts` publishes it. Times are milliseconds since the epoch.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Clock {
    #[default]
    Idle,
    /// A focus round: focus counted is `accumulated`, plus the time since `since` unless paused.
    /// A pomodoro counts down from `planned` seconds; the stopwatch counts up.
    #[serde(rename_all = "camelCase")]
    Focus {
        label: String,
        accumulated: i64,
        since: i64,
        paused: bool,
        #[serde(default)]
        planned: Option<i64>,
    },
    #[serde(rename_all = "camelCase")]
    Rest { ends_at: i64 },
}

/// Focus counted by `now`, in milliseconds, as `elapsed` in `src/lib/timer.ts` counts it.
fn focused(accumulated: i64, since: i64, paused: bool, now: i64) -> i64 {
    accumulated + if paused { 0 } else { (now - since).max(0) }
}

/// Senioro's menu bar time: `00:37`, `24:59`, `1:02:05`.
fn padded(seconds: i64) -> String {
    let (h, m, s) = (seconds / 3600, seconds % 3600 / 60, seconds % 60);
    if h > 0 { format!("{h}:{m:02}:{s:02}") } else { format!("{m:02}:{s:02}") }
}

/// The timer card's time: `4:12`, `1:02:05`.
fn short(seconds: i64) -> String {
    let (h, m, s) = (seconds / 3600, seconds % 3600 / 60, seconds % 60);
    if h > 0 { format!("{h}:{m:02}:{s:02}") } else { format!("{m}:{s:02}") }
}

/// What the item shows beside its ring at `now`: `00:37 code` while focusing (time left in a
/// pomodoro, time so far on the stopwatch), `paused 00:37`, `rest 4:12`, or nothing.
pub fn title(clock: &Clock, now: i64) -> Option<String> {
    match clock {
        Clock::Idle => None,
        Clock::Focus { label, accumulated, since, paused, planned } => {
            let seconds = focused(*accumulated, *since, *paused, now).max(0) / 1000;
            let shown = planned.map_or(seconds, |planned| (planned - seconds).max(0));
            Some(if *paused { format!("paused {}", padded(shown)) } else { format!("{} {label}", padded(shown)) })
        }
        Clock::Rest { ends_at } => {
            let left = ((ends_at - now).max(0) + 999) / 1000;
            (left > 0).then(|| format!("rest {}", short(left)))
        }
    }
}

/// How long until the title changes, or `None` when only a new publish can change it.
pub fn next_change(clock: &Clock, now: i64) -> Option<Duration> {
    let ms = match clock {
        Clock::Idle | Clock::Focus { paused: true, .. } => return None,
        Clock::Focus { accumulated, since, planned, .. } => {
            let counted = focused(*accumulated, *since, false, now).max(0);
            // A pomodoro at 00:00 stays there until the window starts the rest.
            if planned.is_some_and(|planned| counted >= planned * 1000) {
                return None;
            }
            1000 - counted % 1000
        }
        Clock::Rest { ends_at } => {
            let left = ends_at - now;
            if left <= 0 {
                return None;
            }
            (left - 1) % 1000 + 1
        }
    };
    u64::try_from(ms).ok().map(Duration::from_millis)
}

/// True when a pomodoro's round or a rest has run out by `now`: the window has something to do.
pub fn due(clock: &Clock, now: i64) -> bool {
    match clock {
        Clock::Focus { accumulated, since, paused: false, planned: Some(planned), .. } => focused(*accumulated, *since, false, now) >= planned * 1000,
        Clock::Rest { ends_at } => now >= *ends_at,
        _ => false,
    }
}

/// A rectangle in AppKit's screen coordinates: points, the origin at the bottom left.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Where the panel's top left corner goes: centred under the item, a little below the menu bar,
/// and inside the screen's visible part with a margin.
pub fn panel_top_left(item: Frame, width: f64, screen: Frame) -> (f64, f64) {
    let left = (item.x + item.width / 2.0 - width / 2.0).min(screen.x + screen.width - width - PANEL_GAP).max(screen.x + PANEL_GAP);
    let top = item.y.min(screen.y + screen.height) - PANEL_GAP;
    (left, top)
}

/// What a click on the item does to the panel.
#[derive(Debug, PartialEq, Eq)]
pub enum Toggle {
    Show,
    Hide,
    /// The panel hid itself on this very click, losing focus to the menu bar: it stays hidden.
    Leave,
}

pub fn toggle(visible: bool, hidden_at: Option<Instant>, now: Instant) -> Toggle {
    if visible {
        Toggle::Hide
    } else if hidden_at.is_some_and(|at| now.saturating_duration_since(at) < REOPEN_GUARD) {
        Toggle::Leave
    } else {
        Toggle::Show
    }
}

/// The item's icon, `size` pixels square, RGBA: the timer's ring with its dot at the top and a
/// little air around the dot, black on clear. macOS tints it for the menu bar (a template image).
pub fn ring(size: u32) -> Vec<u8> {
    let s = f64::from(size);
    let (c, radius, half_width, dot) = (s / 2.0, s * 0.32, s * 0.045, s * 0.12);
    let air = dot + s * 0.06;
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            // Four by four samples a pixel, for soft edges.
            let mut hits = 0u32;
            for sy in 0..4 {
                for sx in 0..4 {
                    let px = f64::from(x) + (f64::from(sx) + 0.5) / 4.0;
                    let py = f64::from(y) + (f64::from(sy) + 0.5) / 4.0;
                    let from_centre = (px - c).hypot(py - c);
                    let from_dot = (px - c).hypot(py - (c - radius));
                    let on_ring = (from_centre - radius).abs() <= half_width && from_dot > air;
                    if on_ring || from_dot <= dot {
                        hits += 1;
                    }
                }
            }
            rgba[((y * size + x) * 4 + 3) as usize] = (hits * 255 / 16) as u8;
        }
    }
    rgba
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| i64::try_from(since.as_millis()).unwrap_or(i64::MAX))
}

/// The last thing the main window published.
#[derive(Default)]
struct Published {
    /// Counts publishes, so the title's thread knows when to look again.
    version: u64,
    clock: Clock,
    tooltip: String,
    /// What the panel shows, as the main window shaped it (`PanelView` in `src/lib/tray.ts`).
    panel: Value,
}

#[derive(Default)]
pub struct Tray {
    published: Arc<(Mutex<Published>, Condvar)>,
    icon: OnceLock<TrayIcon>,
    /// When the panel last hid, for `toggle`.
    hidden_at: Mutex<Option<Instant>>,
}

/// Makes the item and starts its title's thread. The `Tray` state must already be managed.
/// An error leaves the app without the item, never without the app: the caller only reports it.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let icon = TrayIconBuilder::with_id("epizen")
        .icon(Image::new_owned(ring(ICON_SIZE), ICON_SIZE, ICON_SIZE))
        .icon_as_template(true)
        .tooltip("Epizen")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|icon, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                clicked(icon.app_handle(), icon);
            }
        })
        .build(app)?;
    #[cfg(target_os = "macos")]
    mac::steady_digits(&icon);
    let tray = app.state::<Tray>();
    let published = Arc::clone(&tray.published);
    let _ = tray.icon.set(icon.clone());
    let app = app.clone();
    std::thread::Builder::new().name("epizen-tray".into()).spawn(move || keep_time(&app, &icon, &published))?;
    Ok(())
}

/// The title's thread: sets the title whenever it changes, and tells the main window once when
/// what it published runs out. It sleeps to the next second the title turns over, or until the
/// next publish.
fn keep_time(app: &AppHandle, icon: &TrayIcon, published: &(Mutex<Published>, Condvar)) {
    let (lock, publish) = published;
    let mut shown: Option<String> = None;
    let mut told: Option<u64> = None;
    let mut guard = lock.lock().unwrap_or_else(PoisonError::into_inner);
    loop {
        let (version, clock) = (guard.version, guard.clock.clone());
        drop(guard);
        let now = now_ms();
        let next = title(&clock, now);
        if next != shown {
            // A space keeps the time off the ring, as Senioro has it.
            let _ = icon.set_title(Some(next.as_deref().map(|text| format!(" {text}")).unwrap_or_default()));
            shown = next;
        }
        if due(&clock, now) && told != Some(version) {
            told = Some(version);
            let _ = app.emit_to(MAIN, DUE_EVENT, ());
        }
        // A few milliseconds past the turn, so the clock reads the new second.
        let wait = next_change(&clock, now).map_or(IDLE_WAIT, |wait| wait + Duration::from_millis(5));
        guard = lock.lock().unwrap_or_else(PoisonError::into_inner);
        guard = match publish.wait_timeout_while(guard, wait, |published| published.version == version) {
            Ok((guard, _)) => guard,
            Err(poisoned) => poisoned.into_inner().0,
        };
    }
}

fn clicked(app: &AppHandle, icon: &TrayIcon) {
    let panel = app.get_webview_window(PANEL);
    let visible = panel.as_ref().is_some_and(|panel| panel.is_visible().unwrap_or(false));
    let hidden_at = *app.state::<Tray>().hidden_at.lock().unwrap_or_else(PoisonError::into_inner);
    match toggle(visible, hidden_at, Instant::now()) {
        Toggle::Hide => hide(app),
        Toggle::Leave => {}
        Toggle::Show => match panel.map_or_else(|| build_panel(app), Ok) {
            Ok(panel) => show(app, icon, &panel),
            Err(err) => eprintln!("Epizen couldn't open its menu bar panel: {err}"),
        },
    }
}

/// The panel's window, made on its first opening and only hidden after.
fn build_panel(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let panel = WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("tray.html".into()))
        .title("Epizen")
        .inner_size(PANEL_WIDTH, PANEL_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .theme(Some(Theme::Dark))
        // The system's dark glass under the page's own tint, cut to the page's corners.
        .effects(EffectsBuilder::new().effect(Effect::HudWindow).state(EffectState::Active).radius(14.0).build())
        .visible(false)
        .build()?;
    #[cfg(target_os = "macos")]
    mac::panel_window(&panel);
    Ok(panel)
}

fn show(app: &AppHandle, icon: &TrayIcon, panel: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    if let Some((item, screen)) = mac::item_frames(icon) {
        mac::move_to(panel, panel_top_left(item, PANEL_WIDTH, screen));
    }
    #[cfg(not(target_os = "macos"))]
    let _ = icon;
    let _ = panel.show();
    let _ = panel.set_focus();
    let _ = app.emit_to(PANEL, SHOWN_EVENT, ());
}

/// Hides the panel: on losing focus, on Escape or ⌘W, and on its buttons that leave it.
pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(panel) = app.get_webview_window(PANEL)
        && panel.is_visible().unwrap_or(false)
    {
        *app.state::<Tray>().hidden_at.lock().unwrap_or_else(PoisonError::into_inner) = Some(Instant::now());
        let _ = panel.hide();
    }
}

/// Closes the panel's window for good, once the main window has gone: with no window left, the
/// app quits, as it did before it had a panel.
pub fn close<R: Runtime>(app: &AppHandle<R>) {
    if let Some(panel) = app.get_webview_window(PANEL) {
        let _ = panel.destroy();
    }
}

#[derive(Deserialize)]
pub struct Publish {
    clock: Clock,
    tooltip: String,
    panel: Value,
}

/// The main window's timer, for the item's title and the panel.
#[tauri::command]
pub fn tray_publish(app: AppHandle, tray: State<'_, Tray>, status: Publish) {
    let (lock, publish) = &*tray.published;
    let retitled = {
        let mut published = lock.lock().unwrap_or_else(PoisonError::into_inner);
        published.version += 1;
        published.clock = status.clock;
        published.panel = status.panel.clone();
        let retitled = published.tooltip != status.tooltip;
        published.tooltip = status.tooltip.clone();
        retitled
    };
    publish.notify_all();
    if retitled && let Some(icon) = tray.icon.get() {
        let _ = icon.set_tooltip(Some(&status.tooltip));
    }
    let _ = app.emit_to(PANEL, STATE_EVENT, status.panel);
}

/// What the panel shows, as last published; `null` before the main window has published.
#[tauri::command]
pub fn tray_state(tray: State<'_, Tray>) -> Value {
    tray.published.0.lock().unwrap_or_else(PoisonError::into_inner).panel.clone()
}

/// One of the panel's buttons, for the main window's timer to apply (`readCommand` there).
#[tauri::command]
pub fn tray_command(app: AppHandle, command: Value) -> Result<(), String> {
    app.emit_to(MAIN, COMMAND_EVENT, command).map_err(|err| err.to_string())
}

/// Brings the main window to the front, out of the Dock if it was minimised.
#[tauri::command]
pub fn tray_open_main(app: AppHandle) {
    hide(&app);
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

#[tauri::command]
pub fn tray_hide(app: AppHandle) {
    hide(&app);
}

/// Quits as ⌘Q does: through the close guard, which waits for the editor's last save.
#[tauri::command]
pub fn tray_quit(app: AppHandle) {
    hide(&app);
    app.exit(0);
}

/// The few things Tauri doesn't reach on macOS: the title's digits, and the panel's place.
#[cfg(target_os = "macos")]
mod mac {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSFont, NSFontWeightRegular, NSWindow, NSWindowCollectionBehavior};
    use objc2_foundation::{NSPoint, NSRect};
    use tauri::WebviewWindow;
    use tauri::tray::TrayIcon;

    use super::Frame;

    fn frame(rect: NSRect) -> Frame {
        Frame { x: rect.origin.x, y: rect.origin.y, width: rect.size.width, height: rect.size.height }
    }

    /// The title in the menu bar's font with tabular digits, so the item doesn't change width
    /// as the seconds go by.
    pub fn steady_digits(icon: &TrayIcon) {
        let _ = icon.with_inner_tray_icon(|inner| {
            let Some(mtm) = MainThreadMarker::new() else { return };
            let Some(button) = inner.ns_status_item().and_then(|item| item.button(mtm)) else { return };
            let size = NSFont::menuBarFontOfSize(0.0).pointSize();
            // SAFETY: a constant AppKit exports.
            let font = NSFont::monospacedDigitSystemFontOfSize_weight(size, unsafe { NSFontWeightRegular });
            button.setFont(Some(&font));
        });
    }

    /// The item's frame and the visible part of its screen.
    pub fn item_frames(icon: &TrayIcon) -> Option<(Frame, Frame)> {
        icon.with_inner_tray_icon(|inner| {
            let mtm = MainThreadMarker::new()?;
            let window = inner.ns_status_item()?.button(mtm)?.window()?;
            let screen = window.screen()?;
            Some((frame(window.frame()), frame(screen.visibleFrame())))
        })
        .ok()
        .flatten()
    }

    /// Runs `f` on the panel's NSWindow, on the main thread, where both callers already are.
    fn with_window(panel: &WebviewWindow, f: impl FnOnce(&NSWindow)) {
        if MainThreadMarker::new().is_none() {
            return;
        }
        if let Ok(window) = panel.ns_window() {
            // SAFETY: Tauri hands out its own live NSWindow, and this is the main thread.
            f(unsafe { &*window.cast::<NSWindow>() });
        }
    }

    /// A panel, not a window: over full-screen apps too, out of Mission Control and the Window menu.
    pub fn panel_window(panel: &WebviewWindow) {
        with_window(panel, |window| {
            window.setCollectionBehavior(
                window.collectionBehavior()
                    | NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::FullScreenAuxiliary
                    | NSWindowCollectionBehavior::Transient,
            );
            window.setExcludedFromWindowsMenu(true);
        });
    }

    pub fn move_to(panel: &WebviewWindow, (left, top): (f64, f64)) {
        with_window(panel, |window| window.setFrameTopLeftPoint(NSPoint::new(left, top)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AT: i64 = 1_798_000_000_000;

    fn stopwatch(accumulated: i64, since: i64, paused: bool) -> Clock {
        Clock::Focus { label: "code".into(), accumulated, since, paused, planned: None }
    }

    fn pomodoro(minutes: i64, since: i64) -> Clock {
        Clock::Focus { label: "study".into(), accumulated: 0, since, paused: false, planned: Some(minutes * 60) }
    }

    #[test]
    fn reads_the_clock_the_main_window_publishes() {
        let focus: Clock = serde_json::from_str(r#"{"kind":"focus","label":"code","accumulated":5000,"since":10,"paused":false,"planned":1500}"#).unwrap();
        assert_eq!(focus, Clock::Focus { label: "code".into(), accumulated: 5000, since: 10, paused: false, planned: Some(1500) });
        let stopwatch: Clock = serde_json::from_str(r#"{"kind":"focus","label":"focus","accumulated":0,"since":10,"paused":true}"#).unwrap();
        assert!(matches!(stopwatch, Clock::Focus { planned: None, paused: true, .. }));
        assert_eq!(serde_json::from_str::<Clock>(r#"{"kind":"rest","endsAt":42}"#).unwrap(), Clock::Rest { ends_at: 42 });
        assert_eq!(serde_json::from_str::<Clock>(r#"{"kind":"idle"}"#).unwrap(), Clock::Idle);
    }

    #[test]
    fn counts_the_stopwatch_up_and_a_pomodoro_down() {
        assert_eq!(title(&stopwatch(0, AT, false), AT + 37_400).as_deref(), Some("00:37 code"));
        assert_eq!(title(&stopwatch(60_000, AT, false), AT + 3_725_000).as_deref(), Some("1:03:05 code"));
        assert_eq!(title(&pomodoro(25, AT), AT).as_deref(), Some("25:00 study"));
        assert_eq!(title(&pomodoro(25, AT), AT + 999).as_deref(), Some("25:00 study"));
        assert_eq!(title(&pomodoro(25, AT), AT + 1000).as_deref(), Some("24:59 study"));
        // Past its round, a pomodoro waits at zero for the window to start the rest.
        assert_eq!(title(&pomodoro(25, AT), AT + 26 * 60_000).as_deref(), Some("00:00 study"));
    }

    #[test]
    fn holds_still_while_paused_and_shows_the_rest_then_nothing() {
        let paused = stopwatch(37_900, AT, true);
        assert_eq!(title(&paused, AT + 600_000).as_deref(), Some("paused 00:37"));
        let rest = Clock::Rest { ends_at: AT + 252_000 };
        assert_eq!(title(&rest, AT).as_deref(), Some("rest 4:12"));
        assert_eq!(title(&rest, AT + 1).as_deref(), Some("rest 4:12"));
        assert_eq!(title(&rest, AT + 1000).as_deref(), Some("rest 4:11"));
        assert_eq!(title(&rest, AT + 252_000), None);
        assert_eq!(title(&Clock::Idle, AT), None);
    }

    #[test]
    fn sleeps_to_the_next_turn_of_the_title() {
        assert_eq!(next_change(&stopwatch(0, AT, false), AT + 37_400), Some(Duration::from_millis(600)));
        assert_eq!(next_change(&stopwatch(0, AT, false), AT + 37_000), Some(Duration::from_millis(1000)));
        assert_eq!(next_change(&Clock::Rest { ends_at: AT + 252_000 }, AT + 400), Some(Duration::from_millis(600)));
        assert_eq!(next_change(&Clock::Rest { ends_at: AT + 252_000 }, AT), Some(Duration::from_millis(1000)));
        assert_eq!(next_change(&stopwatch(0, AT, true), AT), None);
        assert_eq!(next_change(&Clock::Idle, AT), None);
        assert_eq!(next_change(&pomodoro(25, AT), AT + 25 * 60_000), None);
        assert_eq!(next_change(&Clock::Rest { ends_at: AT }, AT), None);
    }

    #[test]
    fn knows_when_a_round_or_a_rest_has_run_out() {
        assert!(!due(&pomodoro(25, AT), AT + 25 * 60_000 - 1));
        assert!(due(&pomodoro(25, AT), AT + 25 * 60_000));
        assert!(!due(&stopwatch(0, AT, false), AT + 10 * 3_600_000));
        let paused = Clock::Focus { label: "code".into(), accumulated: 0, since: AT, paused: true, planned: Some(60) };
        assert!(!due(&paused, AT + 120_000));
        assert!(due(&Clock::Rest { ends_at: AT }, AT));
        assert!(!due(&Clock::Idle, AT));
    }

    #[test]
    fn puts_the_panel_under_the_item_and_on_the_screen() {
        let screen = Frame { x: 0.0, y: 0.0, width: 1512.0, height: 944.0 };
        let item = Frame { x: 1200.0, y: 945.0, width: 80.0, height: 37.0 };
        assert_eq!(panel_top_left(item, 360.0, screen), (1060.0, 938.0));
        // Near the right edge it stays on the screen.
        let edge = Frame { x: 1480.0, ..item };
        assert_eq!(panel_top_left(edge, 360.0, screen), (1146.0, 938.0));
        // On a second screen to the left, its own edges count.
        let left = Frame { x: -1920.0, y: 0.0, width: 1920.0, height: 1055.0 };
        assert_eq!(panel_top_left(Frame { x: -1910.0, y: 1055.0, width: 30.0, height: 25.0 }, 360.0, left), (-1914.0, 1049.0));
    }

    #[test]
    fn a_click_opens_or_closes_the_panel_but_never_reopens_it_as_it_hides() {
        let now = Instant::now();
        assert_eq!(toggle(false, None, now), Toggle::Show);
        assert_eq!(toggle(true, None, now), Toggle::Hide);
        assert_eq!(toggle(false, Some(now), now + Duration::from_millis(120)), Toggle::Leave);
        assert_eq!(toggle(false, Some(now), now + Duration::from_secs(2)), Toggle::Show);
    }

    #[test]
    fn draws_a_ring_with_its_dot_on_top() {
        let pixels = ring(ICON_SIZE);
        let alpha = |x: u32, y: u32| pixels[((y * ICON_SIZE + x) * 4 + 3) as usize];
        assert_eq!(pixels.len(), (ICON_SIZE * ICON_SIZE * 4) as usize);
        // Black only: macOS gives it its colour.
        assert!(pixels.chunks(4).all(|px| px[..3] == [0, 0, 0]));
        assert_eq!(alpha(18, 18), 0, "the middle is clear");
        assert_eq!(alpha(0, 0), 0, "so are the corners");
        assert_eq!(alpha(18, 29), 255, "the ring's foot is solid");
        assert_eq!(alpha(18, 6), 255, "so is the dot");
        // Air between the dot and the ring beside it.
        assert_eq!(alpha(23, 7), 0);
    }
}
