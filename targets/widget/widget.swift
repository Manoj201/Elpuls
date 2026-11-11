import WidgetKit
import SwiftUI

// Hardcoded from src/theme/index.ts — Swift can't import the JS theme
// module, so this is a third copy of the design tokens (same dual-copy
// spirit already used for business logic like priceRisk.ts/weatherPrep.ts,
// just extended to colors for the first time). Keep in sync by hand.
enum ElpulsColor {
    static let background = Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x1C / 255)
    static let textPrimary = Color(red: 0xF4 / 255, green: 0xF2 / 255, blue: 0xFB / 255)
    static let textMuted = Color(red: 0x79 / 255, green: 0x70 / 255, blue: 0x8F / 255)
    static let accentAmber = Color(red: 0xFF / 255, green: 0xB3 / 255, blue: 0x00 / 255)
    static let positiveTeal = Color(red: 0x2D / 255, green: 0xD4 / 255, blue: 0xBF / 255)
}

let widgetAppGroup = "group.se.elpuls.app"

struct PriceSnapshot {
    let priceOre: Double?
    let trendArrow: String?
    let updatedAt: Date?

    static func readFromAppGroup() -> PriceSnapshot {
        let defaults = UserDefaults(suiteName: widgetAppGroup)
        let priceOre = defaults?.object(forKey: "priceOre") as? Double
        let trendArrow = defaults?.string(forKey: "trendArrow")
        let updatedAtString = defaults?.string(forKey: "updatedAt")
        let updatedAt = updatedAtString.flatMap { ISO8601DateFormatter().date(from: $0) }
        return PriceSnapshot(priceOre: priceOre, trendArrow: trendArrow, updatedAt: updatedAt)
    }
}

struct PriceEntry: TimelineEntry {
    let date: Date
    let snapshot: PriceSnapshot
}

struct PriceProvider: TimelineProvider {
    func placeholder(in context: Context) -> PriceEntry {
        PriceEntry(date: Date(), snapshot: PriceSnapshot(priceOre: 142, trendArrow: "down", updatedAt: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (PriceEntry) -> Void) {
        completion(PriceEntry(date: Date(), snapshot: PriceSnapshot.readFromAppGroup()))
    }

    // Refreshed again in 45 min, matching how often the displayed price is
    // meaningfully stale — also refreshed on demand via ExtensionStorage's
    // reloadWidget() whenever the app writes a new snapshot.
    func getTimeline(in context: Context, completion: @escaping (Timeline<PriceEntry>) -> Void) {
        let entry = PriceEntry(date: Date(), snapshot: PriceSnapshot.readFromAppGroup())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 45, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct PriceWidgetView: View {
    var entry: PriceEntry

    var trendSymbol: String {
        switch entry.snapshot.trendArrow {
        case "up": return "arrow.up"
        case "down": return "arrow.down"
        default: return "minus"
        }
    }

    // Matches HomeScreen's existing "below/above average" chip convention
    // exactly (teal = below average, amber = above) — not a stricter
    // red-flag danger color, since "above average" isn't necessarily bad.
    var trendColor: Color {
        switch entry.snapshot.trendArrow {
        case "up": return ElpulsColor.accentAmber
        case "down": return ElpulsColor.positiveTeal
        default: return ElpulsColor.textMuted
        }
    }

    var body: some View {
        ZStack {
            ElpulsColor.background
            VStack(alignment: .leading, spacing: 4) {
                Text("ELPULS")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(ElpulsColor.textMuted)
                Spacer()
                if let priceOre = entry.snapshot.priceOre {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(String(format: "%.0f", priceOre))
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(ElpulsColor.textPrimary)
                        Image(systemName: trendSymbol)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(trendColor)
                    }
                    Text("öre/kWh")
                        .font(.system(size: 11))
                        .foregroundColor(ElpulsColor.textMuted)
                } else {
                    Text("Open Elpuls")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(ElpulsColor.textPrimary)
                }
            }
            .padding()
        }
    }
}

struct ElpulsWidget: Widget {
    let kind: String = "ElpulsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PriceProvider()) { entry in
            PriceWidgetView(entry: entry)
        }
        .configurationDisplayName("Elpuls")
        .description("Today's electricity price at a glance.")
        .supportedFamilies([.systemSmall])
    }
}
