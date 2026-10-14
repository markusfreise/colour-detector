import PhotosUI
import SwiftUI

/// The main screen, laid out as the web app: the picture fills the screen, the tools sit in the
/// bars around it, the settings and colours share the inspector (a sheet on iPhone), and a tap on
/// an area brings its colour up on a card over the picture.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    @Environment(PictureCollection.self) private var collection
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var showingPaintBox = false
    @State private var showingCollection = false
    @State private var showingPhotos = false
    @State private var showingFiles = false
    @State private var showingCamera = false
    @State private var showingPaywall = false
    @State private var showingSamples = false
    @State private var showingBreakdown = false
    @State private var showingPanel = false
    @State private var panelTab = PanelTab.colours
    @State private var photo: PhotosPickerItem?
    @State private var boxRevision = 0

    var body: some View {
        @Bindable var session = session
        NavigationStack {
            stage
                .navigationTitle(session.imageName.isEmpty ? "No Picture" : session.imageName)
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                .toolbarRole(compact ? .automatic : .editor)
                #endif
                .toolbar { toolbar }
                .inspector(isPresented: $showingPanel) {
                    PanelView(tab: $panelTab, showPaintBox: openPaintBox)
                        .inspectorColumnWidth(min: 340, ideal: 400, max: 520)
                        // iPhone: half height, with the picture still usable above it.
                        .presentationDetents([.medium, .large])
                        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                }
        }
        .sheet(isPresented: $showingPaintBox, onDismiss: paintBoxClosed) { PaintBoxView() }
        .sheet(isPresented: $showingCollection) { CollectionView() }
        .sheet(isPresented: $showingPaywall) { PaywallView(reason: "save more than one picture") }
        .sheet(isPresented: $showingSamples) { SamplesView() }
        .sheet(isPresented: $showingBreakdown) { BreakdownSheet() }
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
        // iPhone: the colour card comes up where the panel sheet was; one thing over the picture at a time.
        .onChange(of: session.selectedRegion) { _, region in
            if compact, region != nil { showingPanel = false }
        }
        .alert("Something went wrong", isPresented: Binding(get: { session.error != nil }, set: { if !$0 { session.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(session.error ?? "")
        }
        .task {
            #if DEBUG
            // "-auto" at launch: the paint box picks its paints, as on a fresh install.
            if ProcessInfo.processInfo.arguments.contains("-auto") { library.switchToAuto() }
            #endif
            if session.image == nil { session.loadSample(restart: true) }
            #if DEBUG
            await openScreenForScreenshot()
            #endif
        }
    }

    #if DEBUG
    /// "-screen paintbox|collection|editor|breakdown|samples|settings|colours|paywall" opens that screen at
    /// launch, for screenshots; "-view mixed|target|overlay|original|template" sets what the picture shows;
    /// "-sample" steps to the next sample photo.
    private func openScreenForScreenshot() async {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("-sample") { session.loadSample() }
        // "-geometric" switches to areas with straight edges.
        if arguments.contains("-geometric") { session.settings.geometric = true }
        // "-layer" switches to layer mode; "-step n" opens that step of the walk, "-stepview paint|wash|result" its picture.
        if arguments.contains("-layer") { session.setMode(.layer) }
        while session.busy || (session.layerMode ? session.layers == nil : session.entries.isEmpty) { try? await Task.sleep(for: .milliseconds(100)) }
        if let step = arguments.firstIndex(of: "-step").flatMap({ arguments.dropFirst($0 + 1).first }).flatMap({ Int($0) }) {
            session.goToStep(step)
        }
        if let view = arguments.firstIndex(of: "-stepview").flatMap({ arguments.dropFirst($0 + 1).first }).flatMap(StepView.init(rawValue:)) {
            session.layerStepView = view
        }
        if arguments.contains("-spot"), let plan = session.layers { session.selectPoint((plan.width / 2, plan.height / 2)) }
        if let mode = arguments.firstIndex(of: "-view").flatMap({ arguments.dropFirst($0 + 1).first }).flatMap(ViewMode.init(rawValue:)) {
            session.settings.view = mode
        }
        let screen = arguments.firstIndex(of: "-screen").flatMap { arguments.dropFirst($0 + 1).first } ?? ""
        switch screen {
        case "paintbox": showingPaintBox = true
        case "collection": showingCollection = true
        case "editor": if !session.layerMode { session.inspect(entry: 2) }
        case "breakdown":
            if !session.layerMode { session.inspect(entry: 2) }
            showingBreakdown = true
        case "samples": showingSamples = true
        case "settings", "colours":
            panelTab = PanelTab(rawValue: screen) ?? .colours
            showingPanel = true
        case "paywall": showingPaywall = true
        default: break
        }
        #if os(macOS)
        // "-pdf" writes the printed sheet into the temporary folder.
        if arguments.contains("-pdf") {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("sheet.pdf")
            try? PrintSheet.pdf(session: session, library: library).write(to: url)
            print("pdf", url.path)
        }
        if ProcessInfo.processInfo.arguments.contains("-snapshot") {
            try? await Task.sleep(for: .seconds(2))
            DebugSnapshot.writeAll()
        }
        #endif
    }
    #endif

    // MARK: Layout

    /// The picture fills the screen; the colour card (in layer mode the spot card) floats over its
    /// lower edge, the painting steps over its upper edge.
    private var stage: some View {
        PaintingView()
            .background(Theme.page.ignoresSafeArea())
            .overlay(alignment: .top) {
                if session.layerMode, session.layers != nil {
                    LayerStepsView()
                        .padding(14)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }
            }
            .overlay(alignment: .bottom) {
                Group {
                    if session.layerMode {
                        SpotCard()
                    } else {
                        ColourCard(stacked: compact) { openBreakdown() }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
            .animation(reduceMotion ? nil : .snappy, value: session.inspectedEntry)
            .animation(reduceMotion ? nil : .snappy, value: session.layerSpot != nil)
    }

    private var compact: Bool {
        #if os(iOS)
        sizeClass == .compact
        #else
        false
        #endif
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        // The picture as a whole: the collection and a new picture.
        ToolbarItemGroup(placement: leading) {
            Button("Collection", systemImage: "photo.on.rectangle.angled") { showingCollection = true }
            Menu {
                Button("From Photos", systemImage: "photo.on.rectangle") { showingPhotos = true }
                Button("From Files", systemImage: "folder") { showingFiles = true }
                #if os(iOS)
                if CameraPicker.isAvailable {
                    Button("Take Photo", systemImage: "camera") { showingCamera = true }
                }
                #endif
                Divider()
                Button("Samples", systemImage: "square.inset.filled") { showingSamples = true }
            } label: {
                Label("New Picture", systemImage: "photo.badge.plus")
            }
        }
        #if os(iOS)
        if compact {
            ToolbarItemGroup(placement: .topBarTrailing) { saveButton; shareMenu }
            // What the picture shows, then the panels: within reach of the thumb.
            ToolbarItemGroup(placement: .bottomBar) {
                viewMenu
                outlinesToggle
                numbersToggle
                Spacer()
                panelButton(.settings)
                panelButton(.colours)
                paintBoxButton
            }
        } else {
            wideToolbar
        }
        #else
        wideToolbar
        #endif
    }

    /// iPad and Mac: the views in the middle, the actions and panels on the right.
    @ToolbarContentBuilder private var wideToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .principal) {
            viewPicker
            outlinesToggle
            numbersToggle
        }
        ToolbarItemGroup(placement: .primaryAction) {
            saveButton
            shareMenu
            paintBoxButton
            panelButton(.settings)
            panelButton(.colours)
        }
    }

    private var saveButton: some View {
        Button("Save", systemImage: "square.and.arrow.down", action: save)
            .disabled(session.image == nil)
    }

    /// Print, PDF and the picture as a JPG.
    private var shareMenu: some View {
        Menu {
            Button("Print", systemImage: "printer") { PrintSheet.print(session: session, library: library) }
            ShareLink(
                item: SheetPDF(name: session.imageName) { PrintSheet.pdf(session: session, library: library) },
                preview: SharePreview("\(session.imageName) – \(session.layerMode ? "layers" : "colours and mixes")")
            ) {
                Label("PDF", systemImage: "doc.richtext")
            }
            ShareLink(
                item: PictureJPG(name: session.imageName) { PictureJPG.data(session: session) },
                preview: SharePreview(session.imageName)
            ) {
                Label("Export as JPG", systemImage: "photo")
            }
        } label: {
            Label("Share", systemImage: "square.and.arrow.up")
        }
        .disabled(session.layerMode ? session.layers == nil : session.entries.isEmpty)
    }

    private var paintBoxButton: some View {
        Button("Paint Box", systemImage: "circle.grid.2x2") { openPaintBox() }
    }

    /// Opens the panel on its tab; the button of the open tab closes it.
    private func panelButton(_ tab: PanelTab) -> some View {
        let open = showingPanel && panelTab == tab
        let title = tab == .settings ? "Settings" : session.layerMode ? "Layers" : "Colours"
        let symbol = tab == .settings ? "slider.vertical.3" : session.layerMode ? "square.3.layers.3d" : "swatchpalette"
        return Toggle(isOn: Binding(get: { open }, set: { show in
            if show { panelTab = tab }
            showingPanel = show
        })) {
            Label(title, systemImage: symbol)
        }
        .toggleStyle(.button)
    }

    private var viewModes: [ViewMode] { session.layerMode ? ViewMode.layerCases : ViewMode.allCases }

    /// iPhone: what the picture shows, in a menu under the symbol of the current view.
    private var viewMenu: some View {
        @Bindable var session = session
        return Menu {
            Picker("Show", selection: $session.settings.view) {
                ForEach(viewModes) { Label($0.title, systemImage: $0.symbol).tag($0) }
            }
        } label: {
            Label("Show: \(session.settings.view.title)", systemImage: session.settings.view.symbol)
        }
    }

    /// iPad and Mac: the views side by side, as the web app's view switch.
    private var viewPicker: some View {
        @Bindable var session = session
        return Picker("Show", selection: $session.settings.view) {
            ForEach(viewModes) { mode in
                Image(systemName: mode.symbol).accessibilityLabel(mode.title).help(mode.title).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }

    private var outlinesToggle: some View {
        @Bindable var session = session
        return Toggle(isOn: $session.settings.outlines) { Label("Outlines", systemImage: "squareshape.split.3x3") }
            .toggleStyle(.button)
            .disabled(session.settings.view == .template)
    }

    private var numbersToggle: some View {
        @Bindable var session = session
        return Toggle(isOn: $session.settings.numbers) { Label("Numbers", systemImage: "textformat.123") }
            .toggleStyle(.button)
    }

    private var leading: ToolbarItemPlacement {
        #if os(macOS)
        .navigation
        #else
        .topBarLeading
        #endif
    }

    // MARK: Actions

    private func openPaintBox() {
        boxRevision = library.revision
        afterPanel { showingPaintBox = true }
    }

    private func openBreakdown() {
        afterPanel { showingBreakdown = true }
    }

    /// One sheet at a time: on iPhone the panel is a sheet too, so it goes first.
    private func afterPanel(_ open: @escaping () -> Void) {
        guard compact, showingPanel else { return open() }
        showingPanel = false
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            open()
        }
    }

    /// The mixes follow the paint box once it is closed.
    private func paintBoxClosed() {
        if session.layerMode {
            session.layerPaintsChanged()
        } else if library.revision != boxRevision {
            session.recomputeAllRecipes()
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
