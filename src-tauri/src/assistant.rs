//! The AI connection. Keys live in macOS Keychain; tests use an isolated in-memory credential.
//! API network bytes pass through net.rs; the Codex adapter owns its CLI lifecycle.
//! Model replies cannot directly execute Epizen native commands.
// Test builds use deterministic providers and must never discover real CLI credentials.
#[cfg_attr(any(test, feature = "e2e"), allow(dead_code))]
mod codex;
#[cfg_attr(any(test, feature = "e2e"), allow(dead_code))]
mod process;
#[cfg_attr(any(test, feature = "e2e"), allow(dead_code))]
mod speech;
pub mod voice;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{Manager, State, ipc::Response};
use crate::net::Net;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

fn workspace_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("Assistant requests are owned by the main workspace.".to_owned()) }
}

#[derive(Default)]
pub struct Assistant {
    writes: std::sync::Mutex<()>,
    requests: Mutex<Requests>,
    #[cfg(any(test, feature = "e2e"))]
    key: std::sync::Mutex<Option<String>>,
    #[cfg(any(test, feature = "e2e"))]
    voice_key: std::sync::Mutex<Option<String>>,
}
#[derive(Default)]
struct Requests { active: HashMap<String, Arc<Notify>>, cancelled: VecDeque<String> }
struct RequestGuard<'a> { assistant: &'a Assistant, id: String, cancel: Arc<Notify> }
impl Drop for RequestGuard<'_> {
    fn drop(&mut self) { self.assistant.requests.lock().unwrap_or_else(|p| p.into_inner()).active.remove(&self.id); }
}
#[tauri::command]
pub async fn assistant_read_note(window: tauri::WebviewWindow, state: State<'_, std::sync::RwLock<crate::VaultState>>, root: String, path: String) -> Result<String, String> {
    workspace_only(&window)?;
    let guard = state.read().unwrap_or_else(|p| p.into_inner());
    let vault = guard.vault()?;
    if vault.root() != root { return Err("The vault changed.".to_owned()); }
    vault.read_note(&path).map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn assistant_apply_note(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, state: State<'_, std::sync::RwLock<crate::VaultState>>, settings: State<'_, crate::Settings>, action: crate::assistant_writes::NoteAction) -> Result<String, String> {
    workspace_only(&window)?;
    let _write = assistant.writes.lock().unwrap_or_else(|p| p.into_inner());
    let guard = state.read().unwrap_or_else(|p| p.into_inner());
    crate::assistant_writes::apply_note(guard.vault()?, &settings, &action)
}
#[tauri::command]
pub async fn assistant_abandon_action(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, state: State<'_, std::sync::RwLock<crate::VaultState>>, settings: State<'_, crate::Settings>, root: String, id: String) -> Result<(), String> {
    workspace_only(&window)?;
    let _write = assistant.writes.lock().unwrap_or_else(|p| p.into_inner());
    let guard = state.read().unwrap_or_else(|p| p.into_inner());
    if guard.vault()?.root() != root { return Err("The vault changed.".to_owned()); }
    crate::assistant_writes::abandon(&settings, &root, &id)
}
#[tauri::command]
pub async fn assistant_list_chats(window: tauri::WebviewWindow, settings: State<'_, crate::Settings>, root: String) -> Result<Vec<Value>, String> {
    workspace_only(&window)?;
    settings.assistant_chats(&root).map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn assistant_search_chats(window: tauri::WebviewWindow, settings: State<'_, crate::Settings>, root: String, query: String, exclude_message: Option<String>) -> Result<Vec<Value>, String> {
    workspace_only(&window)?;
    settings.search_assistant_chats(&root, &query, exclude_message.as_deref()).map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn assistant_export_chat(app: tauri::AppHandle, window: tauri::WebviewWindow, settings: State<'_, crate::Settings>, name: String, text: String) -> Result<Option<String>, String> {
    workspace_only(&window)?;
    if name.len() > 240 || !name.ends_with(".md") || std::path::Path::new(&name).components().count() != 1 || text.len() > 40 * 1024 * 1024 { return Err("This conversation export is invalid or too large.".to_owned()); }
    #[cfg(not(feature = "e2e"))]
    let path = {
        use tauri_plugin_dialog::DialogExt;
        let _ = settings;
        let Some(selected) = app.dialog().file().set_file_name(&name).add_filter("Markdown", &["md"]).blocking_save_file() else { return Ok(None) };
        selected.into_path().map_err(|_| "Choose a local folder for the export.".to_owned())?
    };
    #[cfg(feature = "e2e")]
    let path = { let _ = app; settings.assistant_fixture_export_folder().map_err(|error| error.to_string())?.join(&name) };
    // The selected parent is a one-file export scope. Reuse Vault's atomic, no-clobber creation
    // without switching the application's open vault or bypassing its filesystem boundary.
    let parent = path.parent().ok_or("Choose an export folder.")?;
    let filename = path.file_name().and_then(|name| name.to_str()).ok_or("Choose a valid export filename.")?;
    let destination = crate::Vault::open(parent).map_err(|error| error.to_string())?;
    destination.create_note(filename, &text).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
#[tauri::command]
pub async fn assistant_load_chat(window: tauri::WebviewWindow, settings: State<'_, crate::Settings>, root: String, id: String) -> Result<Value, String> {
    workspace_only(&window)?;
    settings.assistant_chat(&root, &id).map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn assistant_save_chat(window: tauri::WebviewWindow, settings: State<'_, crate::Settings>, root: String, id: String, state: Value, expected_revision: u64) -> Result<u64, String> {
    workspace_only(&window)?;
    settings.save_assistant_chat(&root, &id, state, expected_revision).map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn assistant_has_message(window: tauri::WebviewWindow, settings: State<'_, crate::Settings>, root: String, id: String) -> Result<bool, String> {
    workspace_only(&window)?;
    settings.assistant_has_message(&root, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn assistant_apply_calendar(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, state: State<'_, std::sync::RwLock<crate::VaultState>>, settings: State<'_, crate::Settings>, calendars: State<'_, Box<dyn crate::Calendars>>, action: crate::assistant_writes::CalendarAction) -> Result<String, String> {
    workspace_only(&window)?;
    let _write = assistant.writes.lock().unwrap_or_else(|p| p.into_inner());
    let guard = state.read().unwrap_or_else(|p| p.into_inner());
    if guard.vault()?.root() != action.root { return Err("The vault changed. This event was not created.".to_owned()); }
    crate::assistant_writes::apply_calendar(calendars.as_ref(), &settings, &action)
}
#[derive(Serialize)]
pub struct ConnectionStatus { configured: bool }

impl Assistant {
    fn begin(&self, id: String) -> Result<RequestGuard<'_>, String> {
        if id.is_empty() || id.len() > 100 { return Err("Invalid assistant request identifier.".to_owned()); }
        let mut requests = self.requests.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(index) = requests.cancelled.iter().position(|item| item == &id) { requests.cancelled.remove(index); return Err("The assistant request was cancelled.".to_owned()); }
        if requests.active.contains_key(&id) || requests.active.len() >= 4 { return Err("An assistant request is already running.".to_owned()); }
        let cancel = Arc::new(Notify::new()); requests.active.insert(id.clone(), cancel.clone());
        Ok(RequestGuard { assistant: self, id, cancel })
    }
    fn cancel(&self, id: String) {
        if id.is_empty() || id.len() > 100 { return; }
        let mut requests = self.requests.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(cancel) = requests.active.get(&id) { cancel.notify_one(); }
        else { if requests.cancelled.len() == 128 { requests.cancelled.pop_front(); } requests.cancelled.push_back(id); }
    }
    fn key(&self) -> Result<Option<String>, String> {
        #[cfg(any(test, feature = "e2e"))]
        { Ok(self.key.lock().unwrap_or_else(|p| p.into_inner()).clone()) }
        #[cfg(all(not(any(test, feature = "e2e")), target_os = "macos"))]
        {
            match security_framework::passwords::get_generic_password("dev.epizen.desktop.assistant", "openai") {
                Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| "The stored AI credential is unreadable. Set it again.".to_owned()),
                Err(error) if error.code() == -25300 => Ok(None),
                Err(_) => Err("Couldn’t access the AI key in macOS Keychain. Unlock your keychain and try again.".to_owned()),
            }
        }
        #[cfg(all(not(any(test, feature = "e2e")), not(target_os = "macos")))]
        { Err("The assistant requires macOS Keychain.".to_owned()) }
    }
    fn set_key(&self, key: Option<String>) -> Result<(), String> {
        if let Some(ref value) = key { validate_key(value)?; }
        #[cfg(any(test, feature = "e2e"))]
        { *self.key.lock().unwrap_or_else(|p| p.into_inner()) = key; Ok(()) }
        #[cfg(all(not(any(test, feature = "e2e")), target_os = "macos"))]
        {
            let result = match key {
                Some(value) => security_framework::passwords::set_generic_password("dev.epizen.desktop.assistant", "openai", value.as_bytes()),
                None => security_framework::passwords::delete_generic_password("dev.epizen.desktop.assistant", "openai"),
            };
            match result {
                Ok(()) => Ok(()),
                Err(error) if error.code() == -25300 => Ok(()),
                Err(_) => Err("Couldn’t update the AI key in macOS Keychain.".to_owned()),
            }
        }
        #[cfg(all(not(any(test, feature = "e2e")), not(target_os = "macos")))]
        { Err("The assistant requires macOS Keychain.".to_owned()) }
    }
    fn required_key(&self) -> Result<String, String> { self.key()?.ok_or_else(|| "Connect your AI account in Spike’s settings first.".to_owned()) }
}
#[tauri::command]
pub fn assistant_cancel(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, request_id: String) -> Result<(), String> {
    if window.label() == crate::prompt::LABEL { assistant.cancel(format!("prompt:{request_id}")); }
    else { workspace_only(&window)?; assistant.cancel(request_id); }
    Ok(())
}

#[tauri::command]
pub async fn assistant_open_url(window: tauri::WebviewWindow, url: String) -> Result<(), String> {
    workspace_only(&window)?;
    let parsed = reqwest::Url::parse(&url).map_err(|_| "This link is invalid.".to_owned())?;
    if !matches!(parsed.scheme(), "https" | "http") || parsed.host_str().is_none() || !parsed.username().is_empty() || parsed.password().is_some() { return Err("Only normal web links can be opened.".to_owned()); }
    if cfg!(any(test, feature = "e2e")) { return Ok(()); }
    std::process::Command::new("/usr/bin/open").arg(parsed.as_str()).spawn().map(|_| ()).map_err(|_| "Couldn’t open your browser.".to_owned())
}
fn validate_key(value: &str) -> Result<(), String> {
    if !(12..=1024).contains(&value.len()) || !value.bytes().all(|byte| byte.is_ascii_graphic()) {
        return Err("Enter a valid API key without spaces or line breaks.".to_owned());
    }
    Ok(())
}

#[derive(Clone, Copy, Default, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider { #[default] Openai, Codex }

#[tauri::command]
pub async fn assistant_connection(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, provider: Option<Provider>) -> Result<ConnectionStatus, String> {
    workspace_only(&window)?;
    if provider.unwrap_or_default() == Provider::Codex {
        #[cfg(any(test, feature = "e2e"))]
        return Ok(ConnectionStatus { configured: true });
        #[cfg(not(any(test, feature = "e2e")))]
        return Ok(ConnectionStatus { configured: codex::status().await? });
    }
    Ok(ConnectionStatus { configured: assistant.key()?.is_some() })
}
#[tauri::command]
pub async fn assistant_set_key(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, key: Option<String>) -> Result<ConnectionStatus, String> {
    workspace_only(&window)?;
    assistant.set_key(key.map(|value| value.trim().to_owned()))?;
    Ok(ConnectionStatus { configured: assistant.key()?.is_some() })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentRequest {
    #[serde(default)]
    provider: Provider,
    model: String,
    #[serde(default = "default_effort")]
    effort: String,
    instructions: String,
    input: Vec<Value>,
    tools: Vec<Value>,
}
fn default_effort() -> String { "low".into() }
impl AgentRequest {
    fn body(&self) -> Result<Vec<u8>, String> {
        if !matches!(self.effort.as_str(), "low" | "medium" | "high" | "xhigh") { return Err("Choose a supported reasoning effort.".into()); }
        if self.model.is_empty() || self.model.len() > 128 || !self.model.bytes().all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b)) {
            return Err("Choose a valid model identifier.".to_owned());
        }
        if self.instructions.len() > 100_000 || self.input.is_empty() || self.input.len() > 400 || self.tools.len() > 40 {
            return Err("This conversation is too large. Start a new conversation.".to_owned());
        }
        let bytes = serde_json::to_vec(&json!({
            "model": self.model, "reasoning": {"effort": self.effort}, "instructions": self.instructions, "input": self.input,
            "tools": self.tools, "store": false, "parallel_tool_calls": false, "max_output_tokens": 5000,
            "include": ["reasoning.encrypted_content"],
        })).map_err(|_| "Couldn’t prepare this conversation.".to_owned())?;
        if bytes.len() > 1_000_000 { return Err("This conversation is too large. Start a new conversation.".to_owned()); }
        Ok(bytes)
    }
}
#[tauri::command]
pub async fn assistant_respond(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, net: State<'_, Net>, settings: State<'_, crate::Settings>, request: AgentRequest, request_id: String) -> Result<Value, String> {
    workspace_only(&window)?;
    let pending = assistant.begin(request_id.clone())?;
    let body = request.body()?;
    if request.provider == Provider::Codex {
        #[cfg(any(test, feature = "e2e"))]
        { let _ = settings; return fixtures::respond(&request); }
        #[cfg(not(any(test, feature = "e2e")))]
        return codex::respond(&request, &request_id, &pending.cancel, &settings.assistant_runtime_dir()).await;
    }
    let key = assistant.required_key()?;
    #[cfg(feature = "e2e")]
    if !key.is_empty() { return fixtures::respond(&request); }
    let bytes = net.assistant_post("responses", &key, "application/json", body, &pending.cancel).await?;
    serde_json::from_slice(&bytes).map_err(|_| "The AI service returned unreadable data.".to_owned())
}

fn audio_body(audio: &[u8], mime: &str, model: &str) -> Result<(String, Vec<u8>), String> {
    voice::validate_model(model)?;
    if audio.is_empty() || audio.len() > 20 * 1024 * 1024 { return Err("Record up to 20 MB of audio at a time.".to_owned()); }
    let (mime, extension) = match mime.split(';').next().unwrap_or("") {
        "audio/mp4" | "video/mp4" => ("audio/mp4", "m4a"),
        "audio/webm" | "video/webm" => ("audio/webm", "webm"),
        "audio/wav" | "audio/x-wav" => ("audio/wav", "wav"),
        "audio/ogg" => ("audio/ogg", "ogg"),
        _ => return Err("This microphone recording format is unsupported.".to_owned()),
    };
    let mut boundary = "epizen-audio-boundary".to_owned();
    while audio.windows(boundary.len()).any(|part| part == boundary.as_bytes()) { boundary.push('x'); }
    let mut body = format!("--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{model}\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"recording.{extension}\"\r\nContent-Type: {mime}\r\n\r\n").into_bytes();
    body.extend_from_slice(audio);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    Ok((format!("multipart/form-data; boundary={boundary}"), body))
}
#[tauri::command]
pub async fn assistant_transcribe(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, net: State<'_, Net>, settings: State<'_, crate::Settings>, request: AudioRequest, request_id: String) -> Result<String, String> {
    let request_id = if window.label() == crate::prompt::LABEL {
        crate::prompt::authorize_voice(window.app_handle(), request.root.as_deref())?;
        format!("prompt:{request_id}")
    } else { workspace_only(&window)?; request_id };
    let AudioRequest { audio, mime, provider, voice, root: _ } = request;
    let voice = voice.unwrap_or(voice::VoiceSettings { provider: if provider.unwrap_or_default() == Provider::Codex { voice::VoiceProvider::Local } else { voice::VoiceProvider::Openai }, model: "gpt-transcribe".to_owned() });
    let pending = assistant.begin(request_id)?;
    let (content_type, body) = audio_body(&audio, &mime, if voice.provider == voice::VoiceProvider::Local { "local" } else { &voice.model })?;
    #[cfg(feature = "e2e")]
    if audio.starts_with(b"EPIZEN_VOICE_FIXTURE") { return Ok("Remember that I prefer voice notes.".to_owned()); }
    if voice.provider == voice::VoiceProvider::Local {
        #[cfg(any(test, feature = "e2e"))]
        if std::env::var("EPIZEN_LOCAL_SPEECH_CHECK").as_deref() != Ok("1") {
            return Err("No local speech fixture was provided.".to_owned());
        }
        // Explicit local-only native verification can exercise Speech with generated audio.
        // Normal unit/CI runs stay fake; remote-provider I/O remains disabled in all test builds.
        return speech::transcribe(audio, mime, &pending.cancel, &settings.assistant_runtime_dir()).await;
    }
    let endpoint = if voice.provider == voice::VoiceProvider::Openrouter { "openrouter/transcriptions" } else { "audio/transcriptions" };
    let key = voice::key(&assistant, voice.provider)?.ok_or("Connect the selected voice provider in Spike’s settings first.")?;
    let bytes = net.assistant_post(endpoint, &key, &content_type, body, &pending.cancel).await?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "The transcription was unreadable.".to_owned())?;
    value["text"].as_str().map(str::to_owned).ok_or_else(|| "No speech was recognized in this recording.".to_owned())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AudioRequest { audio: Vec<u8>, mime: String, provider: Option<Provider>, voice: Option<voice::VoiceSettings>, root: Option<String> }

/// Deterministic provider for disposable native journeys. Never compiled into a production app.
#[cfg(any(test, feature = "e2e"))]
mod fixtures {
    use super::*;
    fn message(text: &str) -> Value { json!({ "output": [{ "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": text, "annotations": [] }] }] }) }
    pub fn respond(request: &AgentRequest) -> Result<Value, String> {
        let fixture: Value = serde_json::from_str(include_str!("../../test/fixtures/assistant/scenarios.json")).map_err(|_| "Invalid assistant fixture.".to_owned())?;
        let users: Vec<&str> = request.input.iter().filter(|item| item["role"] == "user").filter_map(|item| item["content"].as_str()).collect();
        let user = users.last().copied().unwrap_or(""); let lower = user.to_lowercase();
        let call = |name: &str, arguments: Value| json!({ "output": [{ "type": "function_call", "call_id": format!("fixture-{name}-{}", request.input.len()), "name": name, "arguments": arguments.to_string() }] });
        if lower.contains("simulate offline") { return Err("Fixture provider is offline.".to_owned()); }
        if let Some(last) = request.input.last().filter(|item| item["type"] == "function_call_output") {
            let result: Value = serde_json::from_str(last["output"].as_str().unwrap_or("{}")).unwrap_or(Value::Null);
            if result["error"].is_string() { return Ok(message(&format!("I couldn’t complete that action: {}", result["error"].as_str().unwrap_or_default()))); }
            if result["value"]["saved"] == true { return Ok(message(&format!("Saved. {}", result["value"]["description"].as_str().unwrap_or_default()))); }
            if lower.contains("previous conversations") {
                let found = result["value"].as_array().and_then(|items| items.iter().find(|item| item["role"] == "user" && item["excerpt"].as_str().is_some_and(|text| text.contains("missed a deadline"))));
                return Ok(message(&found.map(|item| format!("In an earlier conversation, you said: {}", item["excerpt"].as_str().unwrap_or_default())).unwrap_or_else(|| "I couldn’t find that earlier conversation.".to_owned())));
            }
            if lower.contains("schedule") {
                let calendar = result["value"].as_array().and_then(|items| items.iter().find(|item| item["writable"] == true)).and_then(|item| item["id"].as_str()).ok_or("No fixture calendar.")?;
                let mut event = fixture["calendar"].clone(); event["calendar"] = json!(calendar); return Ok(call("create_event", event));
            }
            return Ok(message("The requested change was declined. Your notes are unchanged."));
        }
        if lower.contains("previous conversations") { return Ok(call("search_conversations", json!({ "query": "missed deadline" }))); }
        if lower.starts_with("create a note") { return Ok(call("create_note", fixture["ordinaryNote"].clone())); }
        if lower.contains("watched") { return Ok(call("add_media", fixture["movie"].clone())); }
        if lower.starts_with("remember") { return Ok(call("remember", json!({ "text": user.trim_start_matches("Remember ").trim_start_matches("remember ") }))); }
        if lower.contains("my preferences") {
            return Ok(message(if request.instructions.contains("short replies") { "You prefer short replies. That preference is in your profile note." } else { "I don’t have a saved preference about that yet." }));
        }
        if lower.contains("save this thought record") { return Ok(call("save_thought_record", fixture["thoughtRecord"].clone())); }
        if lower.contains("thought record") || lower.contains("cbt") { return Ok(message("We can work through this together. What happened, and what thought felt most painful?")); }
        if lower.contains("missed a deadline") { return Ok(message("That sounds frustrating. What emotions came up, and what evidence supports or challenges the thought that one missed deadline defines your work?")); }
        if lower.contains("schedule") { return Ok(call("list_calendars", json!({}))); }
        if lower.contains("save this link") { return Ok(call("capture_link", fixture["link"].clone())); }
        if user.contains("https://example.com/second-brain") { return Ok(json!({ "output": [{ "type": "message", "content": [{ "type": "output_text", "text": "The article describes keeping small, connected notes and reviewing them regularly.", "annotations": [{ "type": "url_citation", "title": "Connected notes", "url": "https://example.com/second-brain" }] }] }] })); }
        Ok(message("I’m here. We can capture something, make a plan, or talk through a thought record."))
    }
}
#[tauri::command]
pub async fn assistant_speak(window: tauri::WebviewWindow, assistant: State<'_, Assistant>, net: State<'_, Net>, settings: State<'_, crate::Settings>, text: String, request_id: String, provider: Option<Provider>) -> Result<Response, String> {
    workspace_only(&window)?;
    let pending = assistant.begin(request_id)?;
    if text.trim().is_empty() || text.chars().count() > 1200 || text.len() > 8000 { return Err("This reply is too long to read aloud in one request.".to_owned()); }
    if provider.unwrap_or_default() == Provider::Codex {
        #[cfg(any(test, feature = "e2e"))]
        { let _ = settings; return crate::net::pcm_wav(&vec![0; 48000]).map(Response::new); }
        #[cfg(not(any(test, feature = "e2e")))]
        return speech::speak(&text, &pending.cancel, &settings.assistant_runtime_dir()).await.map(Response::new);
    }
    let key = assistant.required_key()?;
    #[cfg(feature = "e2e")]
    if !key.is_empty() { return crate::net::pcm_wav(&vec![0; 48000]).map(Response::new); }
    net.assistant_speech(&key, &text, &pending.cancel).await.map(Response::new)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credentials_are_isolated_and_never_exposed_in_status() {
        let first = Assistant::default(); let second = Assistant::default();
        first.set_key(Some("sk-test-not-a-real-credential".to_owned())).unwrap();
        assert!(first.key().unwrap().is_some()); assert!(second.key().unwrap().is_none());
        assert!(first.set_key(Some("unsafe\r\nheader".to_owned())).is_err());
        first.set_key(None).unwrap(); assert!(first.key().unwrap().is_none());
        assert_eq!(serde_json::to_string(&ConnectionStatus { configured: true }).unwrap(), "{\"configured\":true}");
    }
    #[test]
    fn requests_disable_remote_storage_and_bound_conversation_size() {
        let mut request = AgentRequest { effort: "low".into(), provider: Provider::Openai, model: "gpt-6.1-sol".to_owned(), instructions: "Help with notes".to_owned(), input: vec![json!({"role":"user","content":"Hello"})], tools: vec![] };
        let parsed: Value = serde_json::from_slice(&request.body().unwrap()).unwrap();
        assert_eq!(parsed["store"], false); assert_eq!(parsed["parallel_tool_calls"], false);
        request.model = "bad\nmodel".to_owned(); assert!(request.body().is_err());
        request.model = "valid-model".to_owned(); request.instructions = "x".repeat(100_001); assert!(request.body().is_err());
    }
    #[test]
    fn audio_has_format_metadata_and_refuses_header_injection_and_oversize_data() {
        let (content_type, body) = audio_body(b"recorded-audio", "audio/mp4;codecs=mp4a.40.2", "gpt-transcribe").unwrap();
        assert!(content_type.starts_with("multipart/form-data; boundary="));
        let text = String::from_utf8(body).unwrap(); assert!(text.contains("recording.m4a")); assert!(text.contains("gpt-transcribe"));
        assert!(audio_body(b"data", "audio/mp4\r\nInjected: true", "gpt-transcribe").is_err());
        assert!(audio_body(&[], "audio/mp4", "gpt-transcribe").is_err());
        let (header, _) = audio_body(b"epizen-audio-boundary", "audio/wav", "gpt-transcribe").unwrap();
        assert!(header.ends_with("boundaryx"));
        let (_, router) = audio_body(b"recorded-audio", "audio/webm;codecs=opus", "microsoft/mai-transcribe-2").unwrap();
        let router = String::from_utf8(router).unwrap();
        assert!(router.contains("microsoft/mai-transcribe-2"));
        assert!(router.contains("recording.webm"));
        assert!(audio_body(b"recorded-audio", "audio/mp4", "injected\r\nmodel").is_err());
    }
    #[tokio::test]
    async fn cancellation_handles_early_requests_active_requests_and_releases_the_slot() {
        let assistant = Assistant::default();
        assistant.cancel("early".to_owned());
        assert!(assistant.begin("early".to_owned()).is_err());
        let pending = assistant.begin("active".to_owned()).unwrap();
        assert!(assistant.begin("active".to_owned()).is_err());
        assistant.cancel("active".to_owned());
        let error = Net::new().unwrap().assistant_post("responses", "test", "application/json", vec![], &pending.cancel).await.unwrap_err();
        assert!(error.contains("cancelled"));
        drop(pending);
        assert!(assistant.begin("active".to_owned()).is_ok());
    }
}
