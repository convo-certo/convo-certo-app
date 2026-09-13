import Foundation

struct MIDIBytes {
    private var running: UInt8?
    private var pending: [UInt8] = []
    mutating func consume(_ bytes: [UInt8]) -> [[UInt8]] {
        var result: [[UInt8]] = []
        for byte in bytes {
            if byte >= 0xf8 { continue }
            if byte >= 0xf0 { running = nil; pending = []; continue }
            if byte >= 0x80 { running = byte; pending = []; continue }
            guard let status = running else { continue }
            pending.append(byte)
            let length = status & 0xe0 == 0xc0 ? 1 : 2
            if pending.count == length { result.append([status] + pending); pending = [] }
        }
        return result
    }
}
