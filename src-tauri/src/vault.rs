//! Read-only access to a vault: a folder of plain Markdown notes and their images.
//!
//! Nothing in this module writes to disk. Every path that comes from the frontend
//! goes through [`Vault::resolve`], which keeps reads inside the vault folder.

use std::fmt;
use std::fs;
use std::io;
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
    Io(io::Error),
}

impl fmt::Display for VaultError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotAFolder(path) => write!(f, "not a folder: {}", path.display()),
            Self::InvalidPath(path) => write!(f, "not a path inside the vault: {path}"),
            Self::NotFound(path) => write!(f, "no such file in the vault: {path}"),
            Self::WrongKind(path) => write!(f, "wrong kind of file: {path}"),
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
                self.walk(&path, files)?;
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

    #[test]
    fn reads_each_kind_only_through_its_own_command() {
        let (_dir, vault) = vault_with(&[("n.md", "text"), ("c.svg", "<svg/>"), ("b.canvas", "{}")]);
        assert_eq!(vault.read_image("c.svg").unwrap(), b"<svg/>");
        assert!(matches!(vault.read_note("c.svg"), Err(VaultError::WrongKind(_))));
        assert!(matches!(vault.read_image("n.md"), Err(VaultError::WrongKind(_))));
        assert!(matches!(vault.read_note("b.canvas"), Err(VaultError::WrongKind(_))));
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
