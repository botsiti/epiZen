//! The library's lookups: an album's, film's, book's or podcast episode's details and its
//! cover, from a fixed list of public services that need no account. This is the only code that
//! goes on the network, and only when the user searches, picks a show or saves.
//!
//! Every URL, and every redirect, must be `https` to one of [`HOSTS`] (or a subdomain in
//! [`HOST_SUFFIXES`]); anything else is refused before a connection is made. Answers are capped
//! at [`MAX_BYTES`] and time out. MusicBrainz is asked at most once a second, as it requests,
//! and every request says who is asking ([`USER_AGENT`]). A cover reaches the vault only through
//! [`Vault::create_file`], so it never replaces a file.

use std::fmt;
use std::time::{Duration, Instant};

use reqwest::{Client, Url, redirect};
use tokio::sync::Mutex;

use crate::vault::{Vault, VaultError};

/// MusicBrainz asks every client to name itself and give a way to reach its author.
pub const USER_AGENT: &str = "Epizen/0.1.0 ( https://github.com/botsiti/epiZen )";
/// The most one answer may be: a page of search results, or a cover.
pub const MAX_BYTES: usize = 15 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 5;
/// MusicBrainz's rate limit: one request a second.
const MUSICBRAINZ_GAP: Duration = Duration::from_secs(1);

/// The hosts a lookup may reach: MusicBrainz and the Cover Art Archive (albums), the iTunes
/// Search API (podcasts and their episodes), Open Library (books), English Wikipedia (films and
/// books) and Wikidata (who made them, their year and genres).
pub const HOSTS: &[&str] = &[
    "musicbrainz.org",
    "coverartarchive.org",
    "archive.org",
    "itunes.apple.com",
    "openlibrary.org",
    "covers.openlibrary.org",
    "en.wikipedia.org",
    "www.wikidata.org",
];
/// Subdomains allowed as a family: the Cover Art Archive redirects to archive.org's mirrors
/// (`ia800…`, `dn…ca.archive.org`), iTunes artwork lives on `is1-ssl.mzstatic.com` and its kin,
/// and Wikipedia's posters and covers on `upload.wikimedia.org` and `thumb.wikimedia.org`.
pub const HOST_SUFFIXES: &[&str] = &[".archive.org", ".mzstatic.com", ".wikimedia.org"];

#[derive(Debug)]
pub enum NetError {
    /// Not `https`, or not one of the hosts above.
    NotAllowed(String),
    TooLarge,
    Status(u16),
    NotJson(String),
    NotAnImage,
    Http(String),
    Vault(VaultError),
}

impl fmt::Display for NetError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotAllowed(url) => write!(
                f,
                "Epizen only looks things up over https at MusicBrainz, the Cover Art Archive, iTunes, Open Library, Wikipedia and Wikidata, not at {url}"
            ),
            Self::TooLarge => write!(
                f,
                "the answer was larger than {} MB",
                MAX_BYTES / 1024 / 1024
            ),
            Self::Status(404) => write!(f, "not found"),
            Self::Status(503) => write!(f, "the service is busy; try again in a moment"),
            Self::Status(code) => write!(f, "the service answered {code}"),
            Self::NotJson(err) => write!(f, "the answer wasn't readable: {err}"),
            Self::NotAnImage => write!(f, "that isn't a JPEG, PNG, GIF or WebP image"),
            Self::Http(err) => write!(f, "{err}"),
            Self::Vault(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for NetError {}

impl From<VaultError> for NetError {
    fn from(err: VaultError) -> Self {
        Self::Vault(err)
    }
}

impl From<reqwest::Error> for NetError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            return Self::Http("the service took too long to answer".to_owned());
        }
        if err.is_connect() {
            return Self::Http("couldn't reach the service; are you online?".to_owned());
        }
        // A redirect the policy refused carries our own reason.
        Self::Http(err.without_url().to_string())
    }
}

/// Parses `url` and checks it may be fetched.
pub fn allowed(url: &str) -> Result<Url, NetError> {
    let parsed = Url::parse(url).map_err(|_| NetError::NotAllowed(url.to_owned()))?;
    check(&parsed)?;
    Ok(parsed)
}

