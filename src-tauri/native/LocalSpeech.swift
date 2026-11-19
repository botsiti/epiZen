import AVFAudio
import Foundation
import Speech

// On macOS 26+, DictationTranscriber works independently of Keyboard Dictation.
// The system manages its language assets. The recording is read only on this Mac.
@main
struct LocalSpeech {
    static func main() async {
        guard CommandLine.arguments.count == 2 else { exit(1) }
        if #available(macOS 26, *) {
            do {
                guard let locale = await DictationTranscriber.supportedLocale(equivalentTo: .current) else {
                    print("legacy")
                    return
                }
                let transcriber = DictationTranscriber(locale: locale, preset: .longDictation)
                if let installation = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    try await installation.downloadAndInstall()
                }
                let file = try AVAudioFile(forReading: URL(fileURLWithPath: CommandLine.arguments[1]))
                let analyzer = SpeechAnalyzer(modules: [transcriber])
                async let text: String = collect(transcriber)
                try await analyzer.start(inputAudioFile: file, finishAfterFile: true)
                print("transcript")
                print(try await text)
            } catch {
                // Never pass framework diagnostics (which may contain local paths) back to the UI.
                exit(1)
            }
            return
        }
        print("legacy")
    }

    @available(macOS 26, *)
    static func collect(_ transcriber: DictationTranscriber) async throws -> String {
        var text = ""
        for try await result in transcriber.results {
            text += String(result.text.characters)
        }
        return text
    }
}
