//! Recoverable quick-entry drafts, separate from conversations and vault files.
use super::*;
impl Settings {
    fn prompt_path(&self, root: &str) -> io::Result<PathBuf> {
        if root.is_empty() || root.len() > 4096 { return Err(io::Error::other("Invalid vault identifier.")); }
        Ok(self.file.with_file_name("assistant-prompts").join(format!("{:x}.json", Sha256::digest(root.as_bytes()))))
    }
    pub fn prompt_document(&self, root: &str) -> io::Result<Value> {
        let path = self.prompt_path(root)?;
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(serde_json::json!({"revision":0,"draft":"","pending":null})),
            Err(error) => return Err(error),
            Ok(metadata) if !metadata.is_file() || metadata.len() > 200_000 => return Err(io::Error::other("The quick prompt file is invalid. Its original content is preserved.")),
            Ok(_) => {},
        }
        serde_json::from_slice(&fs::read(path)?).map_err(|_| io::Error::other("The quick prompt could not be read. Its original content is preserved."))
    }
    pub fn save_prompt_document(&self, root: &str, expected: u64, mut next: Value) -> io::Result<Value> {
        let _guard = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let previous = self.prompt_document(root)?;
        let revision = previous["revision"].as_u64().ok_or_else(|| io::Error::other("The quick prompt revision is invalid."))?;
        if revision != expected { return Err(io::Error::other("The quick prompt changed. Your draft is retained; reopen it before retrying.")); }
        next["revision"] = revision.checked_add(1).ok_or_else(|| io::Error::other("Prompt revision overflow."))?.into();
        let bytes = serde_json::to_vec(&next)?;
        if bytes.len() > 200_000 { return Err(io::Error::other("This quick prompt is too long.")); }
        let path = self.prompt_path(root)?;
        fs::create_dir_all(path.parent().unwrap())?;
        let mut temporary = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
        temporary.write_all(&bytes)?; temporary.as_file().sync_all()?;
        temporary.persist(path).map_err(io::Error::other)?;
        Ok(next)
    }
    pub fn assistant_has_message(&self, root: &str, id: &str) -> io::Result<bool> {
        for summary in self.assistant_chats(root)? {
            if summary["error"] == true { continue; }
            let chat = self.assistant_chat(root, summary["id"].as_str().unwrap_or_default())?;
            if chat["state"]["messages"].as_array().is_some_and(|messages| messages.iter().any(|message| message["id"] == id)) { return Ok(true); }
        }
        Ok(false)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quick_drafts_are_atomic_conditional_scoped_and_preserve_corrupt_content() {
        let dir = tempfile::tempdir().unwrap(); let settings = Settings::new(dir.path());
        let initial = settings.prompt_document("/one").unwrap();
        assert_eq!(initial["revision"], 0);
        let next = settings.save_prompt_document("/one", 0, serde_json::json!({"draft":"Keep this", "pending":null})).unwrap();
        assert_eq!(next["revision"], 1);
        assert!(settings.save_prompt_document("/one", 0, initial).is_err());
        assert_eq!(settings.prompt_document("/one").unwrap()["draft"], "Keep this");
        assert_eq!(settings.prompt_document("/two").unwrap()["draft"], "");
        let path = settings.prompt_path("/one").unwrap(); fs::write(&path, b"broken").unwrap();
        assert!(settings.save_prompt_document("/one", 1, next).is_err());
        assert_eq!(fs::read(path).unwrap(), b"broken");
    }
}
