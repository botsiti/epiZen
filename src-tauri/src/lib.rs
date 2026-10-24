//! Epizen's backend. The frontend reaches the vault only through the commands below,
//! and none of them write to disk.

mod vault;

use std::ffi::OsString;
use std::path::PathBuf;

use serde::Serialize;
use tauri::State;
use tauri::ipc::Response;

pub use vault::{FileKind, Vault, VaultError, VaultFile};

#[cfg(all(feature = "e2e", not(debug_assertions)))]
compile_error!("the `e2e` feature opens a WebDriver port; build it in debug mode only");

/// The vault the app was started with, decided once at startup.
pub enum VaultState {
    /// Started without `--vault <folder>` or `EPIZEN_VAULT`.
    NoVault,
    Open(Vault),
    /// A folder was given but it couldn't be opened.
    Failed(String),
}

impl VaultState {
    /// `--vault <folder>` (or `--vault=<folder>`) wins over the `EPIZEN_VAULT` variable.
    /// An empty variable counts as unset.
    pub fn from_startup(args: impl IntoIterator<Item = OsString>, env: Option<OsString>) -> Self {
        let env = env.filter(|value| !value.is_empty()).map(PathBuf::from);
        match vault_arg(args).or(env) {
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
    Open { name: String },
    Error { message: String },
}

#[tauri::command]
fn vault_status(state: State<'_, VaultState>) -> VaultStatus {
    match state.inner() {
        VaultState::NoVault => VaultStatus::None,
        VaultState::Open(vault) => VaultStatus::Open { name: vault.name() },
        VaultState::Failed(message) => VaultStatus::Error {
            message: message.clone(),
        },
    }
}

#[tauri::command]
async fn list_files(state: State<'_, VaultState>) -> Result<Vec<VaultFile>, String> {
    state.vault()?.list_files().map_err(|err| err.to_string())
}

#[tauri::command]
async fn read_note(state: State<'_, VaultState>, path: String) -> Result<String, String> {
    state.vault()?.read_note(&path).map_err(|err| err.to_string())
}

#[tauri::command]
async fn read_image(state: State<'_, VaultState>, path: String) -> Result<Response, String> {
    let bytes = state.vault()?.read_image(&path).map_err(|err| err.to_string())?;
    Ok(Response::new(bytes))
}

pub fn run() {
    let state = VaultState::from_startup(std::env::args_os(), std::env::var_os("EPIZEN_VAULT"));
    let builder = tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            vault_status,
            list_files,
            read_note,
            read_image
        ]);

    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Epizen");
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
        );
        assert!(matches!(state, VaultState::Open(_)));
        assert_eq!(
            vault_arg(args(&["epizen", &format!("--vault={path}")])),
            Some(PathBuf::from(path))
        );
    }

    #[test]
    fn falls_back_to_env_then_to_no_vault() {
        let dir = tempfile::tempdir().unwrap();
        let from_env = VaultState::from_startup(args(&["epizen"]), Some(dir.path().into()));
        assert!(matches!(from_env, VaultState::Open(_)));
        assert!(matches!(
            VaultState::from_startup(args(&["epizen"]), None),
            VaultState::NoVault
        ));
        assert!(matches!(
            VaultState::from_startup(args(&["epizen"]), Some("".into())),
            VaultState::NoVault
        ));
    }

    #[test]
    fn a_bad_vault_path_is_an_error_not_an_empty_vault() {
        let state = VaultState::from_startup(args(&["epizen", "--vault", "/no/such/vault"]), None);
        let VaultState::Failed(message) = &state else {
            panic!("expected Failed");
        };
        assert!(message.contains("/no/such/vault"), "{message}");
        assert_eq!(state.vault().unwrap_err(), *message);
    }
}