/// `https` on the default port, no user name or password, and a host from the list. An address
/// (`https://93.184.216.34/`) is never a listed host.
fn check(url: &Url) -> Result<(), NetError> {
    let refuse = || NetError::NotAllowed(url.as_str().to_owned());
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(refuse());
    }
    // `domain` is `None` for an address; the url crate gives it lowercase, in punycode.
    let Some(host) = url.domain() else {
        return Err(refuse());
    };
    let listed = HOSTS.contains(&host)
        || HOST_SUFFIXES
            .iter()
            .any(|suffix| host.len() > suffix.len() && host.ends_with(suffix));
    if listed { Ok(()) } else { Err(refuse()) }
}

/// How long a request to MusicBrainz waits so it comes at least a second after the last one.
fn wait_after(last: Option<Instant>, now: Instant) -> Duration {
    last.map_or(Duration::ZERO, |last| {
        MUSICBRAINZ_GAP.saturating_sub(now.saturating_duration_since(last))
    })
}

/// The image formats a cover may be, told by its first bytes rather than by what the server says.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Jpeg,
    Png,
    Gif,
    Webp,
}

impl ImageFormat {
    pub fn sniff(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            Some(Self::Jpeg)
        } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some(Self::Png)
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            Some(Self::Gif)
        } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
            Some(Self::Webp)
        } else {
            None
        }
    }

    /// The extensions a file of this format may have; the first is the one Epizen gives it.
    fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Jpeg => &["jpg", "jpeg"],
            Self::Png => &["png"],
            Self::Gif => &["gif"],
            Self::Webp => &["webp"],
        }
    }
}

/// The path a cover is saved at: the one asked for, with its extension changed to match what
/// the bytes are (a `.jpg` that arrives as a PNG is saved as `.png`). The path must already end
/// in an image extension, so a cover can never be saved as a note.
pub fn image_path(path: &str, format: ImageFormat) -> Result<String, NetError> {
    let invalid = || NetError::Vault(VaultError::WrongKind(path.to_owned()));
    let name_start = path.rfind('/').map_or(0, |slash| slash + 1);
    let dot = path[name_start..]
        .rfind('.')
        .map(|dot| name_start + dot)
        .ok_or_else(invalid)?;
    let extension = path[dot + 1..].to_ascii_lowercase();
    let images = [
        ImageFormat::Jpeg,
        ImageFormat::Png,
        ImageFormat::Gif,
        ImageFormat::Webp,
    ];
    if dot == name_start
        || !images
            .iter()
            .any(|f| f.extensions().contains(&extension.as_str()))
    {
        return Err(invalid());
    }
    if format.extensions().contains(&extension.as_str()) {
        return Ok(path.to_owned());
    }
    Ok(format!("{}.{}", &path[..dot], format.extensions()[0]))
}

/// Saves a downloaded cover as a new file in the vault and returns the path it got.
pub fn store_image(vault: &Vault, path: &str, bytes: &[u8]) -> Result<String, NetError> {
    let format = ImageFormat::sniff(bytes).ok_or(NetError::NotAnImage)?;
    let path = image_path(path, format)?;
    vault.create_file(&path, bytes)?;
    Ok(path)
}

/// The HTTP client and MusicBrainz's clock, shared by every lookup.
pub struct Net {
    client: Client,
    /// When the last request to MusicBrainz went out.
    musicbrainz: Mutex<Option<Instant>>,
    /// Test-only: the e2e build answers from recorded responses and never goes on the network.
    #[cfg(feature = "e2e")]
    recorded: bool,
}

