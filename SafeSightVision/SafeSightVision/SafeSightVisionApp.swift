import SwiftUI

@main
struct SafeSightVisionApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .defaultSize(width: 460, height: 300)

        ImmersiveSpace(id: "WatchSpace") {
            WatchImmersiveView()
        }
        .immersionStyle(selection: .constant(.mixed), in: .mixed)
    }
}
