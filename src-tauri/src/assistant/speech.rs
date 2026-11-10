//! Local speech for subscription connections. Recorded audio never leaves this module.
use std::{path::Path, sync::{Arc, atomic::{AtomicBool, Ordering}}, time::Duration};
use tokio::sync::Notify;

struct StopOnDrop(Arc<AtomicBool>);
impl Drop for StopOnDrop { fn drop(&mut self) { self.0.store(true, Ordering::SeqCst); } }
pub async fn transcribe(audio: Vec<u8>, mime: String, cancel: &Notify, runtime: &Path) -> Result<String, String> {
    std::fs::create_dir_all(runtime).map_err(|_| "Couldn’t prepare local speech.".to_owned())?;
    let scratch = tempfile::Builder::new().prefix("speech-").tempdir_in(runtime).map_err(|_| "Couldn’t prepare local speech.".to_owned())?;
    let extension = match mime.split(';').next().unwrap_or("") { "audio/mp4" | "video/mp4" => "m4a", "audio/webm" | "video/webm" => "webm", "audio/ogg" => "ogg", "audio/wav" | "audio/x-wav" => "wav", _ => return Err("This audio format is unsupported.".to_owned()) };
    let path = scratch.path().join(format!("recording.{extension}"));
    std::fs::write(&path, audio).map_err(|_| "Couldn’t prepare the recording.".to_owned())?;
    let stopped = Arc::new(AtomicBool::new(false));
    let _stop = StopOnDrop(stopped.clone());
    let job = tauri::async_runtime::spawn_blocking(move || { let _scratch = scratch; recognize(&path, &stopped) });
    tokio::select! {
        biased;
        _ = cancel.notified() => Err("Stopped.".to_owned()),
        result = job => result.map_err(|_| "Local speech stopped unexpectedly.".to_owned())?,
    }
}

#[cfg(target_os = "macos")]
fn recognize(path: &Path, stopped: &AtomicBool) -> Result<String, String> {
    use block2::RcBlock;
    use objc2::{class, msg_send, rc::{Allocated, Retained}, runtime::{AnyObject, Bool}};
    use objc2_foundation::{NSError, NSString, NSURL};
    use std::sync::mpsc;
    use std::time::Instant;
    // Keep the optional system framework loaded for the process lifetime. Older macOS
    // releases without Speech can still launch Epizen and use typed conversations.
    static AVAILABLE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    let available = *AVAILABLE.get_or_init(|| unsafe { !libc::dlopen(c"/System/Library/Frameworks/Speech.framework/Speech".as_ptr(), libc::RTLD_LAZY | libc::RTLD_LOCAL).is_null() });
    if !available { return Err("Local speech is unavailable on this version of macOS. You can still type to Spike.".to_owned()); }
    let deadline = Instant::now() + Duration::from_secs(120);
    let wait = |receiver: &mpsc::Receiver<Result<String, String>>| -> Result<String, String> {
        loop {
            if stopped.load(Ordering::SeqCst) { return Err("Stopped.".to_owned()); }
            if Instant::now() >= deadline { return Err("Local speech timed out. Check macOS Speech Recognition permission and try again.".to_owned()); }
            match receiver.recv_timeout(Duration::from_millis(100)) {
                Ok(result) => return result,
                Err(mpsc::RecvTimeoutError::Timeout) => {},
                Err(_) => return Err("Local speech ended without a result.".to_owned()),
            }
        }
    };
    let (auth_tx, auth_rx) = mpsc::channel();
    let authorization = RcBlock::new(move |status: isize| {
        let _ = auth_tx.send(if status == 3 { Ok(String::new()) } else { Err("Allow Epizen in macOS Privacy & Security → Speech Recognition, or type your message.".to_owned()) });
    });
    // SAFETY: Speech framework is loaded above; the selectors and block signatures match
    // SFSpeechRecognizer's public API. Apple copies the blocks for asynchronous callbacks.
    unsafe { let _: () = msg_send![class!(SFSpeechRecognizer), requestAuthorization: &*authorization]; }
    wait(&auth_rx)?;
    let recognizer: Option<Retained<AnyObject>> = unsafe { msg_send![class!(SFSpeechRecognizer), new] };
    let recognizer = recognizer.ok_or("macOS speech does not support the current language. You can still type to Spike.")?;
    let available: Bool = unsafe { msg_send![&*recognizer, isAvailable] };
    if !available.as_bool() { return Err("macOS speech is temporarily unavailable. Try again or type your message.".to_owned()); }
    let supported: Bool = unsafe { msg_send![&*recognizer, supportsOnDeviceRecognition] };
    if !supported.as_bool() { return Err("On-device speech isn’t available for this Mac’s current language. Enable that language for macOS Dictation, or type your message.".to_owned()); }
    let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
    let allocated: Allocated<AnyObject> = unsafe { msg_send![class!(SFSpeechURLRecognitionRequest), alloc] };
    let request: Retained<AnyObject> = unsafe { msg_send![allocated, initWithURL: &*url] };
    unsafe {
        let _: () = msg_send![&*request, setRequiresOnDeviceRecognition: Bool::YES];
        let _: () = msg_send![&*request, setShouldReportPartialResults: Bool::NO];
    }
    let (tx, rx) = mpsc::channel();
    let callback = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        if !error.is_null() {
            // Preserve the system error category/code without logging audio or recognized text.
            let error = unsafe { &*error };
            let _ = tx.send(Err(recognition_failure(&error.domain().to_string(), error.code(), &error.localizedDescription().to_string())));
            return;
        }
        if result.is_null() { return; }
        // SAFETY: The callback result is live for this invocation; returned Objective-C
        // properties are retained before copying the recognized text into Rust.
        unsafe {
            let final_result: Bool = msg_send![result, isFinal];
            if final_result.as_bool() {
                let transcription: Retained<AnyObject> = msg_send![result, bestTranscription];
                let text: Retained<NSString> = msg_send![&*transcription, formattedString];
                let _ = tx.send(Ok(text.to_string()));
            }
        }
    });
    let task: Retained<AnyObject> = unsafe { msg_send![&*recognizer, recognitionTaskWithRequest: &*request, resultHandler: &*callback] };
    let result = wait(&rx);
    unsafe { let _: () = msg_send![&*task, cancel]; }
    result
}
#[cfg(not(target_os = "macos"))]
fn recognize(_: &Path, _: &AtomicBool) -> Result<String, String> { Err("Local speech requires macOS.".to_owned()) }

