import Foundation

/// Response tiers for the in-the-moment safety flow (UX demo; no backend).
enum WatchTier: String, CaseIterable, Identifiable, Sendable {
    case idle
    case guide
    case alert
    case sos
    case cancel

    var id: String { rawValue }

    var label: String {
        switch self {
        case .idle: "Idle"
        case .guide: "Guide"
        case .alert: "Alert"
        case .sos: "SOS"
        case .cancel: "Cancel"
        }
    }
}
