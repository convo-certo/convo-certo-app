import AppKit
import WebKit

final class PersistenceTest: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    private var webView: WKWebView?
    private var server: LocalServer?
    private var window: NSWindow?
    private var dataStore: WKWebsiteDataStore?
    private var finished = false
    private var result: [String: Any]?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let arguments = CommandLine.arguments
        guard arguments.count == 4, let identifier = UUID(uuidString: arguments[1]), ["write", "read", "cleanup"].contains(arguments[2]) else {
            finish(["passed": false, "error": "Expected profile UUID, stage, and fixture directory"]); return
        }
        guard #available(macOS 14.0, *) else { finish(["passed": false, "error": "Isolated persistence verification requires macOS 14 or later"]); return }
        let suite = "tech.gawatech.convocerto.persistence-test.\(identifier.uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { finish(["passed": false, "error": "Test preferences unavailable"]); return }
        if arguments[2] == "cleanup" {
            defaults.removePersistentDomain(forName: suite)
            let store = WKWebsiteDataStore(forIdentifier: identifier)
            dataStore = store
            store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
                self.finish(["passed": true, "stage": "cleanup"])
            }
            return
        }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore(forIdentifier: identifier)
        config.userContentController.add(self, name: "testResult")
        let view = WKWebView(frame: .zero, configuration: config)
        webView = view
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 300), styleMask: [.titled], backing: .buffered, defer: false)
        window?.contentView = view
        do {
            server = try LocalServer(root: URL(fileURLWithPath: arguments[3]), defaults: defaults)
            server?.start { error in
                if let error { self.finish(["passed": false, "stage": "server", "port": LocalServer.port, "error": error.localizedDescription]); return }
                view.load(URLRequest(url: URL(string: "http://127.0.0.1:\(LocalServer.port)/perform?stage=\(arguments[2])&profile=\(identifier.uuidString)")!))
            }
        } catch { finish(["passed": false, "stage": "server", "port": LocalServer.port, "error": error.localizedDescription]) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { self.finish(["passed": false, "error": "Persistence verification timed out"]) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "http", origin.host == "127.0.0.1", origin.port == Int(LocalServer.port), let result = message.body as? [String: Any] else { return }
        var output = result
        output["port"] = LocalServer.port
        finish(output)
    }

    private func finish(_ result: [String: Any]) {
        guard !finished else { return }
        finished = true
        self.result = result
        if result["stage"] as? String == "write" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.quit() }
        } else { quit() }
    }

    private func quit() {
        guard let result else { return }
        print(String(data: try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!)
        fflush(stdout)
        server?.stop()
        DispatchQueue.main.async { NSApp.terminate(nil) }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = PersistenceTest()
app.delegate = delegate
app.run()
