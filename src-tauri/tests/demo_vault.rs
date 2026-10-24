//! Reads the whole demo vault through the code the app uses, on a copy, and checks
//! that nothing on disk changed. Tests never open demo-vault/ itself.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use epizen_lib::{FileKind, Vault};
use tempfile::TempDir;

fn copy_of_demo_vault() -> (TempDir, PathBuf) {
    let original = Path::new(env!("CARGO_MANIFEST_DIR")).join("../demo-vault");
    let dir = tempfile::tempdir().unwrap();
    let copy = dir.path().join("demo-vault");
    copy_dir(&original, &copy);
    (dir, copy)
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// Every file under `root`, hidden ones included, with its bytes.
fn snapshot(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
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
fn reading_every_note_and_image_changes_nothing() {
    let (_dir, copy) = copy_of_demo_vault();
    let before = snapshot(&copy);

    let vault = Vault::open(&copy).unwrap();
    for file in vault.list_files().unwrap() {
        match file.kind {
            FileKind::Note => assert!(!vault.read_note(&file.path).unwrap().is_empty()),
            FileKind::Image => assert!(!vault.read_image(&file.path).unwrap().is_empty()),
        }
    }

    assert_eq!(snapshot(&copy), before, "reading the vault changed a file");
}

#[test]
fn lists_the_demo_vault() {
    let (_dir, copy) = copy_of_demo_vault();
    let files = Vault::open(&copy).unwrap().list_files().unwrap();
    let count = |prefix: &str, kind: FileKind| {
        files
            .iter()
            .filter(|file| file.kind == kind && file.path.starts_with(prefix))
            .filter(|file| !file.path.rsplit('/').next().unwrap().starts_with("00."))
            .count()
    };

    assert_eq!(count("Calendar/2026/days 2026/", FileKind::Note), 60);
    assert_eq!(count("Rating/music/", FileKind::Note), 20);
    assert_eq!(count("Rating/music/_attachments/", FileKind::Image), 20);
}
