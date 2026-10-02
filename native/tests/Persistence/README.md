# Native restart persistence

Normal app launches retain their first successfully bound loopback port in the app's `localServerPort` preference. The web origin therefore stays the same after quitting and reopening, so WebKit can reopen IndexedDB and localStorage. The bundle identifier must remain stable across updates unless an explicit storage migration is provided.

If the saved port is occupied, startup fails with a Retry / Quit sheet. It does not switch to an empty origin. After the other process releases the port, Retry uses the same saved origin. Invalid saved port values also fail closed. Smoke, recovery and soak runs keep using transient ports and nonpersistent WebKit stores.

Run the isolated verification on macOS 14 or later:

```sh
node scripts/test-native-persistence.mjs
```

The regular app still targets macOS 13. The verification requires macOS 14 because it uses WebKit's public API for a separate persistent profile. It compiles the actual `LocalServer.swift` into a temporary test app with a unique bundle ID, uses a UUID-specific WebKit store and a separate preferences suite, and launches four independent processes:

1. Save fixture MusicXML, rehearsal settings, journal data and localStorage; allow one second for WebKit storage writes to settle, then quit normally.
2. Quit and relaunch; verify the same origin and data in the actual library and journal database names.
3. Occupy the saved port with a separate listener; verify startup rejects the conflict without selecting another port.
4. Release the port and relaunch; verify the original data again.

The harness clears its own website data and preference suite, then removes its temporary app. It does not load or clear the user's normal WebKit store. WebKit may retain empty metadata for the test profile. Results are written to `verification-results/native-persistence-*/report.json`.

This verifies native server and WebKit persistence across app processes under the stated normal-quit condition. It does not prove that a write immediately followed by forced termination is durable, run the full React score-import interface, or prove recovery from a disk failure. Existing smoke and recovery checks cover their separate UI paths.

## Earlier development builds

Earlier versions selected a new port on every launch. Their data may still exist under earlier WebKit origins, but this change does not discover, merge or delete those origins. The new saved port cannot identify which old origin contains the desired practice. Export a portable practice file from an older app session that is still open and import it into the new version. Previously closed sessions without an export may require a separate migration investigation; automatic recovery is not claimed.
