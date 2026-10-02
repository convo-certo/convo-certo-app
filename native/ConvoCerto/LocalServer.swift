import Foundation
import Network

final class LocalServer {
    private let root: URL
    private let listener: NWListener
    private let preferences: UserDefaults?
    private let queue = DispatchQueue(label: "ConvoCerto.local-http")
    private(set) static var port: UInt16 = 0
    static let portPreference = "localServerPort"

    init(root: URL, testing: Bool = false, defaults: UserDefaults = .standard) throws {
        self.root = root.resolvingSymlinksInPath()
        preferences = testing ? nil : defaults
        let savedPort = preferences?.object(forKey: Self.portPreference)
        let requestedPort: NWEndpoint.Port
        if let savedPort {
            guard let value = savedPort as? Int, (1024...65535).contains(value), let port = NWEndpoint.Port(rawValue: UInt16(value)) else {
                let japanese = Locale.preferredLanguages.first?.hasPrefix("ja") == true
                let message = japanese
                    ? "保存された接続先の設定を読み込めません。練習データを保護するため、別の接続先では起動しません。"
                    : "The saved connection setting could not be read. The app will not use a different connection for your practice data."
                throw NSError(domain: "ConvoCerto.LocalServer", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
            }
            requestedPort = port
        } else { requestedPort = .any }
        Self.port = requestedPort.rawValue
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: requestedPort)
        listener = try NWListener(using: parameters)
    }

    func start(ready: @escaping (Error?) -> Void) {
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                guard let self, let boundPort = self.listener.port?.rawValue else { return }
                DispatchQueue.main.async {
                    self.preferences?.set(Int(boundPort), forKey: Self.portPreference)
                    Self.port = boundPort
                    ready(nil)
                }
            case .failed(let error):
                self?.listener.cancel()
                DispatchQueue.main.async { ready(error) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            connection.start(queue: self?.queue ?? .global())
            self?.receive(connection, collected: Data())
        }
        listener.start(queue: queue)
    }

    func stop() { listener.cancel() }

    private func receive(_ connection: NWConnection, collected: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, complete, error in
            guard let self, error == nil else { connection.cancel(); return }
            var request = collected
            if let data { request.append(data) }
            if request.count > 16384 { self.respond(connection, status: "431 Request Header Fields Too Large"); return }
            guard let text = String(data: request, encoding: .utf8), text.contains("\r\n\r\n") else {
                if complete { connection.cancel() } else { self.receive(connection, collected: request) }
                return
            }
            let line = text.components(separatedBy: "\r\n")[0].split(separator: " ")
            guard line.count == 3, line[0] == "GET" || line[0] == "HEAD" else { self.respond(connection, status: "405 Method Not Allowed"); return }
            let path = String(line[1]).components(separatedBy: "?")[0].removingPercentEncoding ?? ""
            guard path.hasPrefix("/"), !path.contains("\0"), !path.split(separator: "/").contains("..") else { self.respond(connection, status: "403 Forbidden"); return }
            let routes = ["/", "/guide", "/perform", "/step1", "/step2", "/step3", "/step4"]
            let routePath = path.count > 1 && path.hasSuffix("/") ? String(path.dropLast()) : path
            let relative = routes.contains(routePath) ? "index.html" : String(path.dropFirst())
            let file = self.root.appendingPathComponent(relative).resolvingSymlinksInPath()
            guard file.path.hasPrefix(self.root.path + "/") else { self.respond(connection, status: "403 Forbidden"); return }
            guard let bytes = try? Data(contentsOf: file) else { self.respond(connection, status: "404 Not Found"); return }
            let types = ["woff2": "font/woff2", "txt": "text/plain; charset=utf-8", "html": "text/html; charset=utf-8", "js": "text/javascript", "css": "text/css", "json": "application/json", "musicxml": "application/vnd.recordare.musicxml+xml", "mxl": "application/vnd.recordare.musicxml", "xml": "application/xml", "mp3": "audio/mpeg", "svg": "image/svg+xml", "png": "image/png", "wasm": "application/wasm", "zip": "application/zip"]
            self.respond(connection, status: "200 OK", body: bytes, type: types[file.pathExtension] ?? "application/octet-stream", head: line[0] == "HEAD")
        }
        queue.asyncAfter(deadline: .now() + 15) { connection.cancel() }
    }

    private func respond(_ connection: NWConnection, status: String, body: Data = Data(), type: String = "text/plain", head: Bool = false) {
        let header = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\n\r\n"
        var response = Data(header.utf8)
        if !head { response.append(body) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}
