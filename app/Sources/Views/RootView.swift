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
            #if os(macOS)
            .navigationTitle("Tintmap")
            #else
            .navigationTitle("")
            #endif
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
    /// "-view mixed|target|original|overlay" sets what the picture shows;
    /// "-landscape" starts with the landscape sample.
    private func openScreenForScreenshot() async {
        if ProcessInfo.processInfo.arguments.contains("-landscape") { session.loadSample() }
        while session.busy || session.entries.isEmpty { try? await Task.sleep(for: .milliseconds(100)) }
        let arguments = ProcessInfo.processInfo.arguments
        if let mode = arguments.firstIndex(of: "-view").flatMap({ arguments.dropFirst($0 + 1).first }).flatMap(ViewMode.init(rawValue:)) {
            session.settings.view = mode
        }
        let screen = arguments.firstIndex(of: "-screen").flatMap { arguments.dropFirst($0 + 1).first } ?? ""
        switch screen {
        case "paintbox": showingPaintBox = true
        case "collection": showingCollection = true
        case "editor": session.select(entry: 2)
        case "paywall": showingPaywall = true
        default: break
        }
        #if os(macOS)
        if ProcessInfo.processInfo.arguments.contains("-snapshot") {
            try? await Task.sleep(for: .seconds(2))
            DebugSnapshot.writeAll()
        }
        #endif
    }
    #endif

    // MARK: Layouts

    /// iPhone: everything in one column; the colour editor comes up as a sheet over the picture.
    private var compact: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PaintingView()
                Text("Tap an area to see its recipe and change its colour.").font(Theme.small).foregroundStyle(.secondary)
                Card { ControlsView() }
                coloursCard
            }
            .padding()
        }
        .background(Theme.page)
        .sheet(isPresented: Binding(get: { session.selectedEntry != nil }, set: { if !$0 { session.select(entry: nil) } })) {
            NavigationStack {
                ScrollView {
                    EntryEditorView(index: session.selectedEntry ?? 0, stacked: true).padding()
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

    /// iPad and Mac: the picture on the left, settings, editor and colours as cards in a column on the right.
    private var regular: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                PaintingView()
                Text("Click an area to see its recipe and change its colour.").font(Theme.small).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Card { ControlsView() }
                    if let index = session.selectedEntry {
                        Card("Colour \(index + 1)", accent: true) {
                            Button("Close") { session.select(entry: nil) }.buttonStyle(.outline)
                        } content: {
                            EntryEditorView(index: index)
                        }
                    }
                    coloursCard
                }
                .padding([.vertical, .trailing], 20)
                .padding(.leading, 4)
            }
            .frame(width: Theme.sidebarWidth)
        }
        .background(Theme.page)
    }

    /// The colours with their mixes; printing and the paint box belong to them.
    private var coloursCard: some View {
        Card("Colours") {
            HStack(spacing: 6) {
                Button("Print") { PrintSheet.print(session: session, library: library) }
                ShareLink(
                    item: SheetPDF(name: session.imageName) { PrintSheet.pdf(session: session, library: library) },
                    preview: SharePreview("\(session.imageName) – colours and mixes")
                ) {
                    Text("PDF")
                }
                Button("Paint box") {
                    boxRevision = library.revision
                    showingPaintBox = true
                }
                .buttonStyle(.outlineProminent)
            }
            .buttonStyle(.outline)
            .disabled(session.entries.isEmpty)
        } content: {
            PaletteView()
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: leading) {
            Button { showingCollection = true } label: { toolbarLabel("Library", "square.stack") }
            Button(action: save) { toolbarLabel("Save", "square.and.arrow.down") }
                .disabled(session.image == nil)
            Menu {
                Button("From Photos", systemImage: "photo.on.rectangle") { showingPhotos = true }
                Button("From Files", systemImage: "folder") { showingFiles = true }
                #if os(iOS)
                if CameraPicker.isAvailable {
                    Button("Take Photo", systemImage: "camera") { showingCamera = true }
                }
                #endif
                Divider()
                Button("Sample Photo", systemImage: "sparkles.rectangle.stack") { session.loadSample() }
            } label: {
                toolbarLabel("New Image", "plus")
            }
        }
    }

    /// Words on iPhone and iPad, where the bar would otherwise reduce a label to its symbol; symbol and word on the Mac.
    @ViewBuilder private func toolbarLabel(_ title: String, _ symbol: String) -> some View {
        #if os(iOS)
        Text(title)
        #else
        Label(title, systemImage: symbol).labelStyle(.titleAndIcon)
        #endif
    }

    private var leading: ToolbarItemPlacement {
        #if os(macOS)
        .navigation
        #else
        .topBarLeading
        #endif
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