impl Net {
    pub fn new() -> Result<Self, NetError> {
        let client = Client::builder()
            .user_agent(USER_AGENT)
            .timeout(TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .https_only(true)
            .redirect(redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= MAX_REDIRECTS {
                    return attempt.error("too many redirects");
                }
                match check(attempt.url()) {
                    Ok(()) => attempt.follow(),
                    Err(err) => attempt.error(err),
                }
            }))
            .build()?;
        Ok(Self {
            client,
            musicbrainz: Mutex::new(None),
            #[cfg(feature = "e2e")]
            recorded: true,
        })
    }

    /// A JSON answer, such as a page of search results.
    pub async fn json(&self, url: &str) -> Result<serde_json::Value, NetError> {
        let bytes = self.get(url).await?;
        serde_json::from_slice(&bytes).map_err(|err| NetError::NotJson(err.to_string()))
    }

    /// An image's bytes, refused unless they are a JPEG, PNG, GIF or WebP.
    pub async fn image(&self, url: &str) -> Result<Vec<u8>, NetError> {
        let bytes = self.get(url).await?;
        ImageFormat::sniff(&bytes).ok_or(NetError::NotAnImage)?;
        Ok(bytes)
    }

    async fn get(&self, url: &str) -> Result<Vec<u8>, NetError> {
        let url = allowed(url)?;
        #[cfg(feature = "e2e")]
        if self.recorded {
            return e2e::answer(&url);
        }
        self.pace(&url).await;
        self.download(url).await
    }

    /// Waits until a second has passed since the last request to MusicBrainz. Requests made
    /// together queue here, one a second.
    async fn pace(&self, url: &Url) {
        if url.host_str() != Some("musicbrainz.org") {
            return;
        }
        let mut last = self.musicbrainz.lock().await;
        let wait = wait_after(*last, Instant::now());
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
        *last = Some(Instant::now());
    }

    async fn download(&self, url: Url) -> Result<Vec<u8>, NetError> {
        let mut response = self.client.get(url).send().await?;
        if !response.status().is_success() {
            return Err(NetError::Status(response.status().as_u16()));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_BYTES as u64)
        {
            return Err(NetError::TooLarge);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if body.len() + chunk.len() > MAX_BYTES {
                return Err(NetError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        Ok(body)
    }
}

/// Test-only, compiled into the e2e build alone: recorded answers from `test/fixtures/lookup/`,
/// picked by the URL a lookup asks for, so the e2e run shows real result shapes offline.
#[cfg(feature = "e2e")]
mod e2e {
    use super::{NetError, Url};

    const COVERS: [&[u8]; 3] = [
        include_bytes!("../../test/fixtures/lookup/cover-1.png"),
        include_bytes!("../../test/fixtures/lookup/cover-2.png"),
        include_bytes!("../../test/fixtures/lookup/cover-3.png"),
    ];

    pub fn answer(url: &Url) -> Result<Vec<u8>, NetError> {
        let host = url.host_str().unwrap_or_default();
        let path = url.path();
        let query = url.query().unwrap_or_default();
        let param = |name: &str| {
            url.query_pairs()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.into_owned())
                .unwrap_or_default()
        };
        let json: &[u8] = match host {
            "musicbrainz.org" if path == "/ws/2/release-group" => {
                include_bytes!("../../test/fixtures/lookup/musicbrainz-search.json")
            }
            "musicbrainz.org" if path.starts_with("/ws/2/release-group/") => {
                include_bytes!("../../test/fixtures/lookup/musicbrainz-release-group.json")
            }
            // A show's episodes: asked by its id once the show is picked.
            "itunes.apple.com" if path == "/lookup" && query.contains("entity=podcastEpisode") => {
                include_bytes!("../../test/fixtures/lookup/itunes-episodes.json")
            }
            // A film or a book: Wikipedia's search for "<what was typed> film" or "… book".
            "en.wikipedia.org" if param("gsrsearch").ends_with(" film") => {
                include_bytes!("../../test/fixtures/lookup/wikipedia-film.json")
            }
            "en.wikipedia.org" => include_bytes!("../../test/fixtures/lookup/wikipedia-book.json"),
            // A picked one's Wikidata item (Life 3.0's for a book, American Fiction's for a
            // film), then the names of the people and genres in it.
            "www.wikidata.org" if param("props") == "claims" && param("ids") == "Q48093278" => {
                include_bytes!("../../test/fixtures/lookup/wikidata-book-claims.json")
            }
            "www.wikidata.org" if param("props") == "claims" => {
                include_bytes!("../../test/fixtures/lookup/wikidata-film-claims.json")
            }
            "www.wikidata.org" if param("ids").contains("Q2076321") => {
                include_bytes!("../../test/fixtures/lookup/wikidata-book-labels.json")
            }
            "www.wikidata.org" => include_bytes!("../../test/fixtures/lookup/wikidata-film-labels.json"),
            "itunes.apple.com" if query.contains("media=podcast") => {
                include_bytes!("../../test/fixtures/lookup/itunes-podcast.json")
            }
            "openlibrary.org" => {
                include_bytes!("../../test/fixtures/lookup/openlibrary-search.json")
            }
            _ => {
                // Any cover: one of three, the same one for the same URL.
                let pick = url.as_str().bytes().map(usize::from).sum::<usize>() % COVERS.len();
                return Ok(COVERS[pick].to_vec());
            }
        };
        Ok(json.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn allows_https_to_the_listed_hosts_and_their_mirrors() {
        for url in [
            "https://musicbrainz.org/ws/2/release-group?query=dog%20man%20star&fmt=json",
            "https://musicbrainz.org/ws/2/release-group/da15737e-3eb3-31e4-97f0-fe46299f75fb?inc=genres+tags+artist-credits&fmt=json",
            "https://coverartarchive.org/release-group/da15737e-3eb3-31e4-97f0-fe46299f75fb/front-500",
            "https://archive.org/download/mbid-b71f964d/front.jpg",
            "https://dn710902.ca.archive.org/0/items/mbid-b71f964d/front.jpg",
            "https://ia800505.us.archive.org/1/items/x.jpg",
            "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrsearch=american%20fiction%20film&gsrlimit=8&gsrnamespace=0&prop=pageimages|description|pageprops&piprop=thumbnail&pithumbsize=500&pilicense=any&ppprop=wikibase_item",
            "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q116413183&props=claims",
            "https://upload.wikimedia.org/wikipedia/en/d/d7/American_fiction_xxlg.jpg",
            "https://thumb.wikimedia.org/wikipedia/en/thumb/9/97/Maschinenmensch.jpg/500px-Maschinenmensch.jpg",
            "https://itunes.apple.com/lookup?id=1434243584&media=podcast&entity=podcastEpisode&limit=200",
            "https://is1-ssl.mzstatic.com/image/thumb/Video116/v4/6d/600x600bb.jpg",
            "https://openlibrary.org/search.json?q=life%203.0",
            "https://covers.openlibrary.org/b/id/10239283-L.jpg",
            "https://MusicBrainz.ORG/ws/2/release-group?query=x",
            "https://openlibrary.org:443/search.json?q=x",
        ] {
            assert!(allowed(url).is_ok(), "{url} should be allowed");
        }
    }

    #[test]
    fn refuses_everything_else() {
        for url in [
            "http://musicbrainz.org/ws/2/release-group?query=x",
            "ftp://archive.org/x.jpg",
            "file:///etc/hosts",
            "https://example.com/",
            "https://rateyourmusic.com/search?searchterm=x",
            "https://evilarchive.org/x.jpg",
            "https://archive.org.evil.com/x.jpg",
            "https://musicbrainz.org.evil.com/",
            "https://notmusicbrainz.org/",
            "https://mzstatic.com/x.jpg",
            "https://.mzstatic.com/x.jpg",
            "https://wikimedia.org/x.jpg",
            "https://upload.wikimedia.org.evil.com/x.jpg",
            "https://de.wikipedia.org/w/api.php",
            "https://wikipedia.org/",
            "https://en.wikipedia.org.evil.com/w/api.php",
            "https://wikidata.org/w/api.php",
            "https://musicbrainz.org./ws/2/",
            "https://musicbrainz.org:8443/ws/2/",
            "https://user:secret@musicbrainz.org/ws/2/",
            "https://user@openlibrary.org/",
            "https://93.184.216.34/",
            "https://[::1]/",
            "https://localhost/",
            "musicbrainz.org/ws/2/",
            "",
        ] {
            assert!(
                matches!(allowed(url), Err(NetError::NotAllowed(_))),
                "{url} should be refused"
            );
        }
    }

    #[test]
    fn asks_musicbrainz_at_most_once_a_second() {
        let now = Instant::now();
        assert_eq!(wait_after(None, now), Duration::ZERO);
        assert_eq!(wait_after(Some(now), now), MUSICBRAINZ_GAP);
        assert_eq!(
            wait_after(Some(now), now + Duration::from_millis(400)),
            Duration::from_millis(600)
        );
        assert_eq!(
            wait_after(Some(now), now + Duration::from_secs(3)),
            Duration::ZERO
        );
    }

    #[test]
    fn tells_an_image_by_its_bytes() {
        assert_eq!(
            ImageFormat::sniff(b"\xff\xd8\xff\xe0\0\x10JFIF"),
            Some(ImageFormat::Jpeg)
        );
        assert_eq!(
            ImageFormat::sniff(b"\x89PNG\r\n\x1a\n\0\0"),
            Some(ImageFormat::Png)
        );
        assert_eq!(ImageFormat::sniff(b"GIF89a.."), Some(ImageFormat::Gif));
        assert_eq!(
            ImageFormat::sniff(b"RIFF\x10\0\0\0WEBPVP8 "),
            Some(ImageFormat::Webp)
        );
        for not_an_image in [
            &b"<svg xmlns='http://www.w3.org/2000/svg'/>"[..],
            b"<html>",
            b"{}",
            b"",
            b"RIFF\0\0\0\0WAVE",
        ] {
            assert_eq!(ImageFormat::sniff(not_an_image), None);
        }
    }

    #[test]
    fn gives_a_cover_the_extension_its_bytes_have() {
        let path = "Rating/music/_attachments/dog-man-star.jpg";
        assert_eq!(image_path(path, ImageFormat::Jpeg).unwrap(), path);
        assert_eq!(
            image_path("a/b.JPEG", ImageFormat::Jpeg).unwrap(),
            "a/b.JPEG"
        );
        assert_eq!(
            image_path(path, ImageFormat::Png).unwrap(),
            "Rating/music/_attachments/dog-man-star.png"
        );
        assert_eq!(
            image_path("v1.2/cover.webp", ImageFormat::Gif).unwrap(),
            "v1.2/cover.gif"
        );
        for not_an_image_path in [
            "Rating/music/Dog Man Star.md",
            "cover",
            "a.b/cover",
            "notes.txt",
            ".jpg",
            "a/.png",
        ] {
            assert!(
                image_path(not_an_image_path, ImageFormat::Jpeg).is_err(),
                "{not_an_image_path:?} should be refused"
            );
        }
    }

    #[test]
    fn stores_a_cover_only_as_a_new_image_file() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::open(dir.path()).unwrap();
        let png = b"\x89PNG\r\n\x1a\nrest";
        let saved = store_image(&vault, "Rating/books/_attachments/life-3-0.jpg", png).unwrap();
        assert_eq!(saved, "Rating/books/_attachments/life-3-0.png");
        assert_eq!(fs::read(dir.path().join(&saved)).unwrap(), png);
        // Never over a file that is there, and never anything that isn't an image.
        assert!(matches!(
            store_image(&vault, &saved, b"\x89PNG\r\n\x1a\nother"),
            Err(NetError::Vault(VaultError::Exists(_)))
        ));
        assert_eq!(fs::read(dir.path().join(&saved)).unwrap(), png);
        assert!(matches!(
            store_image(&vault, "x.jpg", b"<svg onload='alert(1)'/>"),
            Err(NetError::NotAnImage)
        ));
        assert!(store_image(&vault, "Note.md", b"\xff\xd8\xff").is_err());
        assert!(store_image(&vault, "../outside.jpg", b"\xff\xd8\xff").is_err());
        assert!(!dir.path().join("Note.md").exists());
    }
}
