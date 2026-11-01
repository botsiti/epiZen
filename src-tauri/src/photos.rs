//! Local images selected by the user for a monthly expense note.

use crate::{NetError, Vault, VaultError, net};
use std::path::Path;

pub const MAX_PHOTO_BYTES: usize = 10 * 1024 * 1024;

/// Creates a new attachment beside the note. It never replaces an existing image or note.
pub fn store_expense_photo(vault: &Vault, note_path: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err("Choose a photo smaller than 10 MB.".to_owned());
    }
    if net::ImageFormat::sniff(bytes).is_none() {
        return Err("Choose a PNG, JPEG, GIF or WebP image.".to_owned());
    }
    // Validate the note through the vault boundary before deriving its attachment folder.
    vault.note_path(note_path).map_err(|err| err.to_string())?;
    let parent = Path::new(note_path)
        .parent()
        .and_then(Path::to_str)
        .unwrap_or("");
    if parent
        .chars()
        .any(|ch| matches!(ch, '[' | ']' | '|' | '#' | '\r' | '\n'))
    {
        return Err("This folder's name cannot be used in a photo link. Move the note to a folder with a simpler name first.".to_owned());
    }
    let folder = if parent.is_empty() {
        "_attachments".to_owned()
    } else {
        format!("{parent}/_attachments")
    };
    for number in 1..=10_000 {
        let candidate = format!("{folder}/expense-{number}.jpg");
        match net::store_image(vault, &candidate, bytes) {
            Ok(path) => return Ok(path),
            Err(NetError::Vault(VaultError::Exists(_))) => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Couldn't find an available photo name.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn stores_only_new_valid_images_beside_the_note() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        vault
            .create_note("months/September.md", "Original\n")
            .unwrap();
        let png = b"\x89PNG\r\n\x1a\nphoto";
        let first = store_expense_photo(&vault, "months/September.md", png).unwrap();
        let second = store_expense_photo(&vault, "months/September.md", png).unwrap();
        assert_eq!(first, "months/_attachments/expense-1.png");
        assert_eq!(second, "months/_attachments/expense-2.png");
        assert_eq!(fs::read(dir.path().join(first)).unwrap(), png);
        assert_eq!(
            vault.read_note("months/September.md").unwrap(),
            "Original\n"
        );
        assert!(store_expense_photo(&vault, "months/September.md", b"not an image").is_err());
        assert!(store_expense_photo(&vault, "../outside.md", png).is_err());
        assert!(store_expense_photo(&vault, "missing.md", png).is_err());
        vault.create_note("hash#folder/note.md", "Keep").unwrap();
        assert!(store_expense_photo(&vault, "hash#folder/note.md", png).is_err());
        assert!(!dir.path().join("hash#folder/_attachments").exists());
        assert!(
            store_expense_photo(&vault, "months/September.md", &vec![0; MAX_PHOTO_BYTES + 1])
                .is_err()
        );
        assert_eq!(vault.list_files().unwrap().len(), 4);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_an_attachment_folder_symlink_outside_the_vault() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        vault.create_note("September.md", "Original").unwrap();
        symlink(outside.path(), dir.path().join("_attachments")).unwrap();
        assert!(store_expense_photo(&vault, "September.md", b"\x89PNG\r\n\x1a\nphoto").is_err());
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
        assert_eq!(vault.read_note("September.md").unwrap(), "Original");
    }
}
