import Foundation
import CoreMIDI
import WebKit

final class MIDIBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var selected: MIDIEndpointRef = 0
    private var generation: UInt = 0
    private var decoder = MIDIBytes()
    private var testSource = MIDIEndpointRef()
    private let testing: Bool
    init(testing: Bool) { self.testing = testing }

    private func setup() throws {
        if client != 0 { return }
        let status = MIDIClientCreateWithBlock("ConvoCerto" as CFString, &client) { [weak self] _ in
            DispatchQueue.main.async { self?.refresh() }
        }
        guard status == noErr else { throw NSError(domain: "CoreMIDI", code: Int(status)) }
        let inputStatus = MIDIInputPortCreateWithBlock(client, "ConvoCerto input" as CFString, &port) { [weak self] packets, connectionContext in
            var messages: [UInt8] = []
            let offset = MemoryLayout<MIDIPacketList>.offset(of: \.packet)!
            var packet = UnsafeRawPointer(packets).advanced(by: offset).assumingMemoryBound(to: MIDIPacket.self)
            for _ in 0..<packets.pointee.numPackets {
                let data = UnsafeRawPointer(packet).advanced(by: MemoryLayout<MIDIPacket>.offset(of: \.data)!).assumingMemoryBound(to: UInt8.self)
                messages += Array(UnsafeBufferPointer(start: data, count: Int(packet.pointee.length)))
                packet = UnsafePointer(MIDIPacketNext(packet))
            }
            let receivedGeneration = UInt(bitPattern: connectionContext)
            let bytes = messages
            DispatchQueue.main.async {
                guard let self, self.selected != 0, self.generation == receivedGeneration else { return }
                for message in self.decoder.consume(bytes) { self.emit(["kind": "message", "id": self.identifier(self.selected), "data": message]) }
            }
        }
        guard inputStatus == noErr else { MIDIClientDispose(client); client = 0; throw NSError(domain: "CoreMIDI", code: Int(inputStatus)) }
        if testing { createTestSource() }
    }

    private func identifier(_ endpoint: MIDIEndpointRef) -> String {
        var value: Int32 = 0
        MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &value)
        return String(value)
    }
    private func sources() -> [MIDIEndpointRef] { (0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) } }
    private func devices() -> [[String: String]] {
        sources().map { endpoint in
            var name: Unmanaged<CFString>?
            MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &name)
            return ["id": identifier(endpoint), "name": name?.takeRetainedValue() as String? ?? "MIDI input", "manufacturer": "CoreMIDI"]
        }
    }
    func disconnect() {
        if selected != 0 { MIDIPortDisconnectSource(port, selected) }
        selected = 0; generation += 1; decoder = MIDIBytes()
    }
    private func refresh() {
        guard client != 0 else { return }
        if selected != 0 && !sources().contains(selected) { selected = 0; decoder = MIDIBytes() }
        emit(["kind": "devices", "devices": devices()])
    }
    private func emit(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.__convoMIDIReceive?.(\(json))", completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "http", origin.host == "127.0.0.1", origin.port == Int(LocalServer.port), let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        do {
            switch action {
            case "init":
                try setup()
                emit(["kind": "ready", "request": body["request"] ?? 0, "devices": devices()])
            case "select":
                try setup()
                let id = body["id"] as? String ?? ""
                if selected != 0 { MIDIPortDisconnectSource(port, selected); selected = 0 }
                decoder = MIDIBytes(); generation += 1
                if let source = sources().first(where: { identifier($0) == id }) {
                    let status = MIDIPortConnectSource(port, source, UnsafeMutableRawPointer(bitPattern: generation))
                    if status != noErr { throw NSError(domain: "CoreMIDI", code: Int(status)) }
                    selected = source
                } else if !id.isEmpty { refresh(); throw NSError(domain: "MIDI device disconnected", code: -1) }
            case "test-send" where testing:
                let packets = body["packets"] as? [[UInt8]] ?? [body["data"] as? [UInt8] ?? []]
                guard testSource != 0, !packets.isEmpty, packets.count <= 16, packets.allSatisfy({ !$0.isEmpty && $0.count <= 256 }) else { return }
                let capacity = 8192
                let memory = UnsafeMutableRawPointer.allocate(byteCount: capacity, alignment: MemoryLayout<MIDIPacketList>.alignment)
                defer { memory.deallocate() }
                let list = memory.bindMemory(to: MIDIPacketList.self, capacity: 1)
                var packet: UnsafeMutablePointer<MIDIPacket>? = MIDIPacketListInit(list)
                for data in packets {
                    guard let current = packet else { return }
                    packet = data.withUnsafeBufferPointer { bytes in MIDIPacketListAdd(list, capacity, current, 0, data.count, bytes.baseAddress!) }
                }
                guard packet != nil else { return }
                MIDIReceived(testSource, list)
            case "test-disconnect" where testing:
                if testSource != 0 { MIDIEndpointDispose(testSource); testSource = 0; refresh() }
            case "test-reconnect" where testing: createTestSource(); refresh()
            default: break
            }
        } catch { emit(["kind": "error", "request": body["request"] ?? 0, "error": "MIDI接続に失敗しました: \(error.localizedDescription)"]) }
    }

    private func createTestSource() {
        guard testSource == 0 else { return }
        MIDISourceCreate(client, "ConvoCerto Test Input" as CFString, &testSource)
    }
    deinit {
        if port != 0 { MIDIPortDispose(port) }
        if testSource != 0 { MIDIEndpointDispose(testSource) }
        if client != 0 { MIDIClientDispose(client) }
    }
}
