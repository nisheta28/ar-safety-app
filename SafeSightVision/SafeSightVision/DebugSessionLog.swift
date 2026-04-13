import Foundation

// #region agent log
/// Debug-mode NDJSON: POST to ingest + best-effort local append (simulator sandbox may block local path).
enum DebugSessionLog {
    private static let logPath = "/Users/nisheta/Development/AR Project/.cursor/debug-54e69c.log"

    static func log(hypothesisId: String, message: String, data: [String: String] = [:], runId: String = "run1") {
        let payload: [String: Any] = [
            "sessionId": "54e69c",
            "hypothesisId": hypothesisId,
            "location": "SafeSightVision",
            "message": message,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "runId": runId,
            "data": data,
        ]
        guard let json = try? JSONSerialization.data(withJSONObject: payload),
              let line = String(data: json, encoding: .utf8)
        else { return }

        appendLocalNDJSON(line)
        // #region agent log
        // Avoid URLSession on visionOS Simulator — causes "operation not supported on socket" / handler drops (H15).
        print("DEBUG_NDJSON", line)
        // #endregion
    }

    private static func appendLocalNDJSON(_ line: String) {
        let url = URL(fileURLWithPath: logPath)
        let data = (line + "\n").data(using: .utf8) ?? Data()
        if FileManager.default.fileExists(atPath: logPath) {
            guard let h = try? FileHandle(forWritingTo: url) else { return }
            defer { try? h.close() }
            try? h.seekToEnd()
            try? h.write(contentsOf: data)
        } else {
            try? data.write(to: url, options: .atomic)
        }
    }
}

// #endregion
