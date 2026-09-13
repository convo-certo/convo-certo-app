import AppKit
import WebKit
import CryptoKit

final class Downloads: NSObject, WKDownloadDelegate {
    weak var window: NSWindow?
    weak var webView: WKWebView?
    private let testing: Bool
    private var destinations: [ObjectIdentifier: URL] = [:]
    private var testDirectory: URL?
    init(testing: Bool) { self.testing = testing }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let filename = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        if testing {
            do {
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("convocerto-export-" + UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                testDirectory = directory
                let file = directory.appendingPathComponent(filename)
                destinations[ObjectIdentifier(download)] = file
                completionHandler(file)
            } catch { completionHandler(nil); publish(["status": "failed", "error": error.localizedDescription]) }
            return
        }
        guard let window, window.attachedSheet == nil else { completionHandler(nil); publish(["status": "cancelled"]); return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = filename
        panel.beginSheetModal(for: window) { [weak self] result in
            guard result == .OK, let file = panel.url else { completionHandler(nil); self?.publish(["status": "cancelled"]); return }
            self?.destinations[ObjectIdentifier(download)] = file
            completionHandler(file)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        do {
            let data = try Data(contentsOf: file)
            publish(["status": "saved", "name": file.lastPathComponent, "bytes": data.count, "sha256": SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()])
        } catch { publish(["status": "failed", "error": error.localizedDescription]) }
        if testing { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()); testDirectory = nil }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: ObjectIdentifier(download))
        if testing, let directory = testDirectory { try? FileManager.default.removeItem(at: directory); testDirectory = nil }
        if (error as NSError).code != NSURLErrorCancelled { publish(["status": "failed", "error": error.localizedDescription]) }
    }
    private func publish(_ result: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('convocerto-download',{detail:\(json)}))", completionHandler: nil)
    }
}
