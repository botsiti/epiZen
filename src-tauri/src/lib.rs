//! Epizen's backend. The frontend reaches the vault only through the commands below. Three of
//! them write: `create_note` and `write_note`, both in `vault.rs`, and `fetch_image_into_vault`,
//! which saves a cover through `Vault::create_file`. The lookups (`lookup_json`, `lookup_image`
//! and that one) are the only network access, in `net.rs`. The `calendar_*` commands reach
//! Apple Calendar, through `calendar.rs`, and never the vault.

mod calendar;
#[cfg(target_os = "macos")]
mod eventkit;
#[cfg(target_os = "macos")]
mod menu;
mod net;
mod settings;
mod vault;

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::RwLock;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::ipc::Response;
use tauri::{Emitter, Manager, RunEvent, State, WindowEvent};

pub use calendar::{Access, CalendarInfo, Calendars, Event, EventChange, MemoryCalendars, NewEvent, Occurrence};
pub use net::{Net, NetError, store_image};
pub use settings::Settings;
pub use vault::{FileKind, NoteText, Vault, VaultError, VaultFile};

#[cfg(all(feature = "e2e", not(debug_assertions)))]
compile_error!("the `e2e` feature opens a WebDriver port; build it in debug mode only");

/// The open vault: the one the app was started with, until the user picks another folder.
pub enum VaultState {
    /// Started without `--vault <folder>`, `EPIZEN_VAULT` or a vault from last time.
    NoVault,
    Open(Vault),
    /// A folder was given but it couldn't be opened.
    Failed(String),
}

impl VaultState {
    /// `--vault <folder>` (or `--vault=<folder>`) wins over the `EPIZEN_VAULT` variable, and
    /// both over the vault opened last time. An empty variable counts as unset.
    pub fn from_startup(
        args: impl IntoIterator<Item = OsString>,
        env: Option<OsString>,
        last: Option<PathBuf>,
    ) -> Self {
        let env = env.filter(|value| !value.is_empty()).map(PathBuf::from);
        match vault_arg(args).or(env).or(last) {
            None => Self::NoVault,
            Some(path) => match Vault::open(&path) {
                Ok(vault) => Self::Open(vault),
                Err(err) => Self::Failed(format!("Couldn't open the vault: {err}")),
            },
        }
    }

    fn vault(&self) -> Result<&Vault, String> {
        match self {
            Self::Open(vault) => Ok(vault),
            Self::NoVault => Err("no vault is open".to_owned()),
            Self::Failed(message) => Err(message.clone()),
        }
    }
}

fn vault_arg(args: impl IntoIterator<Item = OsString>) -> Option<PathBuf> {
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if arg == "--vault" {
            return args.next().map(PathBuf::from);
        }
        if let Some(value) = arg.to_str().and_then(|arg| arg.strip_prefix("--vault=")) {
            return Some(PathBuf::from(value));
        }
    }
    None
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
enum VaultStatus {
    None,
    /// `root` tells two vaults with one name apart, so the timer never writes into the wrong one.
    Open { name: String, root: String },
    Error { message: String },
}

impl From<&VaultState> for VaultStatus {
    fn from(state: &VaultState) -> Self {
        match state {
            VaultState::NoVault => Self::None,
            VaultState::Open(vault) => Self::Open { name: vault.name(), root: vault.root() },
            VaultState::Failed(message) => Self::Error {
                message: message.clone(),
            },
        }
    }
}

type Shared<'a> = State<'a, RwLock<VaultState>>;

/// Runs `f` on the open vault. A poisoned lock still holds a whole `VaultState`.
fn with_vault<T>(
    state: Shared<'_>,
    f: impl FnOnce(&Vault) -> Result<T, VaultError>,
) -> Result<T, String> {
    let guard = state
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    f(guard.vault()?).map_err(|err| err.to_string())
}

#[tauri::command]
fn vault_status(state: Shared<'_>) -> VaultStatus {
    VaultStatus::from(
        &*state
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner()),
    )
}

/// Shows the system's folder picker and opens the folder the user picks, remembering it for
/// next time. The picker runs here, not in the page, so the page can never name a folder for
/// the app to read and write. `None` when the user cancels; a folder that can't be opened
/// leaves the current vault open.
#[tauri::command]
async fn pick_vault(
    app: tauri::AppHandle,
    state: Shared<'_>,
    settings: State<'_, Settings>,
) -> Result<Option<VaultStatus>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Open a vault")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|err| err.to_string())?;
    open_vault(&state, &settings, path).map(Some)
}