pub async fn speak(text: &str, cancel: &Notify, runtime: &Path) -> Result<Vec<u8>, String> {
    use std::process::Stdio;
    use tokio::process::Command;
    std::fs::create_dir_all(runtime).map_err(|_| "Couldn’t prepare local speech.".to_owned())?;
    let scratch = tempfile::Builder::new().prefix("voice-").tempdir_in(runtime).map_err(|_| "Couldn’t prepare local speech.".to_owned())?;
    let path = scratch.path().join("reply.wav");
    let mut command = Command::new("/usr/bin/say");
    command.args(["-f", "-", "--file-format=WAVE", "--data-format=LEI16@24000", "-o"]).arg(&path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(unix)] { command.process_group(0); }
    let (success, _, _) = super::process::run(command, text.as_bytes(), cancel, Duration::from_secs(60)).await?;
    if !success { return Err("macOS couldn’t prepare spoken audio. Check the system voice in Accessibility settings.".to_owned()); }
    let metadata = std::fs::metadata(&path).map_err(|_| "macOS returned no spoken audio.".to_owned())?;
    if metadata.len() > 8 * 1024 * 1024 { return Err("The spoken reply is too large.".to_owned()); }
    std::fs::read(path).map_err(|_| "Couldn’t read the spoken reply.".to_owned())
}

fn recognition_failure(domain: &str, code: isize, detail: &str) -> String {
    if domain == "kAFAssistantErrorDomain" && code == 1101 {
        return "The on-device speech service could not start. Enable Dictation in macOS System Settings → Keyboard, check that your language is installed, then retry this recording. Your audio has not been sent to a cloud provider.".into();
    }
    format!("On-device speech failed ({domain} {code}). {detail}")
}
#[cfg(test)] mod recognition_tests {
    use super::*;
    #[test] fn unavailable_local_service_has_actionable_setup_guidance() {
        let message = recognition_failure("kAFAssistantErrorDomain", 1101, "Recognition failed");
        assert!(message.contains("Enable Dictation"));
        assert!(message.contains("retry this recording"));
        assert!(recognition_failure("other", 9, "Unsupported format").contains("Unsupported format"));
    }
}
