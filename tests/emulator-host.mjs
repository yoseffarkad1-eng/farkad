// Where the Firestore emulator actually is, for the six suites that talk to one.
//
// `firebase emulators:exec` sets FIRESTORE_EMULATOR_HOST in the environment of the script
// it runs — "127.0.0.1:8080" by default, or whatever port the config it was given names.
// Every one of those six suites ignored it and wrote `host: '127.0.0.1', port: 8080` by
// hand, which is why they could only ever run one at a time on one machine.
//
// That mattered more than a tidiness note. tests/README.md recorded the constraint and got
// the REASON wrong: it said passing --config with a private port "does NOT fix it: the
// websocket port is not read from that config and still collides". The websocket port IS
// read from that config, as long as the config names it — measured on this commit:
//
//     firebase emulators:exec --only firestore --config firebase.alt.json "..."
//       with { "firestore": { "port": 8099, "websocketPort": 9199 } }
//     ✔  firestore: Firestore Emulator UI websocket is running on 9199.
//     EMULATOR_HOST=127.0.0.1:8099
//
// and it started while another emulator held 8080 and 9150. What actually collided was the
// hard-coded 8080 in the suites themselves: the run above then died with
// `connect ECONNREFUSED 127.0.0.1:8080`, reaching past its own emulator for the other one.
//
// So the old advice — run them serially — was right, and the reason written beside it was
// not. A wrong reason is worse than none: it sent the next person to look at firebase-tools
// instead of at the six lines that were the whole problem.
//
// The default is unchanged. Nothing set, or the variable malformed, gives 127.0.0.1:8080
// exactly as before, so a plain `npm run test:emulator` behaves identically.
export function emulatorHost() {
    const raw = typeof process !== 'undefined' && process.env
        ? process.env.FIRESTORE_EMULATOR_HOST
        : '';
    // "host:port". A bare IPv6 literal would need brackets and the emulator never emits
    // one here, so the last colon is the separator and anything unparseable falls back
    // rather than throwing — a suite that cannot read this should still run the way it
    // always did.
    const at = String(raw || '').lastIndexOf(':');
    if (at <= 0) return { host: '127.0.0.1', port: 8080 };
    const port = Number(String(raw).slice(at + 1));
    const host = String(raw).slice(0, at);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
        return { host: '127.0.0.1', port: 8080 };
    }
    return { host, port };
}