fn open_vault(
    state: &RwLock<VaultState>,
    settings: &Settings,
    path: PathBuf,
) -> Result<VaultStatus, String> {
    let vault = Vault::open(&path).map_err(|err| format!("Couldn't open the vault: {err}"))?;
    let status = VaultStatus::Open { name: vault.name(), root: vault.root() };
    // Remembered first: if that fails, the vault that was open stays open, as the error says.
    settings
        .set_last_vault(&path)
        .map_err(|err| format!("Couldn't remember the vault: {err}"))?;
    *state
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = VaultState::Open(vault);
    Ok(status)
}

#[tauri::command]
async fn list_files(state: Shared<'_>) -> Result<Vec<VaultFile>, String> {
    with_vault(state, Vault::list_files)
}

#[tauri::command]
async fn read_note(state: Shared<'_>, path: String) -> Result<String, String> {
    with_vault(state, |vault| vault.read_note(&path))
}

#[tauri::command]
async fn read_all_notes(state: Shared<'_>) -> Result<Vec<NoteText>, String> {
    with_vault(state, Vault::read_all_notes)
}

#[tauri::command]
async fn read_image(state: Shared<'_>, path: String) -> Result<Response, String> {
    with_vault(state, |vault| vault.read_image(&path)).map(Response::new)
}

#[tauri::command]
async fn create_note(state: Shared<'_>, path: String, text: String) -> Result<(), String> {
    with_vault(state, |vault| vault.create_note(&path, &text))
}

#[tauri::command]
async fn write_note(
    state: Shared<'_>,
    path: String,
    text: String,
    expected: String,
) -> Result<(), String> {
    with_vault(state, |vault| vault.write_note(&path, &text, &expected))
}

/// A search or a details page from one of the lookup services, as JSON.
#[tauri::command]
async fn lookup_json(net: State<'_, Net>, url: String) -> Result<Value, String> {
    net.json(&url).await.map_err(|err| err.to_string())
}

/// A cover to show in the search results. Nothing is saved.
#[tauri::command]
async fn lookup_image(net: State<'_, Net>, url: String) -> Result<Response, String> {
    net.image(&url).await.map(Response::new).map_err(|err| err.to_string())
}

/// Downloads a cover and saves it as a new file at `path` (its extension set by what the image
/// is), never over an existing one. Returns the path it was saved at.
#[tauri::command]
async fn fetch_image_into_vault(
    net: State<'_, Net>,
    state: Shared<'_>,
    url: String,
    path: String,
) -> Result<String, String> {
    let bytes = net.image(&url).await.map_err(|err| err.to_string())?;
    let guard = state
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    net::store_image(guard.vault()?, &path, &bytes).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_settings(settings: State<'_, Settings>) -> Map<String, Value> {
    settings.load()
}

#[tauri::command]
async fn update_settings(
    settings: State<'_, Settings>,
    patch: Map<String, Value>,
) -> Result<Map<String, Value>, String> {
    if patch.keys().any(|key| Settings::is_private(key)) {
        return Err("only opening a vault sets which vault opens next time".to_owned());
    }
    settings.update(patch).map_err(|err| err.to_string())
}

/// Apple Calendar, or the e2e build's calendars in memory, so a test never reaches the real ones.
type Calendar<'a> = State<'a, Box<dyn Calendars>>;

fn calendars() -> Box<dyn Calendars> {
    if cfg!(feature = "e2e") {
        return Box::new(MemoryCalendars::demo());
    }
    #[cfg(target_os = "macos")]
    return Box::new(eventkit::EventKit::new());
    // EventKit is macOS's: elsewhere there are no calendars to use.
    #[cfg(not(target_os = "macos"))]
    return Box::new(MemoryCalendars::new(Access::Denied, Vec::new(), Vec::new()));
}

#[tauri::command]
async fn calendar_access(calendar: Calendar<'_>) -> Result<Access, String> {
    Ok(calendar.access())
}

/// Shows the system's prompt the first time, and waits for the answer.
#[tauri::command]
async fn calendar_request_access(calendar: Calendar<'_>) -> Result<Access, String> {
    Ok(calendar.request_access())
}

#[tauri::command]
async fn calendar_list(calendar: Calendar<'_>) -> Result<Vec<CalendarInfo>, String> {
    calendar.calendars()
}

#[tauri::command]
async fn calendar_events(calendar: Calendar<'_>, from: i64, to: i64) -> Result<Vec<Event>, String> {
    calendar.events(from, to)
}

#[tauri::command]
async fn calendar_create(calendar: Calendar<'_>, event: NewEvent) -> Result<Event, String> {
    calendar.create(&event)
}

#[tauri::command]
async fn calendar_update(calendar: Calendar<'_>, at: Occurrence, change: EventChange) -> Result<Event, String> {
    calendar.update(&at, &change)
}

#[tauri::command]
async fn calendar_delete(calendar: Calendar<'_>, at: Occurrence) -> Result<(), String> {
    calendar.delete(&at)
}

/// Opens System Settings at Privacy & Security, Calendars: the only place a refusal is undone.
#[tauri::command]
fn calendar_open_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars")
        .spawn()
        .map_err(|err| err.to_string())?;
    Ok(())
}

