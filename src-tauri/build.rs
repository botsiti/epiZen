use std::{env, fs, path::Path, process::Command};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let source = "native/LocalSpeech.swift";
        println!("cargo:rerun-if-changed={source}");
        println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");
        let target = env::var("TARGET").expect("missing Rust target");
        let arch = match target.as_str() {
            "aarch64-apple-darwin" => "arm64",
            "x86_64-apple-darwin" => "x86_64",
            _ => panic!("unsupported macOS target {target}"),
        };
        let folder = Path::new("target/speech-helper");
        fs::create_dir_all(folder).expect("create local speech build directory");
        let binary = folder.join(format!("epizen-local-speech-{target}"));
        let status = Command::new("xcrun").args(["--sdk", "macosx", "swiftc", "-parse-as-library", "-O", "-target"])
            .arg(format!("{arch}-apple-macos13.0")).arg(source).arg("-o").arg(binary)
            .status().expect("run swiftc from the installed macOS SDK");
        assert!(status.success(), "building local speech requires the macOS 26 SDK and Swift 6.2 or newer");
    }
    tauri_build::build()
}
