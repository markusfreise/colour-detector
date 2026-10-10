import PhotosUI
import SwiftUI

/// The main screen: the picture, the settings, and the list of colours.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    @Environment(PictureCollection.self) private var collection
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var showingPaintBox = false
    @State private var showingCollection = false
    @State private var showingPhotos = false
    @State private var showingFiles = false
    @State private var showingCamera = false
    @State private var showingPaywall = false
    @State private var photo: PhotosPickerItem?
    @State private var boxRevision = 0

    var body: some View {
        @Bindable var session = session
        NavigationStack {
            GeometryReader { geometry in
                // Two columns need room: a narrow iPad window gets the phone layout.
                if sizeClass == .compact || geometry.size.width < 900 { compact } else { regular }
            }
            .navigationTitle(session.imageName.isEmpty ? "Tintmap" : session.imageName)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { toolbar }
        }
        .sheet(isPresented: $showingPaintBox, onDismiss: paintBoxClosed) { PaintBoxView() }
        .sheet(isPresented: $showingCollection) { CollectionView() }
        .sheet(isPresented: $showingPaywall) { PaywallView(reason: "save more than one picture") }
        .photosPicker(isPresented: $showingPhotos, selection: $photo, matching: .images)
        .fileImporter(isPresented: $showingFiles, allowedContentTypes: [.image]) { result in
            if case .success(let url) = result { open(url) }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $showingCamera) {
            CameraPicker { session.load($0, name: "Photo \(Date.now.formatted(date: .abbreviated, time: .shortened))") }
                .ignoresSafeArea()
        }
        #endif
        .onChange(of: photo) { loadPhoto() }
        .alert("Something went wrong", isPresented: Binding(get: { session.error != nil }, set: { if !$0 { session.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(session.error ?? "")
        }
        .task {
            if session.image == nil { session.loadSample() }
            #if DEBUG
            await openScreenForScreenshot()
            #endif
        }
    }

    #if DEBUG
    /// "-screen paintbox|collection|editor|paywall" opens that screen at launch, for screenshots;
    /// "-landscape" starts with the landscape sample.
    private func openScreenForScreenshot() async {
        if ProcessInfo.processInfo.arguments.contains("-landscape") { session.loadSample() }
        guard let flag = ProcessInfo.processInfo.arguments.firstIndex(of: "-screen"),
              let screen = ProcessInfo.processInfo.arguments.dropFirst(flag + 1).first else { return }
        while session.busy || session.entries.isEmpty { try? await Task.sleep(for: .milliseconds(100)) }
        switch screen {
        case "paintbox": showingPaintBox = true
        case "collection": showingCollection = true
        case "editor": session.select(entry: 2)
        case "paywall": showingPaywall = true
        default: break
        }
    }
    #endif

    // MARK: Layouts

    /// iPhone: everything in one column; the colour editor comes up as a sheet over the picture.
    private var compact: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PaintingView()
                Text("Tap an area to see its recipe and change its colour.").font(.footnote).foregroundStyle(.secondary)
                panel { ControlsView() }
                panel(title: "Colours") { PaletteView() }
            }
            .padding()
        }
        .background(.background.secondary)
        .sheet(isPresented: Binding(get: { session.selectedEntry != nil }, set: { if !$0 { session.select(entry: nil) } })) {
            NavigationStack {
                ScrollView {
                    EntryEditorView(index: session.selectedEntry ?? 0).padding()
                }
                .navigationTitle("Colour \((session.selectedEntry ?? 0) + 1)")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { session.select(entry: nil) } }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        }
    }

    /// iPad and Mac: the picture on the left, settings, editor and colours in a column on the right.
    private var regular: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                PaintingView()
                Text("Click an area to see its recipe and change its colour.").font(.footnote).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    panel { ControlsView() }
                    if let index = session.selectedEntry {
                        panel(title: "Colour \(index + 1)", onClose: { session.select(entry: nil) }) { EntryEditorView(index: index) }
                    }
                    panel(title: "Colours") { PaletteView() }
                }
                .padding()
            }
            .frame(width: 400)
        }
        .background(.background.secondary)
    }

    private func panel(title: String? = nil, onClose: (() -> Void)? = nil, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                HStack {
                    Text(title).font(.headline)
                    Spacer()
                    if let onClose { Button("Close", action: onClose).buttonStyle(.borderless) }
                }
            }
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            Menu("Photo", systemImage: "photo.badge.plus") {
                Button("Photo Library", systemImage: "photo.on.rectangle") { showingPhotos = true }
                #if os(iOS)
                if CameraPicker.isAvailable {
                    Button("Take Photo", systemImage: "camera") { showingCamera = true }
                }
                #endif
                Button("Choose File", systemImage: "folder") { showingFiles = true }
                Divider()
                Button("Sample Photo", systemImage: "sparkles.rectangle.stack") { session.loadSample() }
            }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button("Paint Box", systemImage: "paintpalette") {
                boxRevision = library.revision
                showingPaintBox = true
            }
            Button("Collection", systemImage: "square.stack") { showingCollection = true }
            Menu("More", systemImage: "ellipsis.circle") {
                Button(session.savedID == nil ? "Save to Collection" : "Save Changes", systemImage: "square.and.arrow.down", action: save)
                Divider()
                Button("Print", systemImage: "printer") { PrintSheet.print(session: session, library: library) }
                ShareLink(
                    item: SheetPDF(name: session.imageName) { PrintSheet.pdf(session: session, library: library) },
                    preview: SharePreview("\(session.imageName) – colours and mixes")
                ) {
                    Label("Share as PDF", systemImage: "square.and.arrow.up")
                }
            }
            .disabled(session.entries.isEmpty)
        }
    }

    // MARK: Actions

    /// The mixes follow the paint box once it is closed.
    private func paintBoxClosed() {
        if library.revision != boxRevision { session.recomputeAllRecipes() }
    }

    private func save() {
        guard session.savedID != nil || store.unlocked || collection.items.count < Store.freePictures else {
            showingPaywall = true
            return
        }
        do {
            try collection.save(session)
        } catch {
            session.error = "Could not save the picture: \(error.localizedDescription)"
        }
    }

    private func loadPhoto() {
        guard let item = photo else { return }
        photo = nil
        Task {
            if let data = try? await item.loadTransferable(type: Data.self) {
                session.load(data, name: "Photo \(Date.now.formatted(date: .abbreviated, time: .shortened))")
            } else {
                session.error = "Could not load this photo."
            }
        }
    }

    private func open(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            session.error = "Could not read this file."
            return
        }
        session.load(data, name: url.deletingPathExtension().lastPathComponent)
    }
}
