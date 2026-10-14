import SwiftUI

/// The one-time purchase. Shown when a free limit is reached.
struct PaywallView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    /// What the user tried to do, e.g. "save more than one picture".
    let reason: String

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Unlock Everything").font(.title.bold())
            Text("The free version holds one saved picture and one paint box, without close-ups. To \(reason), unlock the full version with a single purchase. No subscription.")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 8) {
                Label("Save as many pictures as you like", systemImage: "photo.on.rectangle")
                Label("Keep a paint box for every set of paints you own", systemImage: "shippingbox")
                Label("Zoom in on parts of a picture and analyse them on their own", systemImage: "viewfinder")
            }
            if let error = store.error {
                Text(error).foregroundStyle(.red)
            }
            Spacer(minLength: 0)
            VStack(spacing: 10) {
                Button {
                    Task { await store.purchase() }
                } label: {
                    Text(store.price.map { "Unlock for \($0)" } ?? "Unlock").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Button("Restore Purchase") { Task { await store.restore() } }
                Button("Not Now") { dismiss() }
            }
            .frame(maxWidth: .infinity)
            .disabled(store.busy)
        }
        .padding(24)
        .presentationDetents([.medium, .large])
        .onChange(of: store.unlocked) { if store.unlocked { dismiss() } }
        #if os(macOS)
        .frame(width: 420, height: 400)
        #endif
    }
}
