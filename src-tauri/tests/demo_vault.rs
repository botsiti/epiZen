//! Reads the whole demo vault through the code the app uses, on a copy, and checks
//! that nothing on disk changed. Tests never open demo-vault/ itself.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use epizen_lib::{FileKind, Vault, store_image};
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
    assert_eq!(count("Rating/books/", FileKind::Note), 6);
    assert_eq!(count("Rating/books/_attachments/", FileKind::Image), 6);
    assert_eq!(count("Rating/podcasts/", FileKind::Note), 4);
}

/// What the library's Add does, through the same calls: the cover first, then the note. On a
/// copy of the demo vault it adds exactly those two files and changes nothing else.
#[test]
fn adding_an_album_writes_its_cover_and_its_note_and_nothing_else() {
    let (_dir, copy) = copy_of_demo_vault();
    let before = snapshot(&copy);
    let vault = Vault::open(&copy).unwrap();

    // The lookup's cover is a PNG, though asked for as .jpg: it is saved as what it is.
    let png = include_bytes!("../../test/fixtures/lookup/cover-1.png");
    let cover = store_image(&vault, "Rating/music/_attachments/dog-man-star.jpg", png).unwrap();
    assert_eq!(cover, "Rating/music/_attachments/dog-man-star.png");
    let note = "---\nArtist: Suede\nYear: 1994\nlistened: 2026-10-07\ngenre:\n  - britpop\n  - glam rock\n  - art rock\nrating: 86\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[dog-man-star.png|240]]\n";
    let path = "Rating/music/Dog Man Star.md";
    vault.create_note(path, note).unwrap();

    let mut after = snapshot(&copy);
    assert_eq!(after.remove(Path::new(&cover)).unwrap(), png);
    assert_eq!(after.remove(Path::new(path)).unwrap(), note.as_bytes());
    assert_eq!(after, before, "only the new note and its cover may differ");

    // Adding it again replaces neither.
    assert!(vault.create_note(path, "again").is_err());
    assert!(store_image(&vault, &cover, png).is_err());
    assert_eq!(fs::read(copy.join(path)).unwrap(), note.as_bytes());
}

/// A podcast episode, added as the library's Add writes one (the text is the one
/// `src/lib/library.test.ts` builds from the recorded iTunes episodes): its cover in the podcasts'
/// `_attachments`, its note named after the episode, and nothing else in the vault changed.
#[test]
fn adding_a_podcast_episode_writes_its_cover_and_its_note_and_nothing_else() {
    let (_dir, copy) = copy_of_demo_vault();
    let before = snapshot(&copy);
    let vault = Vault::open(&copy).unwrap();

    let png = include_bytes!("../../test/fixtures/lookup/cover-2.png");
    let cover = store_image(
        &vault,
        "Rating/podcasts/_attachments/jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.jpg",
        png,
    )
    .unwrap();
    assert_eq!(
        cover,
        "Rating/podcasts/_attachments/jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png"
    );
    let note = "---\nAuthor: Lex Fridman Podcast\nRating: 77\nYear: 2026\nGenre:\n  - technology\nListened: 2026-09-21\n---\n[[00. Podcast 2026]]\n\n![[jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png|240]]\n";
    let path =
        "Rating/podcasts/Jensen Huang - NVIDIA – The $4 Trillion Company & the AI Revolution.md";
    vault.create_note(path, note).unwrap();

    let mut after = snapshot(&copy);
    assert_eq!(after.remove(Path::new(&cover)).unwrap(), png);
    assert_eq!(after.remove(Path::new(path)).unwrap(), note.as_bytes());
    assert_eq!(
        after, before,
        "only the new episode and its cover may differ"
    );
    assert!(vault.create_note(path, "again").is_err());
}

#[test]
fn deleting_a_library_note_moves_only_its_markdown_file_to_recoverable_trash() {
    let (_dir, copy) = copy_of_demo_vault();
    let before = snapshot(&copy);
    let vault = Vault::open(&copy).unwrap();
    let path = "Rating/music/Monastery Wi-Fi.md";
    let text = vault.read_note(path).unwrap();
    let trashed = vault.trash_note(path, &text).unwrap();
    let mut expected = before;
    let bytes = expected.remove(&PathBuf::from(path)).unwrap();
    expected.insert(PathBuf::from(trashed), bytes);
    assert_eq!(snapshot(&copy), expected);
}
