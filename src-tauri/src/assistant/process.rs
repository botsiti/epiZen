//! Bounded, cancellable child-process I/O shared by local provider adapters.
use std::time::Duration;
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, process::Command, sync::Notify};
const LIMIT: u64 = 8 * 1024 * 1024;
async fn bounded(read: impl tokio::io::AsyncRead + Unpin) -> Result<Vec<u8>, String> {
    let mut result = Vec::new();
    read.take(LIMIT + 1).read_to_end(&mut result).await.map_err(|_| "Couldn’t read the assistant process response.".to_owned())?;
    if result.len() as u64 > LIMIT { return Err("The assistant process returned too much output. Try a shorter request.".to_owned()); }
    Ok(result)
}
pub(super) async fn run(mut command: Command, input: &[u8], cancel: &Notify, timeout: Duration) -> Result<(bool, Vec<u8>, Vec<u8>), String> {
    let mut child = command.spawn().map_err(|_| "Couldn’t start the assistant process. Check that the selected provider is installed and executable.".to_owned())?;
    let mut stdin = child.stdin.take().ok_or("The assistant process input is unavailable.")?;
    let stdout = child.stdout.take().ok_or("The assistant process output is unavailable.")?;
    let stderr = child.stderr.take().ok_or("The assistant process status is unavailable.")?;
    let work = async {
        let write = async move {
            stdin.write_all(input).await.map_err(|_| "Couldn’t send the request to the assistant process.".to_owned())?;
            // ChildStdin::shutdown is a no-op for Unix pipes. Closing the owned handle
            // is what delivers EOF to Codex exec and macOS say before we await output.
            drop(stdin);
            Ok::<(), String>(())
        };
        let wait = async { child.wait().await.map_err(|_| "Couldn’t wait for the assistant process.".to_owned()) };
        let (_, stdout, stderr, status) = tokio::try_join!(write, bounded(stdout), bounded(stderr), wait)?;
        Ok((status.success(), stdout, stderr))
    };
    let result = tokio::select! {
        biased;
        _ = cancel.notified() => Err("Stopped.".to_owned()),
        result = tokio::time::timeout(timeout, work) => result.unwrap_or_else(|_| Err("The assistant process took too long. Try again or check your subscription limits.".to_owned())),
    };
    if let Some(pid) = child.id() {
        #[cfg(unix)] unsafe { libc::kill(-(pid as i32), libc::SIGKILL); }
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;
    #[tokio::test]
    async fn delivers_input_and_eof_before_waiting_for_a_child_reply() {
        let mut command = Command::new("/bin/cat");
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        #[cfg(unix)] { command.process_group(0); }
        let (success, output, _) = run(command, b"A complete request.\n", &Notify::new(), Duration::from_secs(1)).await.unwrap();
        assert!(success);
        assert_eq!(output, b"A complete request.\n");
    }
}
