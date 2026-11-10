//! Dictation is independent of the assistant connection. Never fall back to another provider.
use serde::{Deserialize, Serialize};
use tauri::State;
use super::{Assistant, ConnectionStatus, workspace_only};

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VoiceProvider { Local, Openai, Openrouter }
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct VoiceSettings { pub provider: VoiceProvider, pub model: String }

pub fn key(assistant: &Assistant, provider: VoiceProvider) -> Result<Option<String>, String> {
    if provider == VoiceProvider::Local { return Ok(None); }
    if provider == VoiceProvider::Openai { return assistant.key(); }
    #[cfg(any(test, feature = "e2e"))]
    { Ok(assistant.voice_key.lock().unwrap_or_else(|p| p.into_inner()).clone()) }
    #[cfg(all(not(any(test, feature = "e2e")), target_os = "macos"))]
    {
        match security_framework::passwords::get_generic_password("dev.epizen.desktop.voice", "openrouter") {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| "The voice key is unreadable. Set it again.".to_owned()),
            Err(error) if error.code() == -25300 => Ok(None),
            Err(_) => Err("Couldn’t access the voice key in macOS Keychain.".to_owned()),
        }
    }
    #[cfg(all(not(any(test, feature = "e2e")), not(target_os = "macos")))]
    { Err("Voice credentials require macOS Keychain.".to_owned()) }
}
fn set_key(assistant: &Assistant, provider: VoiceProvider, key: Option<String>) -> Result<(), String> {
    if provider == VoiceProvider::Local { return Err("On-device dictation does not use an API key.".to_owned()); }
    if provider == VoiceProvider::Openai { return assistant.set_key(key); }
    if let Some(value) = &key { super::validate_key(value)?; }
    #[cfg(any(test, feature = "e2e"))]
    { *assistant.voice_key.lock().unwrap_or_else(|p| p.into_inner()) = key; Ok(()) }
    #[cfg(all(not(any(test, feature = "e2e")), target_os = "macos"))]
    {
        let result = match key {
            Some(value) => security_framework::passwords::set_generic_password("dev.epizen.desktop.voice", "openrouter", value.as_bytes()),
            None => security_framework::passwords::delete_generic_password("dev.epizen.desktop.voice", "openrouter"),
        };
        match result {
            Ok(()) => Ok(()),
            Err(error) if error.code() == -25300 => Ok(()),
            Err(_) => Err("Couldn’t update the voice key in macOS Keychain.".to_owned()),
        }
    }
    #[cfg(all(not(any(test, feature = "e2e")), not(target_os = "macos")))]
    { Err("Voice credentials require macOS Keychain.".to_owned()) }
}
#[tauri::command]
pub async fn voice_connection(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, provider: VoiceProvider) -> Result<ConnectionStatus, String> {
    workspace_only(&window)?;
    Ok(ConnectionStatus { configured: provider == VoiceProvider::Local || key(&assistant, provider)?.is_some() })
}
#[tauri::command]
pub async fn voice_set_key(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, provider: VoiceProvider, key: Option<String>) -> Result<(), String> {
    workspace_only(&window)?;
    set_key(&assistant, provider, key.map(|key| key.trim().to_owned()))
}
pub fn validate_model(model: &str) -> Result<(), String> {
    if model.is_empty() || model.len() > 128 || !model.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._-/:".contains(&byte)) {
        return Err("Enter a valid transcription model identifier.".to_owned());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn providers_keep_credentials_separate_and_local_speech_never_uses_a_key() {
        let assistant = Assistant::default();
        set_key(&assistant, VoiceProvider::Openai, Some("openai-test-key".into())).unwrap();
        set_key(&assistant, VoiceProvider::Openrouter, Some("router-test-key".into())).unwrap();
        assert_eq!(key(&assistant, VoiceProvider::Openai).unwrap().as_deref(), Some("openai-test-key"));
        assert_eq!(key(&assistant, VoiceProvider::Openrouter).unwrap().as_deref(), Some("router-test-key"));
        assert_eq!(key(&assistant, VoiceProvider::Local).unwrap(), None);
        set_key(&assistant, VoiceProvider::Openrouter, None).unwrap();
        assert!(key(&assistant, VoiceProvider::Openai).unwrap().is_some());
        assert!(set_key(&assistant, VoiceProvider::Openrouter, Some("bad\r\nkey".into())).is_err());
    }
    #[test]
    fn model_names_accept_provider_prefixes_but_cannot_inject_multipart_headers() {
        assert!(validate_model("microsoft/mai-transcribe-2").is_ok());
        for model in ["", "a\r\nb", "name\"", "name with spaces"] { assert!(validate_model(model).is_err()); }
    }
}
