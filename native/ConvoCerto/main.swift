import AppKit
import WebKit

func nativeText(_ japanese: String, _ english: String) -> String {
    let language = Locale.preferredLanguages.first { $0.hasPrefix("ja") || $0.hasPrefix("en") }
    return language?.hasPrefix("ja") == true ? japanese : english
}

let soakSeconds: Int? = {
    guard CommandLine.arguments.contains("--soak-test") else { return nil }
    let arguments = CommandLine.arguments
    let index = arguments.firstIndex(of: "--soak-seconds")
    let value = index.map { $0 + 1 < arguments.count ? Int(arguments[$0 + 1]) : nil } ?? 1800
    guard !arguments.contains("--smoke-test"), !arguments.contains("--recovery-test"), let seconds = value, (20...7200).contains(seconds) else {
        fputs("Use --soak-test [--soak-seconds 20...7200] without other test modes\n", stderr)
        exit(2)
    }
    return seconds
}()

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var printer: PrintBridge?
    private var downloads: Downloads?
    private var midi: MIDIBridge?
    private var server: LocalServer?
    private let smoke = CommandLine.arguments.contains("--smoke-test") || CommandLine.arguments.contains("--recovery-test") || soakSeconds != nil
    private let recoveryTest = CommandLine.arguments.contains("--recovery-test")
    private var tested = false
    private var recovering = false
    private var recoveryCount = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = smoke ? .nonPersistent() : .default()
        printer = PrintBridge(testing: smoke)
        config.userContentController.add(printer!, name: "convoPrint")
        midi = MIDIBridge(testing: smoke)
        config.userContentController.add(midi!, name: "convoMIDI")
        if let url = Bundle.main.resourceURL?.appendingPathComponent("midi.js"), let script = try? String(contentsOf: url, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if smoke { config.userContentController.add(self, name: "testResult") }
        webView = WKWebView(frame: .zero, configuration: config)
        midi?.webView = webView
        printer?.webView = webView
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = nativeText("ConvoCerto — 共奏", "ConvoCerto — Play together")
        window.contentView = webView
        downloads = Downloads(testing: smoke); downloads?.window = window; downloads?.webView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: nativeText("終了", "Quit ConvoCerto"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); menu.addItem(editItem)
        let editMenu = NSMenu(title: nativeText("編集", "Edit")); editItem.submenu = editMenu
        for (name, action, key) in [(nativeText("コピー", "Copy"), "copy:", "c"), (nativeText("ペースト", "Paste"), "paste:", "v"), (nativeText("すべて選択", "Select All"), "selectAll:", "a")] { editMenu.addItem(withTitle: name, action: Selector(action), keyEquivalent: key) }
        NSApp.mainMenu = menu
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("web"), FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else { fail(nativeText("同梱されたWebアプリが見つかりません。", "The bundled web app could not be found.")); return }
        startServer(root: root)
        if smoke { DispatchQueue.main.asyncAfter(deadline: .now() + Double(soakSeconds ?? 0) + 60) { self.fail(nativeText("WKWebView検証がタイムアウトしました", "WKWebView verification timed out.")) } }
    }

    private func startServer(root: URL) {
        server?.stop()
        do {
            server = try LocalServer(root: root, testing: smoke)
            server?.start { [weak self] error in
                guard let self else { return }
                if let error { self.serverFailed(error, root: root); return }
                self.webView.load(URLRequest(url: URL(string: "http://127.0.0.1:\(LocalServer.port)/perform")!))
            }
        } catch { serverFailed(error, root: root) }
    }

    private func serverFailed(_ error: Error, root: URL) {
        if smoke { fail("Local server could not start on port \(LocalServer.port): \(error)"); return }
        let alert = NSAlert()
        alert.messageText = nativeText("保存済みの練習を開く接続先が使えません", "The connection for your saved practice is unavailable")
        alert.informativeText = nativeText(
            "ConvoCertoがほかに開いていれば終了して、再試行してください。練習データを保護するため、別の接続先には切り替えません。データは削除していません。\n\nポート: \(LocalServer.port)\n\(error.localizedDescription)",
            "Close any other copy of ConvoCerto and retry. The app will keep the same connection for your saved practice. No practice data has been deleted.\n\nPort: \(LocalServer.port)\n\(error.localizedDescription)")
        alert.addButton(withTitle: nativeText("再試行", "Retry"))
        alert.addButton(withTitle: nativeText("終了", "Quit"))
        alert.beginSheetModal(for: window) { [weak self] response in
            if response == .alertFirstButtonReturn { self?.startServer(root: root) }
            else { NSApp.terminate(nil) }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let origin = navigationAction.sourceFrame.securityOrigin
        if navigationAction.shouldPerformDownload, origin.protocol == "http", origin.host == "127.0.0.1", origin.port == Int(LocalServer.port), url.scheme == "blob" || url.host == "127.0.0.1" && url.port == Int(LocalServer.port) {
            decisionHandler(.download); return
        }
        if url.host == "127.0.0.1" && url.port == Int(LocalServer.port) && url.scheme == "http" {
            if navigationAction.targetFrame == nil && navigationAction.navigationType == .linkActivated {
                decisionHandler(.cancel)
                NSWorkspace.shared.open(url)
            } else { decisionHandler(.allow) }
        }
        else { decisionHandler(.cancel); if navigationAction.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) } }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = downloads }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = downloads }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { midi?.disconnect() }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if smoke && !recoveryTest { fail(nativeText("表示プロセスが終了しました。", "The display process ended.")); return }
        offerRecovery()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let failure = error as NSError
        if recovering || failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled { return }
        fail(error.localizedDescription)
    }

    private func offerRecovery() {
        guard !recovering else { return }
        recovering = true
        recoveryCount += 1
        midi?.disconnect()
        webView.stopLoading()
        if let sheet = window.attachedSheet { window.endSheet(sheet, returnCode: .cancel) }
        let alert = NSAlert()
        alert.messageText = nativeText("演奏画面が中断しました", "The practice screen was interrupted")
        alert.informativeText = nativeText("画面を開き直すと、マイ楽譜から保存済みの練習を選べます。未保存の変更や演奏位置は復元されません。マイク・MIDIはつなぎ直してください。伴奏は自動では再開しません。", "Reopen the screen, then choose saved practice from My scores. Unsaved changes and your playback position will not be restored. Reconnect your microphone or MIDI device. Accompaniment will not restart automatically.")
        alert.addButton(withTitle: nativeText("画面を開き直す", "Reopen screen"))
        alert.addButton(withTitle: nativeText("終了", "Quit"))
        alert.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            if response == .alertFirstButtonReturn {
                self.recovering = false
                self.tested = false
                self.webView.load(URLRequest(url: URL(string: "http://127.0.0.1:\(LocalServer.port)/perform")!))
            } else { NSApp.terminate(nil) }
        }
        if recoveryTest {
            guard recoveryCount == 1 else { fail(nativeText("画面復旧が繰り返し失敗しました", "The screen failed again during recovery.")); return }
            print("{\"progress\":\"native-recovery-prompt\"}"); fflush(stdout)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { alert.buttons.first?.performClick(nil) }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard smoke, !tested else { return }; tested = true
        let filename = soakSeconds != nil ? "soak.js" : recoveryTest ? "recovery-smoke.js" : "smoke.js"
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(filename), let script = try? String(contentsOf: url, encoding: .utf8) else { fail(nativeText("検証スクリプトがありません", "The verification script could not be found.")); return }
        webView.evaluateJavaScript("window.__convoSoakSeconds = \(soakSeconds ?? 0); window.__convoRecoveryStage = \(recoveryCount);\n" + script) { _, error in if let error { self.fail(error.localizedDescription) } }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard smoke, message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == "127.0.0.1", let result = message.body as? [String: Any] else { return }
        print(String(data: (try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])) ?? Data(), encoding: .utf8) ?? "{}")
        fflush(stdout)
        if result["progress"] is String && result["passed"] == nil { return }
        exit(result["passed"] as? Bool == true ? 0 : 1)
    }

    private func fail(_ message: String) {
        if smoke { print("NATIVE_TEST_FAILED: \(message)"); fflush(stdout); exit(1) }
        let alert = NSAlert(); alert.messageText = nativeText("ConvoCertoを続けられません", "ConvoCerto cannot continue"); alert.informativeText = message; alert.runModal(); NSApp.terminate(nil)
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
