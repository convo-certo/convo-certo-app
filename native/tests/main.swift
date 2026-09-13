import Foundation
var count = 0
func check(_ expected: [[UInt8]], _ actual: [[UInt8]], _ label: String) {
    guard expected == actual else { fputs("FAIL: \(label): \(actual)\n", stderr); exit(1) }
    count += 1
}
var decoder = MIDIBytes()
check([], decoder.consume([0x90, 60]), "fragmented status and pitch")
check([[0x90,60,90],[0x90,61,0]], decoder.consume([90,61,0]), "running status and zero velocity")
check([[0xb1,11,96]], decoder.consume([0xb1,11,0xf8,96]), "realtime clock does not split CC")
check([[0xc0,12],[0xc0,13],[0xd0,70]], decoder.consume([0xc0,12,13,0xd0,70]), "two-byte messages")
check([[0x80,60,0]], decoder.consume([0xf0,10,11,0xf8,12,0xf7,1,2,0x80,60,0]), "SysEx data never leaks into notes")
check([[0xe0,0,64]], decoder.consume([0xf2,1,2,3,0xe0,0,64]), "system common cancels running status")
decoder = MIDIBytes()
check([], decoder.consume([60,70,80]), "new connection discards orphaned data")
print("{\"passed\":true,\"checks\":\(count),\"scope\":\"MIDI 1.0 byte stream decoding\"}")
