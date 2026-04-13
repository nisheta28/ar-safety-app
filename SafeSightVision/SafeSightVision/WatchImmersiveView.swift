import RealityKit
import SwiftUI
import UIKit

/// Immersive safety overlay: arrow + tier copy; demo controls for QA.
struct WatchImmersiveView: View {
    @State private var tier: WatchTier = .idle
    @State private var bearingDegrees: Float = 42
    @State private var sosContactCount: Int = 3
    @State private var cancelResetTask: Task<Void, Never>?
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace

    var body: some View {
        RealityView { content in
            let anchor = AnchorEntity(world: SIMD3<Float>(0, 1.2, -0.85))
            anchor.name = "SafeSightRoot"

            let arrowRoot = Entity()
            arrowRoot.name = "ArrowRoot"

            let coneMaterial = UnlitMaterial(color: UIColor(red: 0.15, green: 0.55, blue: 0.52, alpha: 1))
            let shaftMaterial = UnlitMaterial(color: UIColor(red: 0.12, green: 0.45, blue: 0.44, alpha: 1))

            let cone = ModelEntity(
                mesh: .generateCone(height: 0.35, radius: 0.06),
                materials: [coneMaterial]
            )
            cone.position = SIMD3<Float>(0, 0.2, 0)
            cone.orientation = simd_quatf(angle: .pi / 2, axis: SIMD3<Float>(1, 0, 0))

            let shaft = ModelEntity(
                mesh: .generateCylinder(height: 0.25, radius: 0.02),
                materials: [shaftMaterial]
            )
            shaft.position = SIMD3<Float>(0, -0.05, 0)

            arrowRoot.addChild(cone)
            arrowRoot.addChild(shaft)
            anchor.addChild(arrowRoot)
            content.add(anchor)
        } placeholder: {
            ProgressView("Loading overlay…")
                .padding()
        } update: { content in
            guard let root = content.entities.first(where: { $0.name == "SafeSightRoot" }),
                  let arrow = root.findEntity(named: "ArrowRoot")
            else { return }

            let showArrow = tier == .guide || tier == .alert
            arrow.isEnabled = showArrow

            let rad = bearingDegrees * .pi / 180
            arrow.orientation = simd_quatf(angle: -rad, axis: SIMD3<Float>(0, 1, 0))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .topLeading) {
            Button {
                Task { await dismissImmersiveSpace() }
            } label: {
                Image(systemName: "chevron.backward.circle.fill")
                    .font(.title2)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .padding(.leading, 24)
            .padding(.top, 24)
            .accessibilityLabel("Leave watch mode")
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: 14) {
                bannerView
                demoPanel
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
        .onChange(of: tier) { _, newValue in
            cancelResetTask?.cancel()
            cancelResetTask = nil
            if newValue == .cancel {
                cancelResetTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 2_600_000_000)
                    guard !Task.isCancelled else { return }
                    tier = .idle
                }
            }
        }
        .onDisappear {
            cancelResetTask?.cancel()
        }
        .onAppear {
            // #region agent log
            DebugSessionLog.log(
                hypothesisId: "H13",
                message: "WatchImmersiveView onAppear",
                data: ["tier": tier.rawValue],
                runId: "immersive-layout"
            )
            // #endregion
        }
    }

    @ViewBuilder
    private var bannerView: some View {
        let copy = bannerCopy
        Text(copy)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.black.opacity(0.78), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityLabel(Text(copy))
    }

    private var bannerCopy: String {
        switch tier {
        case .idle:
            "Watch mode active — choose a tier in Demo below (demo)."
        case .guide:
            "Nearest exit · Quiet mode (demo)"
        case .alert:
            "Trusted contacts notified · Nearest exit ahead (demo)"
        case .sos:
            "SOS sent to \(sosContactCount) contact\(sosContactCount == 1 ? "" : "s") (demo). If no one opens your link in 10 min, emergency steps may follow in a full build."
        case .cancel:
            "Stand down — contacts would get an update that you are safe (demo)."
        }
    }

    private var demoPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Demo — tier")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
            HStack(spacing: 8) {
                ForEach(WatchTier.allCases) { t in
                    Button(t.label) {
                        tier = t
                    }
                    .buttonStyle(.bordered)
                    .tint(tier == t ? Color(red: 0.18, green: 0.42, blue: 0.42) : .secondary)
                    .accessibilityLabel("Set tier to \(t.label)")
                }
            }
            Text("Demo — bearing")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
            HStack(spacing: 8) {
                Button("-15°") { bearingDegrees -= 15 }
                Button("Reset") { bearingDegrees = 0 }
                Button("+15°") { bearingDegrees += 15 }
            }
            .buttonStyle(.bordered)
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Demo controls for tier and bearing")
    }
}
