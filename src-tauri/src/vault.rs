//! Access to a vault: a folder of plain Markdown notes and their images.
//!
//! This is the only code that touches the vault. Every path that comes from the frontend
//! goes through [`Vault::resolve`] or [`Vault::new_note_path`], which keep it inside the vault
//! folder. It writes in two ways only: a new note that can't replace an existing file, and a
//! note's new text, renamed over it whole and only while the note still holds what the app read.

use std::fmt;
use std::fs;
use std::io::{self, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Extensions served as images (covers, embeds). Everything else that isn't `.md` is ignored.
const IMAGE_EXTENSIONS: &[&str] = &["svg", "png", "jpg", "jpeg", "gif", "webp"];

#[derive(Debug)]
pub struct Vault {
    /// Canonical path, so symlinks can't hide where a file really lives.
    root: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Note,
    Image,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VaultFile {
    /// Path relative to the vault folder, with `/` separators.
    pub path: String,
    pub kind: FileKind,
}

#[derive(Debug)]
pub enum VaultError {
    NotAFolder(PathBuf),
    InvalidPath(String),
    NotFound(String),
    WrongKind(String),
    /// Creating a note whose name is taken.
    Exists(String),
    /// The note on disk isn't the text the app last read or wrote, so saving would overwrite
    /// someone else's edit.
    Changed(String),
    Io(io::Error),
}

impl fmt::Display for VaultError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotAFolder(path) => write!(f, "not a folder: {}", path.display()),
            Self::InvalidPath(path) => write!(f, "not a path inside the vault: {path}"),
            Self::NotFound(path) => write!(f, "no such file in the vault: {path}"),
            Self::WrongKind(path) => write!(f, "wrong kind of file: {path}"),
            Self::Exists(path) => write!(f, "a file with this name already exists: {path}"),
            Self::Changed(path) => {
                write!(f, "the note changed on disk since it was opened: {path}")
            }
            Self::Io(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for VaultError {}

impl From<io::Error> for VaultError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

impl Vault {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, VaultError> {
        let path = path.as_ref();
        let not_a_folder = || VaultError::NotAFolder(path.to_path_buf());
        let root = path.canonicalize().map_err(|_| not_a_folder())?;
        if !root.is_dir() {
            return Err(not_a_folder());
        }
        Ok(Self { root })
    }

    /// The folder name, which is what Obsidian calls the vault too.
    pub fn name(&self) -> String {
        self.root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.root.display().to_string())
    }

    /// Every note and image, sorted by path. Hidden files and folders (`.obsidian`,
    /// `.trash`, `.git`) and symlinks are skipped.
    pub fn list_files(&self) -> Result<Vec<VaultFile>, VaultError> {
        let mut files = Vec::new();
        self.walk(&self.root, &mut files)?;
        files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(files)
    }

    pub fn read_note(&self, path: &str) -> Result<String, VaultError> {
        Ok(fs::read_to_string(self.resolve(path, FileKind::Note)?)?)
    }

    pub fn read_image(&self, path: &str) -> Result<Vec<u8>, VaultError> {
        Ok(fs::read(self.resolve(path, FileKind::Image)?)?)
    }

    /// Creates a note, and its folders inside the vault. Never replaces a file: the check
    /// and the create are one step (`create_new`), so a name taken a moment ago is refused.
    pub fn create_note(&self, path: &str, text: &str) -> Result<(), VaultError> {
        let target = self.new_note_path(path)?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|err| match err.kind() {
                io::ErrorKind::AlreadyExists => VaultError::Exists(path.to_owned()),
                _ => err.into(),
            })?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        Ok(())
    }

    /// Replaces a note's text, only while the note still holds `expected`: the text the app
    /// last read or wrote. The new text goes to a hidden file beside the note, takes on the
    /// note's permissions, creation date and extended attributes (Finder tags, comments), and
    /// is renamed over it, so a crash or a full disk leaves the old note whole. Saving the text
    /// it already holds writes nothing.
    pub fn write_note(&self, path: &str, text: &str, expected: &str) -> Result<(), VaultError> {
        let changed = || VaultError::Changed(path.to_owned());
        let real = self.resolve(path, FileKind::Note)?;
        // Kept open: an app that writes the note in place after the last look below writes
        // into this file, and the check after the rename sees it.
        let mut old = fs::File::open(&real)?;
        if read_from_start(&mut old)? != expected.as_bytes() {
            return Err(changed());
        }
        if text == expected {
            return Ok(());
        }
        let temp = temp_beside(&real).ok_or_else(|| VaultError::InvalidPath(path.to_owned()))?;
        let written = (|| {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)?;
            file.write_all(text.as_bytes())?;
            copy_metadata(&real, &temp, &file)?;
            file.sync_all()?;
            // A last look right before the swap, after the slow part.
            if fs::read(&real)? != expected.as_bytes() {
                return Err(changed());
            }
            fs::rename(&temp, &real)?;
            Ok(())
        })();
        if written.is_err() {
            // Only the temporary file this call made, never the note.
            let _ = fs::remove_file(&temp);
            return written;
        }
        // Someone wrote into the old file between the last look and the rename: put their
        // text back as the note, and keep ours unsaved.
        let theirs = read_from_start(&mut old)?;
        if theirs != expected.as_bytes() {
            restore(&real, &theirs)?;
            return Err(changed());
        }
        Ok(())
    }

    fn walk(&self, dir: &Path, files: &mut Vec<VaultFile>) -> Result<(), VaultError> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if name.starts_with('.') {
                continue;
            }
            // `DirEntry::file_type` doesn't follow symlinks, so links are neither dirs nor files here.
            let file_type = entry.file_type()?;
            let path = entry.path();
            if file_type.is_dir() {
                // One unreadable folder shouldn't hide the rest of the vault.
                if self.walk(&path, files).is_err() {
                    continue;
                }
            } else if file_type.is_file()
                && let Some(kind) = kind_of(&path)
                && let Some(relative) = self.relative(&path)
            {
                files.push(VaultFile {
                    path: relative,
                    kind,
                });
            }
        }
        Ok(())
    }

    fn relative(&self, path: &Path) -> Option<String> {
        let parts: Option<Vec<&str>> = path
            .strip_prefix(&self.root)
            .ok()?
            .components()
            .map(|part| part.as_os_str().to_str())
            .collect();
        Some(parts?.join("/"))
    }

    /// Turns a vault-relative path from the frontend into a real file inside the vault.
    fn resolve(&self, path: &str, expected: FileKind) -> Result<PathBuf, VaultError> {
        let relative = plain_path(path, expected)?;
        let real = match self.root.join(relative).canonicalize() {
            Ok(real) => real,
            Err(err) if err.kind() == io::ErrorKind::NotFound => {
                return Err(VaultError::NotFound(path.to_owned()));
            }
            Err(err) => return Err(err.into()),
        };
        // A symlink inside the vault can still point outside it.
        if !real.starts_with(&self.root) || !real.is_file() {
            return Err(VaultError::InvalidPath(path.to_owned()));
        }
        Ok(real)
    }

    /// Where a new note goes: a plain path whose existing folders all lie inside the vault
    /// (a symlinked folder can't carry it out), with the missing folders created.
    fn new_note_path(&self, path: &str) -> Result<PathBuf, VaultError> {
        let relative = plain_path(path, FileKind::Note)?;
        let invalid = || VaultError::InvalidPath(path.to_owned());
        let name = relative.file_name().ok_or_else(invalid)?;
        let folder = self.root.join(relative.parent().ok_or_else(invalid)?);
        let mut existing = folder.as_path();
        while !existing.exists() {
            existing = existing.parent().ok_or_else(invalid)?;
        }
        let real = existing.canonicalize()?;
        if !real.starts_with(&self.root) || !real.is_dir() {
            return Err(invalid());
        }
        let missing = folder.strip_prefix(existing).map_err(|_| invalid())?;
        fs::create_dir_all(real.join(missing))?;
        Ok(real.join(missing).join(name))
    }
}

