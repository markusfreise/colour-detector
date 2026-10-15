import SwiftUI

/// The saved pictures. Tap one to open it with its settings and colour changes.
struct CollectionView: View {
    @Environment(PictureCollection.self) private var collection
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var renamed: SavedPicture?
    @State private var newName = ""
    @State private var toDelete: SavedPicture?
    @State private var showingPaywall = false
    @State private var saveError: String?

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if collection.items.isEmpty {
                    ContentUnavailableView(
                        "No Pictures Yet",
                        systemImage: "photo.on.rectangle",
                        description: Text("Save keeps the photo with its settings and colour changes on this device.")
                    )
                    .padding(.top, 60)
                } else {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(collection.items) { item in card(item) }
                    }
                    .padding()
                }
            }
            .navigationTitle("Collection")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button(L(session.savedID == nil ? "Save Picture" : "Save Changes"), systemImage: "square.and.arrow.down", action: save)
                        .labelStyle(.titleAndIcon)
                        .disabled(session.image == nil)
                }
            }
            .sheet(isPresented: $showingPaywall) { PaywallView(reason: "save more than one picture") }
            .alert("Rename Picture", isPresented: Binding(get: { renamed != nil }, set: { if !$0 { renamed = nil } }), presenting: renamed) { item in
                TextField("Name", text: $newName)
                Button("Cancel", role: .cancel) {}
                Button("Save") { collection.rename(item.id, to: newName, session: session) }
            }
            .confirmationDialog("Delete this picture?", isPresented: Binding(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible, presenting: toDelete) { item in
                Button(L("Delete %@", item.name), role: .destructive) { collection.delete(item.id, session: session) }
            } message: { _ in
                Text("The photo in your photo library is not touched.")
            }
            .alert("Could not save the picture", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveError ?? "")
            }
        }
        #if os(macOS)
        .frame(minWidth: 560, minHeight: 480)
        #endif
    }

    private func card(_ item: SavedPicture) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                collection.open(item.id, in: session)
                dismiss()
            } label: {
                Group {
                    if let thumbnail = collection.thumbnail(for: item.id) {
                        Image(decorative: thumbnail, scale: 1).resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Rectangle().fill(.quaternary)
                    }
                }
                .frame(minWidth: 0, maxWidth: .infinity)
                .aspectRatio(4 / 3, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(item.id == session.savedID ? Color.accentColor : .clear, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L("Open %@", item.name))
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.name).fontWeight(.semibold).lineLimit(1)
                    Text(item.updatedAt, format: .dateTime.day().month().year()).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Menu {
                    Button("Rename", systemImage: "pencil") {
                        newName = item.name
                        renamed = item
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) { toDelete = item }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .accessibilityLabel(L("Actions for %@", item.name))
            }
        }
    }

    private func save() {
        guard session.savedID != nil || store.unlocked || collection.items.count < Store.freePictures else {
            showingPaywall = true
            return
        }
        do {
            try collection.save(session)
        } catch {
            saveError = error.localizedDescription
        }
    }
}
