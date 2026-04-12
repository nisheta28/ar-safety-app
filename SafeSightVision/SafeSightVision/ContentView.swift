import SwiftUI

/// Minimal shell: no login, no contacts — only entry to immersive watch mode.
struct ContentView: View {
    @Environment(\.openImmersiveSpace) private var openImmersiveSpace
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace
    @State private var watchSpaceOpen = false

    var body: some View {
        VStack(spacing: 24) {
            Text("SafeSight")
                .font(.largeTitle.weight(.semibold))

            Text("Watch mode shows a discreet overlay in your space — exit direction and status only you see (demo).")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if watchSpaceOpen {
                Button("Exit watch mode") {
                    Task {
                        await dismissImmersiveSpace()
                        watchSpaceOpen = false
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.18, green: 0.42, blue: 0.42))
                .accessibilityLabel("Exit watch mode")
            } else {
                Button("Start watch mode") {
                    Task {
                        // #region agent log
                        DebugSessionLog.log(
                            hypothesisId: "H2",
                            message: "openImmersiveSpace invoked",
                            data: ["spaceId": "WatchSpace"],
                            runId: "post-fix"
                        )
                        // #endregion
                        let result = await openImmersiveSpace(id: "WatchSpace")
                        // #region agent log
                        DebugSessionLog.log(
                            hypothesisId: "H2",
                            message: "openImmersiveSpace returned",
                            data: [
                                "result": String(describing: result),
                                "opened": String(result == .opened),
                            ],
                            runId: "post-fix"
                        )
                        // #endregion
                        if result == .opened {
                            watchSpaceOpen = true
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.18, green: 0.42, blue: 0.42))
                .accessibilityLabel("Start watch mode")
            }
        }
        .padding(32)
        .frame(minWidth: 420, minHeight: 280)
    }
}

#Preview {
    ContentView()
}
