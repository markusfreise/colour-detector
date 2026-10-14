import SwiftUI

/// The two panels of the web app's right edge: the settings, and the colours (in layer mode the
/// layers). On iPad and Mac they share the inspector column, on iPhone a sheet over the picture.
enum PanelTab: String {
    case settings, colours
}

struct PanelView: View {
    @Environment(Session.self) private var session
    @Binding var tab: PanelTab
    let showPaintBox: () -> Void

    var body: some View {
        // The switch sits in the panel itself: in the inspector a toolbar item would join the main bar.
        VStack(spacing: 0) {
            Picker("Panel", selection: $tab) {
                Text("Settings").tag(PanelTab.settings)
                Text(session.layerMode ? "Layers" : "Colours").tag(PanelTab.colours)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal)
            .padding(.top, 16)
            .padding(.bottom, 4)
            switch tab {
            case .settings: ControlsView().scrollContentBackground(.hidden)
            case .colours: colours
            }
        }
        .background(Theme.page)
    }

    private var colours: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if session.layerMode {
                    HStack {
                        Text("Tap a layer to see it alone.").font(.footnote).foregroundStyle(.secondary)
                        Spacer()
                        Button("Show All") { session.soloLayer(nil) }
                            .buttonStyle(.bordered)
                            .disabled(session.layers == nil || (session.layerStep == nil && !session.layerView.contains(0)))
                    }
                    LayerListView(showPaintBox: showPaintBox)
                } else if session.entries.isEmpty {
                    ContentUnavailableView("No Colours Yet", systemImage: "swatchpalette", description: Text("The colours appear once the picture is analysed."))
                } else {
                    PaletteView()
                }
            }
            .padding()
        }
    }
}
