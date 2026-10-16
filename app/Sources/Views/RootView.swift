import PhotosUI
import SwiftUI

/// The main screen, laid out as the web app: the picture fills the window, and everything else
/// lies over it. The operations on the picture are a column of buttons at the top left, the panels
/// a column at the top right whose cards float over the picture, what the picture shows a group of
/// tools at the top centre (at the bottom on a phone), and a tap on an area brings its colour up on
/// a card over the lower edge.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    @Environment(PictureCollection.self) private var collection
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openPreferences) private var openPreferences

    @State private var showingPaintBox = false
    @State private var showingCollection = false
    @State private var showingPhotos = false
    @State private var showingFiles = false
    @State private var showingCamera = false
    @State private var showingPaywall = false
    @State private var paywallReason = "save more than one picture"
    @State private var showingSamples = false
    @State private var showingBreakdown = false
    // Kept by the window: they stay open when a new language redraws this view.
    @SceneStorage("showingSettings") private var showingSettings = false
    @SceneStorage("showingColours") private var showingColours = false
    @State private var photo: PhotosPickerItem?
    @State private var boxRevision = 0
    /// Help: every button shows its label (the web's .app--hints).
    @State private var hints = false
    /// A phone: the picture buttons are folded behind the menu button.
    @State private var menuOpen = false

    var body: some View {
        stage
            .overlay(alignment: .topLeading) { pictureButtons.padding(Theme.gap) }
            .overlay(alignment: compact ? .bottom : .top) { tools.padding(Theme.gap) }
            // Above the rest that lies over the picture: the cards float over the whole window.
            .overlay(alignment: .topTrailing) { panels }
            .overlay(alignment: .top) {
                // A phone: one card across the window, as the web's flyout in a narrow window.
                if compact, let tab = openTab {
                    card(tab)
                        .frame(maxHeight: 520, alignment: .top)
                        .padding(.horizontal, 8)
                        .padding(.top, Theme.gap)
                }
            }
            .background(Theme.page.ignoresSafeArea())
            .environment(\.showHints, hints)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: hints)
            .tint(Theme.corporate)
            .navigationTitle(session.imageName.isEmpty ? L("No Picture") : session.imageName)
        .sheet(isPresented: $showingPaintBox, onDismiss: paintBoxClosed) { PaintBoxView() }
        .sheet(isPresented: $showingCollection) { CollectionView() }
        .sheet(isPresented: $showingPaywall) { PaywallView(reason: paywallReason) }
        .sheet(isPresented: $showingSamples) { SamplesView() }
        .sheet(isPresented: $showingBreakdown) { BreakdownSheet() }
        .photosPicker(isPresented: $showingPhotos, selection: $photo, matching: .images)
        .fileImporter(isPresented: $showingFiles, allowedContentTypes: [.image]) { result in
            if case .success(let url) = result { open(url) }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $showingCamera) {
            CameraPicker { session.load($0, name: L("Photo %@", Date.now.formatted(date: .abbreviated, time: .shortened))) }
                .ignoresSafeArea()
        }
        #endif
        .onChange(of: photo) { loadPhoto() }
        // A saved picture shown in Blocking opens in the paint without the full version.
        .onChange(of: session.settings.view, initial: true) { _, view in
            if view == .blocking, !store.unlocked { session.settings.view = .mixed }
        }
        // A phone: the colour card comes up where the panel card was; one thing over the picture at a time.
        .onChange(of: session.selectedRegion) { _, region in
            if compact, region != nil { showingSettings = false; showingColours = false; menuOpen = false }
        }
        // Layer mode: the spot tapped in the picture is shown at the top of the layers card, which opens for it.
        .onChange(of: session.layerSpot != nil) { _, spot in
            if spot, !showingColours { open(.colours) }
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
            // A phone starts with the panels folded, the picture in full view.
            if compact { showingSettings = false; showingColours = false }
            if session.image == nil { session.loadSample(restart: true) }
            #if DEBUG
            await openScreenForScreenshot()
            #endif
        }
    }

    #if DEBUG
    nonisolated(unsafe) private static var screenshotDone = false

    /// "-screen paintbox|collection|editor|breakdown|samples|settings|colours|paywall|preferences" opens that screen at
    /// launch, for screenshots; "-view mixed|target|overlay|original|template" sets what the picture shows;
    /// "-sample" steps to the next sample photo; "-closeup" opens a close-up, "-framing" starts choosing one.
    private func openScreenForScreenshot() async {
        // Once per launch: a new language redraws this view and runs its task again.
        guard !Self.screenshotDone else { return }
        Self.screenshotDone = true
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("-sample") { session.loadSample() }
        // "-geometric" switches to areas with straight edges.
        if arguments.contains("-geometric") { session.settings.geometric = true }
        // "-monochrome" paints the picture in grey, each value with one paint.
        if arguments.contains("-monochrome") { session.settings.values = true }
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
        // "-closeup" opens a close-up of the middle of the picture; "-framing" starts choosing one.
        if arguments.contains("-closeup") {
            session.addCloseup(CGRect(x: 0.35, y: 0.3, width: 0.3, height: 0.3))
            while session.busy || session.entries.isEmpty { try? await Task.sleep(for: .milliseconds(100)) }
        }
        if arguments.contains("-framing") { session.framing = true }
        // "-hints" turns Help on: every button shows its label.
        if arguments.contains("-hints") { toggleHints() }
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
        case "settings": open(.settings)
        case "colours": open(.colours)
        case "paywall": showingPaywall = true
        case "preferences": openPreferences()
        default: break
        }
        #if os(macOS)
        // "-pdf" writes the printed sheet into the temporary folder.
        if arguments.contains("-pdf") {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("sheet.pdf")
            try? PrintSheet.pdf(session: session, library: library).write(to: url)
            print("pdf", url.path)
        }
        let snapshot = arguments.contains("-snapshot")
        if snapshot {
            try? await Task.sleep(for: .seconds(2))
            DebugSnapshot.writeAll()
        }
        #else
        let snapshot = false
        #endif
        // "-switch de,en,theme:dark,auto": changes the language (or with "theme:" the look) as the
        // preferences do, one after the other, every 4 seconds; on the Mac with "-snapshot" it writes
        // "de-*.png", "theme:dark-*.png" ... after each. Its own task: a new language redraws this
        // view, which ends the view's task.
        if let list = arguments.firstIndex(of: "-switch").flatMap({ arguments.dropFirst($0 + 1).first }) {
            Task { @MainActor in
                for step in list.split(separator: ",").map(String.init) {
                    if step.hasPrefix("theme:") {
                        UserDefaults.standard.set(String(step.dropFirst("theme:".count)), forKey: Localization.themeKey)
                    } else {
                        UserDefaults.standard.set(step, forKey: Localization.languageKey)
                    }
                    try? await Task.sleep(for: .seconds(4))
                    #if os(macOS)
                    if snapshot { DebugSnapshot.writeAll(prefix: step) }
                    #endif
                }
            }
        }
    }
    #endif

    // MARK: Layout

    /// The picture fills the window; the colour card (in layer mode the spot card) floats over its
    /// lower edge, the painting steps and close-ups below the tools at its upper edge.
    private var stage: some View {
        PaintingView()
            .overlay(alignment: .top) {
                VStack(spacing: 8) {
                    if session.layerMode, session.layers != nil {
                        LayerStepsView()
                            .padding(14)
                            .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.border))
                            .floatShadow()
                    }
                    if !session.closeups.isEmpty {
                        CloseupStrip()
                    }
                }
                // Between the two columns of buttons, below the tools.
                .padding(.horizontal, Theme.iconButton + Theme.gap * 2)
                .padding(.top, compact ? Theme.gap : Theme.gap * 2 + Theme.iconButton)
            }
            .overlay(alignment: .bottom) {
                // Layer mode shows the tapped spot in the layers card instead.
                Group {
                    if !session.layerMode {
                        ColourCard { openBreakdown() }
                    }
                }
                .padding(.horizontal, Theme.gap)
                // A phone: above the tools at the bottom.
                .padding(.bottom, compact ? Theme.gap * 2 + toolSize : Theme.gap)
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
            .animation(reduceMotion ? nil : .snappy, value: session.inspectedEntry)
    }

    private var compact: Bool {
        #if os(iOS)
        sizeClass == .compact
        #else
        false
        #endif
    }

    // MARK: Picture (top left)

    /// What is done with the picture as a whole: a new one, samples, saving, the collection,
    /// printing and sharing. On a phone they are folded behind a menu button, with "Get pro" beside it.
    private var pictureButtons: some View {
        VStack(alignment: .leading, spacing: Theme.gap) {
            if compact {
                HStack(spacing: Theme.gap) {
                    IconButton(title: "Menu", symbol: menuOpen ? "xmark" : "line.3.horizontal", active: menuOpen) { menuOpen.toggle() }
                        .environment(\.showHints, false)
                    if !store.unlocked {
                        Button("Get pro") {
                            menuOpen = false
                            paywallReason = "use everything"
                            showingPaywall = true
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }
                }
            }
            if !compact || menuOpen {
                pictureColumn
                    .transition(.opacity)
            }
        }
        .environment(\.hintSide, .trailing)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: menuOpen)
    }

    private var pictureColumn: some View {
        VStack(spacing: Theme.gap) {
            Menu {
                Button("From Photos", systemImage: "photo.on.rectangle") { closeMenu(); showingPhotos = true }
                Button("From Files", systemImage: "folder") { closeMenu(); showingFiles = true }
                #if os(iOS)
                if CameraPicker.isAvailable {
                    Button("Take Photo", systemImage: "camera") { closeMenu(); showingCamera = true }
                }
                #endif
            } label: {
                Label("New: choose a photo", systemImage: "photo.badge.plus")
            }
            .webMenu(active: true)
            .help("New: choose a photo")
            .hint("New picture")
            IconButton(title: "Samples: choose a sample picture", symbol: "square.inset.filled", hint: "Samples") { closeMenu(); showingSamples = true }
            IconButton(title: "Save", symbol: "square.and.arrow.down") { closeMenu(); save() }
                .disabled(session.image == nil)
            IconButton(title: "Collection", symbol: "photo.on.rectangle.angled") { closeMenu(); showingCollection = true }
            IconButton(title: "Print", symbol: "printer", hint: "Print / PDF") { closeMenu(); PrintSheet.print(session: session, library: library) }
                .disabled(!printable)
            shareMenu
            // A phone: the template to print is here instead of among the views at the bottom.
            if compact, !session.layerMode {
                IconButton(title: "Template to print", symbol: ViewMode.template.symbol, active: session.settings.view == .template) {
                    closeMenu()
                    session.settings.view = session.settings.view == .template ? .mixed : .template
                }
            }
            // Language and light or dark, as the web's person button below the picture buttons.
            IconButton(title: "Preferences", symbol: "person.crop.circle") { closeMenu(); openPreferences() }
                .padding(.top, Theme.gap)
        }
    }

    /// A phone: the menu folds away once one of its buttons is used (Help keeps it open).
    private func closeMenu() {
        if !hints { menuOpen = false }
    }

    private var printable: Bool { session.layerMode ? session.layers != nil : !session.entries.isEmpty }

    /// The sheet as a PDF and the picture as a JPG.
    private var shareMenu: some View {
        Menu {
            ShareLink(
                item: SheetPDF(name: session.imageName) { PrintSheet.pdf(session: session, library: library) },
                preview: SharePreview(L(session.layerMode ? "%@ – layers" : "%@ – colours and mixes", session.imageName))
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
            Label("Share: PDF or JPG", systemImage: "square.and.arrow.up")
        }
        .webMenu()
        .help("Share: PDF or JPG")
        .hint("Share")
        .disabled(!printable)
    }

    // MARK: Panels (top right)

    /// The buttons of the panels, and left of them the open panels on their cards.
    private var panels: some View {
        HStack(alignment: .top, spacing: Theme.gap) {
            if !compact {
                VStack(alignment: .trailing, spacing: Theme.gap) {
                    if showingSettings { card(.settings).frame(width: 460) }
                    if showingColours { card(.colours).frame(width: 480) }
                }
            }
            VStack(spacing: Theme.gap) {
                IconButton(title: "Settings", symbol: "slider.horizontal.3", active: showingSettings) { toggle(.settings) }
                IconButton(
                    title: session.layerMode ? "Layers" : "Colours",
                    symbol: session.layerMode ? "square.3.layers.3d" : "swatchpalette",
                    active: showingColours
                ) { toggle(.colours) }
                IconButton(title: "Paint box", symbol: "circle.grid.2x2", action: openPaintBox)
                // Help: the labels of all buttons at once, for screens without a pointer to hover with.
                IconButton(title: "Help", symbol: "questionmark", active: hints, action: toggleHints)
                    .padding(.top, Theme.gap)
            }
            .environment(\.hintSide, .leading)
        }
        .padding(Theme.gap)
    }

    /// Help on a phone opens the menu too, so that its labels are seen.
    private func toggleHints() {
        hints.toggle()
        if hints, compact { menuOpen = true }
    }

    private func card(_ tab: PanelTab) -> some View {
        PanelCard(close: { close(tab) }) {
            PanelView(tab: tab, showPaintBox: openPaintBox)
        }
    }

    /// The open card on a phone, where only one fits.
    private var openTab: PanelTab? { showingSettings ? .settings : showingColours ? .colours : nil }

    private func toggle(_ tab: PanelTab) {
        if (tab == .settings ? showingSettings : showingColours) { close(tab) } else { open(tab) }
    }

    private func open(_ tab: PanelTab) {
        // A phone has room for one card.
        if compact { showingSettings = false; showingColours = false; menuOpen = false }
        if tab == .settings { showingSettings = true } else { showingColours = true }
    }

    private func close(_ tab: PanelTab) {
        if tab == .settings { showingSettings = false } else { showingColours = false }
    }

    // MARK: Tools (top centre)

    /// What the picture shows, as the web's painting tools: a close-up, the views, outlines and
    /// numbers. Smaller on a phone, so that they fit in one row.
    private var tools: some View {
        @Bindable var session = session
        return HStack(spacing: 6) {
            frameButton
            SegmentedGroup(
                options: viewModes, selection: session.settings.view,
                title: { layered($0) ?? $0.title }, symbol: { $0.symbol },
                choose: choose,
                size: toolSize,
                hint: { layered($0) ?? $0.hint }
            )
            // Their labels for Help alternate in height with those of the views beside them.
            IconButton(title: "Outlines", symbol: "squareshape.split.3x3", active: session.settings.outlines, size: toolSize, hintRow: viewModes.count % 2) {
                session.settings.outlines.toggle()
            }
            .disabled(session.settings.view == .template)
            IconButton(title: "Numbers", symbol: "textformat.123", active: session.settings.numbers, size: toolSize, hintRow: (viewModes.count + 1) % 2) {
                session.settings.numbers.toggle()
            }
        }
        .environment(\.hintSide, compact ? .above : .below)
    }

    /// Blocking is part of the full version.
    private func choose(_ view: ViewMode) {
        if view == .blocking, !store.unlocked {
            paywallReason = "block in light and shadow"
            showingPaywall = true
            return
        }
        session.settings.view = view
    }

    /// In layer mode the paint is layered, not mixed.
    private func layered(_ mode: ViewMode) -> String? {
        session.layerMode && mode == .mixed ? "Layered paint" : nil
    }

    private var toolSize: CGFloat { compact ? 36 : Theme.iconButton }

    /// A phone has the template to print in the menu instead.
    private var viewModes: [ViewMode] {
        session.layerMode ? ViewMode.layerCases : ViewMode.allCases.filter { !compact || $0 != .template }
    }

    /// A frame drawn on the base picture becomes a close-up: that part, analysed on its own.
    private var frameButton: some View {
        IconButton(
            title: session.framing ? "Cancel choosing a part of the picture" : "Close-up: zoom in on a part of the picture",
            symbol: "plus.magnifyingglass",
            active: session.framing,
            size: toolSize,
            hint: "Detail",
            hintRow: 1
        ) {
            guard session.framing || store.unlocked else {
                paywallReason = "zoom in on a part of the picture"
                showingPaywall = true
                return
            }
            session.framing.toggle()
        }
        .disabled(session.image == nil || session.closeupID != nil)
    }

    // MARK: Actions

    private func openPaintBox() {
        boxRevision = library.revision
        showingPaintBox = true
    }

    private func openBreakdown() {
        showingBreakdown = true
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
            paywallReason = "save more than one picture"
            showingPaywall = true
            return
        }
        do {
            try collection.save(session)
        } catch {
            session.error = L("Could not save the picture: %@", error.localizedDescription)
        }
    }

    private func loadPhoto() {
        guard let item = photo else { return }
        photo = nil
        Task {
            if let data = try? await item.loadTransferable(type: Data.self) {
                session.load(data, name: L("Photo %@", Date.now.formatted(date: .abbreviated, time: .shortened)))
            } else {
                session.error = L("Could not load this photo.")
            }
        }
    }

    private func open(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            session.error = L("Could not read this file.")
            return
        }
        session.load(data, name: url.deletingPathExtension().lastPathComponent)
    }
}