/// Closing waits for the editor's last save. Once the frontend can listen (`guarded`), a close or
/// quit is held and the frontend is asked to save; it lets go with `close_now` (`done`).
#[derive(Default)]
struct Closing {
    /// Listeners the page has open; StrictMode and hot reload open and close them out of order.
    guarded: AtomicUsize,
    done: AtomicBool,
}

const CLOSE_REQUESTED: &str = "epizen://close-requested";

impl Closing {
    /// True when this close should wait for the frontend.
    fn hold(&self) -> bool {
        self.guarded.load(Ordering::SeqCst) > 0 && !self.done.load(Ordering::SeqCst)
    }
}

#[tauri::command]
fn guard_close(closing: State<'_, Closing>, on: bool) {
    if on {
        closing.guarded.fetch_add(1, Ordering::SeqCst);
    } else {
        let _ = closing
            .guarded
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1));
    }
}

#[tauri::command]
fn close_now(app: tauri::AppHandle, closing: State<'_, Closing>) {
    closing.done.store(true, Ordering::SeqCst);
    app.exit(0);
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Closing::default())
        .manage(calendars())
        .manage(Net::new().expect("couldn't set up the lookups' HTTP client"))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && window.state::<Closing>().hold()
            {
                api.prevent_close();
                let _ = window.emit(CLOSE_REQUESTED, ());
            }
        })
        .setup(|app| {
            // Tests point this at a temporary folder, so they never read or change real settings.
            let dir = match std::env::var_os("EPIZEN_CONFIG_DIR").filter(|dir| !dir.is_empty()) {
                Some(dir) => PathBuf::from(dir),
                None => app.path().app_config_dir()?,
            };
            let settings = Settings::new(dir);
            let state = VaultState::from_startup(
                std::env::args_os(),
                std::env::var_os("EPIZEN_VAULT"),
                settings.last_vault(),
            );
            app.manage(RwLock::new(state));
            app.manage(settings);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_status,
            pick_vault,
            list_files,
            read_note,
            read_all_notes,
            read_image,
            create_note,
            write_note,
            lookup_json,
            lookup_image,
            fetch_image_into_vault,
            get_settings,
            update_settings,
            guard_close,
            close_now,
            calendar_access,
            calendar_request_access,
            calendar_list,
            calendar_events,
            calendar_create,
            calendar_update,
            calendar_delete,
            calendar_open_settings
        ]);

    // ⌘W closes a tab (src/lib/tabs.ts), not the window.
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle(app, event.id().as_ref()));

    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .build(tauri::generate_context!())
        .expect("error while building Epizen")
        .run(|app, event| {
            // Cmd+Q and the app menu's Quit come here, not through the window.
            if let RunEvent::ExitRequested { api, .. } = event
                && app.state::<Closing>().hold()
            {
                api.prevent_exit();
                let _ = app.emit(CLOSE_REQUESTED, ());
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
    }

    #[test]
    fn reads_the_vault_from_args_before_env() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        let state = VaultState::from_startup(
            args(&["epizen", "--vault", path]),
            Some("/nowhere".into()),
            Some("/nowhere/either".into()),
        );
        assert!(matches!(state, VaultState::Open(_)));
        assert_eq!(
            vault_arg(args(&["epizen", &format!("--vault={path}")])),
            Some(PathBuf::from(path))
        );
    }

    #[test]
    fn falls_back_to_env_then_to_last_time_then_to_no_vault() {
        let dir = tempfile::tempdir().unwrap();
        let from_env = VaultState::from_startup(
            args(&["epizen"]),
            Some(dir.path().into()),
            Some("/x".into()),
        );
        assert!(matches!(from_env, VaultState::Open(_)));
        let from_last = VaultState::from_startup(args(&["epizen"]), None, Some(dir.path().into()));
        assert!(matches!(from_last, VaultState::Open(_)));
        assert!(matches!(
            VaultState::from_startup(args(&["epizen"]), None, None),
            VaultState::NoVault
        ));
        assert!(matches!(
            VaultState::from_startup(args(&["epizen"]), Some("".into()), None),
            VaultState::NoVault
        ));
    }

    #[test]
    fn a_bad_vault_path_is_an_error_not_an_empty_vault() {
        let state =
            VaultState::from_startup(args(&["epizen", "--vault", "/no/such/vault"]), None, None);
        let VaultState::Failed(message) = &state else {
            panic!("expected Failed");
        };
        assert!(message.contains("/no/such/vault"), "{message}");
        assert_eq!(state.vault().unwrap_err(), *message);
    }
}
