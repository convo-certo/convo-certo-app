import AppKit
import WebKit
import PDFKit

final class PrintBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    weak var webView: WKWebView?
    private var preview: WKWebView?
    private var expiry: DispatchWorkItem?
    private let testing: Bool
    init(testing: Bool) { self.testing = testing }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "http", origin.host == "127.0.0.1", origin.port == Int(LocalServer.port) else { return }
        guard preview == nil else { publish(["status":"failed", "error":"印刷処理が進行中です。"]); return }
        guard let body = message.body as? [String:Any], let html = body["html"] as? String, html.utf8.count <= 30_000_000 else { publish(["status":"failed", "error":"印刷用データを読み込めません。"]); return }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        let view = WKWebView(frame: NSRect(x:0,y:0,width:718,height:1000),configuration:config)
        preview = view
        let timeout = DispatchWorkItem { [weak self] in self?.finish(["status":"failed","error":"印刷用PDFの作成が完了しませんでした。再試行してください。"] ) }
        expiry = timeout; DispatchQueue.main.asyncAfter(deadline:.now()+30,execute:timeout)
        view.navigationDelegate = self
        view.loadHTMLString("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:\">" + html, baseURL:nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("Array.from(document.querySelectorAll('svg')).map(svg=>{const r=svg.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})") { [weak self] result, error in
            guard let self, self.preview === webView else { return }
            guard error == nil, let pages = result as? [[String:Double]], !pages.isEmpty, pages.count <= 200 else { self.finish(["status":"failed","error":"印刷する楽譜ページを確認できません。"]); return }
            let data = NSMutableData()
            var paper = CGRect(x:0,y:0,width:595.28,height:841.89)
            guard let consumer = CGDataConsumer(data:data), let context = CGContext(consumer:consumer,mediaBox:&paper,nil) else { self.finish(["status":"failed","error":"PDFを準備できません。"]); return }
            self.render(pages, index:0, view:webView, context:context, data:data)
        }
    }

    private func render(_ pages:[[String:Double]], index:Int, view:WKWebView, context:CGContext, data:NSMutableData) {
        if index == pages.count {
            context.closePDF()
            guard let pdf = PDFDocument(data:data as Data) else { finish(["status":"failed","error":"PDFを作成できません。"]); return }
            printDocument(pdf)
            return
        }
        let page = pages[index]
        guard let x=page["x"], let y=page["y"], let width=page["width"], let height=page["height"], x.isFinite, y.isFinite, width.isFinite, height.isFinite, width>0, height>0 else { context.closePDF(); finish(["status":"failed","error":"楽譜のページ寸法が不正です。"]); return }
        let config = WKPDFConfiguration(); config.rect = CGRect(x:x,y:y,width:width,height:height)
        view.createPDF(configuration:config) { [weak self] result in
            guard let self, self.preview === view else { context.closePDF(); return }
            guard case .success(let bytes) = result, let provider = CGDataProvider(data:bytes as CFData), let source = CGPDFDocument(provider), let pdfPage=source.page(at:1) else { context.closePDF(); self.finish(["status":"failed","error":"楽譜ページをPDFにできません。"]); return }
            let bounds=pdfPage.getBoxRect(.mediaBox)
            let scale=min(538.58/bounds.width,785.19/bounds.height)
            context.beginPDFPage(nil); context.saveGState()
            context.translateBy(x:28.35,y:841.89-28.35-bounds.height*scale)
            context.scaleBy(x:scale,y:scale); context.translateBy(x:-bounds.minX,y:-bounds.minY)
            context.drawPDFPage(pdfPage); context.restoreGState(); context.endPDFPage()
            self.render(pages,index:index+1,view:view,context:context,data:data)
        }
    }

    private func printDocument(_ pdf:PDFDocument) {
        expiry?.cancel(); expiry = nil
        let info = NSPrintInfo()
        info.paperSize = NSSize(width:595.28,height:841.89)
        var directory: URL?
        if testing {
            do {
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("convocerto-print-" + UUID().uuidString)
                try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
                directory = folder; info.jobDisposition = .save
                info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = folder.appendingPathComponent("score.pdf")
            } catch { finish(["status":"failed","error":error.localizedDescription]); return }
        }
        defer { if let directory { try? FileManager.default.removeItem(at:directory) } }
        guard let operation = pdf.printOperation(for:info,scalingMode:.pageScaleToFit,autoRotate:true) else { finish(["status":"failed","error":"印刷処理を準備できません。"]); return }
        operation.showsPrintPanel = !testing; operation.showsProgressPanel = !testing
        let completed = operation.run()
        if testing {
            guard completed, let directory, let printed=PDFDocument(url:directory.appendingPathComponent("score.pdf")), printed.pageCount == pdf.pageCount else { finish(["status":"failed","error":"印刷PDFを作成できませんでした。"]); return }
            if let page=printed.page(at:0), let tiff=page.thumbnail(of:NSSize(width:700,height:1000),for:.mediaBox).tiffRepresentation, let bitmap=NSBitmapImageRep(data:tiff), let png=bitmap.representation(using:.png,properties:[:]) {
                try? png.write(to:URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("build/native-print-preview.png"))
            }
            finish(["status":"completed","pages":printed.pageCount])
        } else { finish(["status":completed ? "completed" : "cancelled"]) }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(["status":"failed","error":error.localizedDescription]) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(["status":"failed","error":error.localizedDescription]) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(["status":"failed","error":"印刷用の表示処理が終了しました。再試行してください。"]) }
    private func finish(_ result:[String:Any]) { expiry?.cancel(); expiry = nil; preview?.navigationDelegate = nil; preview?.stopLoading(); preview = nil; publish(result) }
    private func publish(_ result:[String:Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject:result), let json = String(data:data,encoding:.utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('convocerto-print',{detail:\(json)}));",completionHandler:nil)
    }
}