/// The close-ups of the picture, over its upper edge: back to the whole picture, and one tap to
/// each part looked at so far. The cross removes one.
private struct CloseupStrip: View {
    @Environment(Session.self) private var session

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                if session.closeupID != nil {
                    Button("Whole Picture", systemImage: "arrow.uturn.backward") { session.showBase() }
                        .buttonStyle(.bordered)
                        .disabled(session.busy)
                }
                ForEach(session.closeups) { closeup in
                    let active = closeup.id == session.closeupID
                    Button { session.openCloseup(closeup.id) } label: {
                        Image(decorative: closeup.thumb, scale: 1)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 44, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(alignment: .bottomLeading) {
                                Text("\(closeup.id)")
                                    .font(.caption2.bold())
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 4)
                                    .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 3))
                                    .padding(3)
                            }
                            .overlay {
                                RoundedRectangle(cornerRadius: 6).strokeBorder(active ? Theme.corporate : .clear, lineWidth: 2.5)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Detail \(closeup.id)")
                    .accessibilityAddTraits(active ? .isSelected : [])
                    .overlay(alignment: .topTrailing) {
                        Button { session.removeCloseup(closeup.id) } label: {
                            Image(systemName: "xmark.circle.fill")
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.white, .black.opacity(0.6))
                                .font(.system(size: 18))
                        }
                        .buttonStyle(.plain)
                        .offset(x: 7, y: -7)
                        .accessibilityLabel("Remove detail \(closeup.id)")
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .scrollIndicators(.hidden)
        .fixedSize(horizontal: false, vertical: true)
        .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.border))
        .floatShadow()
    }
}

private extension View {
    /// A menu behind a square icon button, as the web's buttons that open a choice.
    func webMenu(active: Bool = false) -> some View {
        menuStyle(.button)
            .buttonStyle(IconButtonStyle(active: active))
            .menuIndicator(.hidden)
            .fixedSize()
    }
}