fn read_from_start(file: &mut fs::File) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    file.rewind()?;
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// A hidden file beside the note, which the vault listing skips.
fn temp_beside(real: &Path) -> Option<PathBuf> {
    let name = real.file_name()?.to_string_lossy();
    Some(real.with_file_name(format!(".{name}.epizen-{}.tmp", std::process::id())))
}

/// Puts `bytes` back as the note, the same way a save does.
fn restore(real: &Path, bytes: &[u8]) -> Result<(), VaultError> {
    let temp =
        temp_beside(real).ok_or_else(|| VaultError::InvalidPath(real.display().to_string()))?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    file.write_all(bytes)?;
    copy_metadata(real, &temp, &file)?;
    file.sync_all()?;
    fs::rename(&temp, real)?;
    Ok(())
}

/// What a note keeps across a save besides its text: permissions, creation date and extended
/// attributes. An attribute the system won't let us set is skipped rather than failing the save.
fn copy_metadata(from: &Path, to: &Path, file: &fs::File) -> io::Result<()> {
    let metadata = fs::metadata(from)?;
    file.set_permissions(metadata.permissions())?;
    #[cfg(target_os = "macos")]
    if let Ok(created) = metadata.created() {
        use std::os::macos::fs::FileTimesExt;
        file.set_times(fs::FileTimes::new().set_created(created))?;
    }
    if let Ok(names) = xattr::list(from) {
        for name in names {
            if let Ok(Some(value)) = xattr::get(from, &name) {
                let _ = xattr::set(to, &name, &value);
            }
        }
    }
    Ok(())
}

