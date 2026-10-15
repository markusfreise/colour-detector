import SwiftUI

/// The two panels of the web app's right edge: the settings, and the colours (in layer mode the
/// layers). Each floats over the picture on its own card, opened by its button at the top right.
enum PanelTab: String {
    case settings, colours
}

struct PanelView: View {
    @Environment(Session.self) private var session
    let tab: PanelTab
    let showPaintBox: () -> Void

    var body: some View {
        switch tab {
        case .settings: ControlsView()
        case .colours: colours
        }
    }

    private var colours: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(session.layerMode ? "Layers" : "Colours").font(Theme.title)
                if session.layerMode {
                    HStack {
                        Text("Tap a layer to see it alone.").font(Theme.small).foregroundStyle(Theme.copyLight)
                        Spacer()
                        Button("Show All") { session.soloLayer(nil) }
                            .buttonStyle(.bordered)
                            .disabled(session.layers == nil || (session.layerStep == nil && !session.layerView.contains(0)))
                    }
                    LayerListView(showPaintBox: showPaintBox)
                } else if session.entries.isEmpty {
                    Text("The colours appear once the picture is analysed.")
                        .font(Theme.small)
                        .foregroundStyle(Theme.copyLight)
                } else {
                    PaletteView()
                }
            }
        }
        .scrollIndicators(.automatic)
    }
}