/// A vault-relative path made only of plain names, none hidden, for a file of the given kind.
fn plain_path(path: &str, expected: FileKind) -> Result<&Path, VaultError> {
    let relative = Path::new(path);
    let plain = !path.is_empty()
        && relative.components().all(|part| match part {
            Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
            _ => false,
        });
    if !plain {
        return Err(VaultError::InvalidPath(path.to_owned()));
    }
    if kind_of(relative) != Some(expected) {
        return Err(VaultError::WrongKind(path.to_owned()));
    }
    Ok(relative)
}

fn kind_of(path: &Path) -> Option<FileKind> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    if extension == "md" {
        Some(FileKind::Note)
    } else if IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        Some(FileKind::Image)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn vault_with(files: &[(&str, &str)]) -> (TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        for (path, content) in files {
            let full = dir.path().join(path);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, content).unwrap();
        }
        let vault = Vault::open(dir.path()).unwrap();
        (dir, vault)
    }

    #[test]
    fn lists_notes_and_images_sorted_and_skips_everything_else() {
        let (_dir, vault) = vault_with(&[
            ("b.md", ""),
            ("A/z.md", ""),
            ("A/_attachments/cover.SVG", "<svg/>"),
            ("A/board.canvas", "{}"),
            ("data.csv", ""),
            (".obsidian/app.json", "{}"),
            (".trash/old.md", ""),
            ("A/.hidden.md", ""),
        ]);
        let files = vault.list_files().unwrap();
        let listed: Vec<(&str, FileKind)> =
            files.iter().map(|f| (f.path.as_str(), f.kind)).collect();
        assert_eq!(
            listed,
            vec![
                ("A/_attachments/cover.SVG", FileKind::Image),
                ("A/z.md", FileKind::Note),
                ("b.md", FileKind::Note),
            ]
        );
    }

    #[test]
    fn reads_notes_byte_for_byte() {
        let text = "---\r\nmood: 7\r\n---\r\nДень — ok [minutes::45]";
        let (_dir, vault) = vault_with(&[("Calendar/01.08.2026.md", text)]);
        assert_eq!(vault.read_note("Calendar/01.08.2026.md").unwrap(), text);
    }

    #[test]
    fn rejects_paths_that_leave_the_vault() {
        let (_dir, vault) = vault_with(&[("note.md", "")]);
        for path in [
            "",
            "../note.md",
            "a/../../note.md",
            "/etc/hosts.md",
            "./note.md",
            ".obsidian/x.md",
        ] {
            assert!(
                matches!(vault.read_note(path), Err(VaultError::InvalidPath(_))),
                "{path:?} should be rejected"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_that_point_outside_the_vault() {
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.md"), "secret").unwrap();
        let (dir, vault) = vault_with(&[]);
        std::os::unix::fs::symlink(outside.path().join("secret.md"), dir.path().join("link.md"))
            .unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("linked-folder")).unwrap();

        assert!(matches!(
            vault.read_note("link.md"),
            Err(VaultError::InvalidPath(_))
        ));
        assert!(matches!(
            vault.read_note("linked-folder/secret.md"),
            Err(VaultError::InvalidPath(_))
        ));
        assert!(vault.list_files().unwrap().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn an_unreadable_folder_does_not_hide_the_rest() {
        use std::os::unix::fs::PermissionsExt;
        let (dir, vault) = vault_with(&[("Archive/old.md", ""), ("today.md", "")]);
        let archive = dir.path().join("Archive");
        fs::set_permissions(&archive, fs::Permissions::from_mode(0o000)).unwrap();
        let listed = vault.list_files();
        fs::set_permissions(&archive, fs::Permissions::from_mode(0o755)).unwrap();

        let paths: Vec<String> = listed.unwrap().into_iter().map(|f| f.path).collect();
        assert_eq!(paths, vec!["today.md"]);
    }

    #[test]
    fn reads_each_kind_only_through_its_own_command() {
        let (_dir, vault) =
            vault_with(&[("n.md", "text"), ("c.svg", "<svg/>"), ("b.canvas", "{}")]);
        assert_eq!(vault.read_image("c.svg").unwrap(), b"<svg/>");
        assert!(matches!(
            vault.read_note("c.svg"),
            Err(VaultError::WrongKind(_))
        ));
        assert!(matches!(
            vault.read_image("n.md"),
            Err(VaultError::WrongKind(_))
        ));
        assert!(matches!(
            vault.read_note("b.canvas"),
            Err(VaultError::WrongKind(_))
        ));
    }

    #[test]
    fn reports_missing_files_as_not_found() {
        let (_dir, vault) = vault_with(&[]);
        assert!(matches!(
            vault.read_note("31.07.2026.md"),
            Err(VaultError::NotFound(_))
        ));
    }

    #[test]
    fn creates_a_note_and_its_folders_but_never_replaces_a_file() {
        let (dir, vault) = vault_with(&[("Inbox/taken.md", "keep me")]);
        vault.create_note("Inbox/new.md", "# New\n").unwrap();
        vault.create_note("Projects/2026/plan.md", "").unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("Inbox/new.md")).unwrap(),
            "# New\n"
        );
        assert!(dir.path().join("Projects/2026/plan.md").is_file());

        assert!(matches!(
            vault.create_note("Inbox/taken.md", "lost?"),
            Err(VaultError::Exists(_))
        ));
        assert_eq!(
            fs::read_to_string(dir.path().join("Inbox/taken.md")).unwrap(),
            "keep me"
        );
        for path in [
            "../out.md",
            "/tmp/out.md",
            ".obsidian/x.md",
            "Inbox/.hidden.md",
            "x.txt",
            "",
        ] {
            assert!(
                vault.create_note(path, "").is_err(),
                "{path:?} should be refused"
            );
        }
        assert!(!dir.path().join(".obsidian").exists());
    }

    #[cfg(unix)]
    #[test]
    fn creates_nothing_through_a_symlinked_folder_that_leaves_the_vault() {
        let outside = tempfile::tempdir().unwrap();
        let (dir, vault) = vault_with(&[]);
        std::os::unix::fs::symlink(outside.path(), dir.path().join("linked")).unwrap();
        assert!(matches!(
            vault.create_note("linked/deep/x.md", ""),
            Err(VaultError::InvalidPath(_))
        ));
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }

    #[test]
    fn writes_a_note_only_over_the_text_it_expects() {
        let text = "---\r\nmood: 7\r\n---\r\nДень — ok\r\n";
        let (dir, vault) = vault_with(&[("day.md", text)]);
        let path = dir.path().join("day.md");

        vault.write_note("day.md", text, text).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), text);

        let edited = text.replace("ok", "ok, edited");
        vault.write_note("day.md", &edited, text).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), edited);

        // Someone else changed it meanwhile: refuse, and leave their text alone.
        assert!(matches!(
            vault.write_note("day.md", "mine", text),
            Err(VaultError::Changed(_))
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), edited);
        assert!(matches!(
            vault.write_note("missing.md", "x", ""),
            Err(VaultError::NotFound(_))
        ));
        // No temporary file is left beside the note.
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["day.md"]);
    }

    #[cfg(unix)]
    #[test]
    fn a_write_keeps_the_note_s_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let (dir, vault) = vault_with(&[("private.md", "a")]);
        let path = dir.path().join("private.md");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        vault.write_note("private.md", "b", "a").unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_write_keeps_the_note_s_creation_date_and_extended_attributes() {
        let (dir, vault) = vault_with(&[("tagged.md", "a")]);
        let path = dir.path().join("tagged.md");
        let tag = b"<plist><array><string>Red\n6</string></array></plist>";
        xattr::set(&path, "com.apple.metadata:_kMDItemUserTags", tag).unwrap();
        let born =
            std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
        {
            use std::os::macos::fs::FileTimesExt;
            let file = fs::File::options().write(true).open(&path).unwrap();
            file.set_times(fs::FileTimes::new().set_created(born))
                .unwrap();
        }
        vault.write_note("tagged.md", "b", "a").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "b");
        assert_eq!(
            xattr::get(&path, "com.apple.metadata:_kMDItemUserTags")
                .unwrap()
                .as_deref(),
            Some(&tag[..])
        );
        assert_eq!(fs::metadata(&path).unwrap().created().unwrap(), born);
    }

    /// Every file under `root`, hidden ones included, with its bytes.
    fn snapshot(root: &Path) -> std::collections::BTreeMap<PathBuf, Vec<u8>> {
        let mut files = std::collections::BTreeMap::new();
        let mut dirs = vec![root.to_path_buf()];
        while let Some(dir) = dirs.pop() {
            for entry in fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    dirs.push(path);
                } else {
                    let bytes = fs::read(&path).unwrap();
                    files.insert(path.strip_prefix(root).unwrap().to_path_buf(), bytes);
                }
            }
        }
        files
    }

    #[test]
    fn writing_to_a_copy_of_the_demo_vault_changes_only_the_intended_files() {
        let demo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../demo-vault");
        let copy = tempfile::tempdir().unwrap();
        for (path, bytes) in snapshot(&demo) {
            let target = copy.path().join(path);
            fs::create_dir_all(target.parent().unwrap()).unwrap();
            fs::write(target, bytes).unwrap();
        }
        let before = snapshot(copy.path());
        let vault = Vault::open(copy.path()).unwrap();

        let day = "Calendar/2026/days 2026/14.08.2026.md";
        let text = vault.read_note(day).unwrap();
        let edited = text.replace("Busy but calm.", "Busy, then calm.");
        assert_ne!(edited, text);
        vault.write_note(day, &edited, &text).unwrap();
        vault.create_note("Inbox/Idea.md", "An idea\n").unwrap();

        let mut after = snapshot(copy.path());
        assert_eq!(after.remove(Path::new(day)).unwrap(), edited.as_bytes());
        assert_eq!(
            after.remove(Path::new("Inbox/Idea.md")).unwrap(),
            b"An idea\n"
        );
        let mut before = before;
        before.remove(Path::new(day)).unwrap();
        assert_eq!(after, before, "only the edited and the new note may differ");
    }

    #[test]
    fn open_needs_an_existing_folder() {
        let (dir, _vault) = vault_with(&[("note.md", "")]);
        assert!(matches!(
            Vault::open(dir.path().join("missing")),
            Err(VaultError::NotAFolder(_))
        ));
        assert!(matches!(
            Vault::open(dir.path().join("note.md")),
            Err(VaultError::NotAFolder(_))
        ));
        assert_eq!(
            Vault::open(dir.path()).unwrap().name(),
            dir.path().file_name().unwrap().to_string_lossy()
        );
    }
}
