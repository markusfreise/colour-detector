import SwiftUI
import UniformTypeIdentifiers

/// The palette of the picture on top (tap removes), then the paint boxes (tap adds to the palette;
/// the + at the end adds a colour to the box), then the user's own paints.
struct PaintBoxView: View {
    @Environment(Library.self) private var library
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var editedPaint: EditedPaint?
    @State private var boxName = ""
    @State private var naming: BoxNaming?
    @State private var boxToDelete: PaintBox?
    @State private var paintToDelete: Paint?
    @State private var showingPaywall = false
    @State private var paywallReason = "add paint boxes of your own"
    /// The box a colour is being added to, and what is typed into its search.
    @State private var addingTo: String?
    @State private var query = ""
    /// The box whose colours are being taken out.
    @State private var removing: String?
    @State private var exporting: BoxDocument?
    @State private var importing = false
    @State private var importError: String?

    private enum BoxNaming: Identifiable, Hashable {
        case new
        case rename(String)

        var id: Self { self }
    }

    /// A paint in the editor, and the box a new one goes into.
    struct EditedPaint: Identifiable {
        var paint: Paint
        var box: String?
        var id: String { paint.id }
    }

    private let columns = [GridItem(.adaptive(minimum: 116), spacing: 6)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    paletteBar
                    if layerMode {
                        Text(L("Layer mode paints with a few base paints, one layer each (%lld of %lld). They are kept apart from the paints selected for mixing.", selected.count, Library.maxLayerPaints)
                            + (full ? " " + L("%lld layers at most: remove one before adding another.", Library.maxLayerPaints) : ""))
                            .font(Theme.small)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    group(title: L(layerMode ? "Base paints" : "Palette"), highlighted: true) {
                        if selected.isEmpty {
                            Text(L(layerMode ? "No base paints chosen. Tap a paint below to add it, or press Auto." : "No paints selected. Tap a paint below to add it.")).foregroundStyle(.secondary)
                        } else {
                            grid(selected, selected: true)
                        }
                        if !layerMode {
                            Text("The palette is saved with the picture.").font(Theme.small).foregroundStyle(.secondary)
                        }
                    }
                    HStack(spacing: 6) {
                        Button("New Paint Box", systemImage: "plus") { if mayAddBox() { boxName = ""; naming = .new } }
                        Button("Import Paint Box", systemImage: "square.and.arrow.down") { if mayAddBox() { importError = nil; importing = true } }
                    }
                    .buttonStyle(.bordered)
                    if let importError {
                        Text(importError).font(Theme.small).foregroundStyle(.red)
                    }
                    ForEach(library.boxes) { box in
                        boxGroup(box)
                    }
                    if !library.custom.isEmpty { ownPaints }
                }
                .padding()
            }
            .background(Theme.page)
            .navigationTitle(L(layerMode ? "Paint Box: Base Paints" : "Paint Box"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $editedPaint) { PaintEditorView(paint: $0.paint, box: $0.box) }
            .sheet(isPresented: $showingPaywall) { PaywallView(reason: paywallReason) }
            .alert(L(naming == .new ? "New Paint Box" : "Rename Paint Box"), isPresented: Binding(get: { naming != nil }, set: { if !$0 { naming = nil } })) {
                TextField("Name", text: $boxName)
                Button("Cancel", role: .cancel) {}
                Button(L(naming == .new ? "Create" : "Save")) {
                    switch naming {
                    case .new: library.addBox(named: boxName)
                    case .rename(let id): library.renameBox(id, to: boxName)
                    case nil: break
                    }
                }
            }
            .confirmationDialog(L("Delete the box “%@”?", boxToDelete?.displayName ?? ""), isPresented: Binding(get: { boxToDelete != nil }, set: { if !$0 { boxToDelete = nil } }), titleVisibility: .visible, presenting: boxToDelete) { box in
                Button("Delete Box", role: .destructive) { library.deleteBox(box.id) }
            } message: { _ in
                Text("The paints stay in your library.")
            }
            .confirmationDialog("Delete this paint?", isPresented: Binding(get: { paintToDelete != nil }, set: { if !$0 { paintToDelete = nil } }), titleVisibility: .visible, presenting: paintToDelete) { paint in
                Button(L("Delete %@", paint.displayName), role: .destructive) { library.deletePaint(paint.id) }
            } message: { _ in
                Text("It is removed from every paint box.")
            }
            .fileExporter(isPresented: Binding(get: { exporting != nil }, set: { if !$0 { exporting = nil } }), document: exporting, contentType: .json, defaultFilename: exporting?.name) { _ in
                exporting = nil
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                guard case .success(let url) = result else { return }
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                do {
                    try library.importBox(Data(contentsOf: url))
                } catch {
                    importError = L("This is not a paint box file.")
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 760, minHeight: 680)
        #endif
    }

    /// In layer mode the screen edits the base paints of the palette instead of its selection for mixing.
    private var layerMode: Bool { session.settings.mode == .layer }
    private var autoOn: Bool { layerMode ? library.palette.layerAuto : library.palette.auto }
    private var selected: [Paint] { layerMode ? library.layerPaints.sortedForBox() : library.selected }
    private var inPalette: Set<String> { layerMode ? Set(library.palette.layerIDs) : library.enabledIDs }
    private var full: Bool { layerMode && library.palette.layerIDs.count >= Library.maxLayerPaints }

    // MARK: Palette

    /// What can be done to the palette.
    private var paletteBar: some View {
        HStack(spacing: 6) {
            Button("Auto", systemImage: "wand.and.stars", action: auto)
                .borderedStyle(selected: autoOn)
                .fixedSize()
                .disabled(session.image == nil)
                .help(L(layerMode ? "Let the app choose the base paints for this picture" : "Let the app select the paints that suit each picture"))
                .accessibilityAddTraits(autoOn ? .isSelected : [])
            if !layerMode {
                Button("Revert") { library.revert() }
                    .help("Back to the default selection")
            }
            Button("Clear") {
                if layerMode { library.setLayerPaints([]) } else { library.clear() }
            }
            Spacer(minLength: 8)
            Text(L("%lld selected", selected.count)).font(Theme.small).foregroundStyle(.secondary).lineLimit(1)
        }
        .buttonStyle(.bordered)
    }

    /// Boxes of one's own are part of the full version.
    private func mayAddBox() -> Bool {
        if store.unlocked { return true }
        paywallReason = "add paint boxes of your own"
        showingPaywall = true
        return false
    }

    /// A box joins or leaves the paints Auto chooses from; with Auto on, the choice is made again.
    private func setAutoBox(_ id: String, on: Bool) {
        library.setAutoBox(id, on: on)
        if autoOn, session.image != nil { auto() }
    }

    /// Lets the app pick the paints for the picture, from the boxes ticked for Auto.
    private func auto() {
        if layerMode {
            // The proposal needs the picture, so it is made while the layers are planned again.
            session.proposeLayers()
            return
        }
        library.switchToAuto()
        session.recomputeAllRecipes()
    }

    // MARK: Boxes

    private func boxGroup(_ box: PaintBox) -> some View {
        let all = library.paints(in: box)
        // While colours are being taken out, all of them, those in the palette too.
        let listed = removing == box.id ? all : all.filter { !inPalette.contains($0.id) }
        return group(title: box.displayName, autoKey: box.id) {
            if removing == box.id {
                Text("Tap a colour to take it out of this box.").font(Theme.small).foregroundStyle(.secondary)
            }
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(listed) { paint in
                    Button {
                        if removing == box.id {
                            library.removeFromBox(box.id, paint: paint.id)
                        } else if layerMode {
                            library.toggleLayerPaint(paint.id)
                        } else {
                            library.toggle(paint.id)
                        }
                    } label: {
                        PaintChip(paint: paint, showForm: false, used: false)
                            .overlay { if removing == box.id { Image(systemName: "minus.circle.fill").font(.title3).foregroundStyle(.white, .red).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(4) } }
                    }
                    .buttonStyle(.plain)
                    // A full set of base paints takes no more; the note above says why.
                    .disabled(removing != box.id && full)
                    .opacity(removing != box.id && full ? 0.45 : 1)
                    .accessibilityHint(L(removing == box.id ? "Takes the colour out of this box" : "Adds the paint to the palette"))
                }
                // An empty place at the end: a colour more for this box.
                if removing != box.id {
                    Button {
                        addingTo = addingTo == box.id ? nil : box.id
                        query = ""
                    } label: {
                        Image(systemName: "plus")
                            .font(.title3)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(addingTo == box.id ? Color.accentColor : .secondary)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(addingTo == box.id ? Color.accentColor : Color.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L("Add a colour to %@", box.displayName))
                }
            }
            if !all.isEmpty && listed.isEmpty {
                Text("All of these are selected.").foregroundStyle(.secondary)
            }
            if addingTo == box.id { colourSearch(box) }
            boxActions(box)
        }
    }

    /// Type a part of the series, number or name; the matching colours are listed below.
    private func colourSearch(_ box: PaintBox) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Series, number or name", text: $query)
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()
            ForEach(matches(for: box)) { option in
                Button {
                    switch option.kind {
                    case .paint(let id): library.addToBox(box.id, paint: id)
                    case .chart(let colour, let source): library.addChartColour(colour, of: source, to: box.id)
                    }
                    query = ""
                } label: {
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 4).fill(Color(hex: option.hex)).frame(width: 28, height: 28)
                        Text(option.label).frame(maxWidth: .infinity, alignment: .leading)
                        if case .chart(let colour, _) = option.kind {
                            Text(([L("Catalogue")] + colour.details).joined(separator: " · ")).font(Theme.small).foregroundStyle(.secondary)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if !query.trimmingCharacters(in: .whitespaces).isEmpty && matches(for: box).isEmpty {
                Text("No colour found").foregroundStyle(.secondary)
            }
            // The catalogues of known manufacturers are part of the full version.
            if !store.unlocked {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Button("Get pro") {
                        paywallReason = "add colours from the catalogues of known manufacturers"
                        showingPaywall = true
                    }.buttonStyle(.borderless)
                    Text("and easily add pre-defined colours from the catalogues of known manufacturers and brands.")
                        .font(Theme.small).foregroundStyle(.secondary)
                }
            }
            Button("Or enter a colour of your own") {
                editedPaint = EditedPaint(paint: Paint(id: "custom-\(UUID().uuidString.prefix(8))", vendor: Paint.houseVendor, number: "", name: "", hex: "#c88c5f", forms: [box.id == "tube" ? "tube" : "pan"], source: "custom", custom: true), box: box.id)
            }
            .buttonStyle(.borderless)
        }
        .padding(.top, 4)
    }

    private struct ColourOption: Identifiable {
        enum Kind {
            case paint(String)
            case chart(ChartColour, PaintLibrary)
        }

        let id: String
        let kind: Kind
        let label: String
        let hex: String
        let search: String
    }

    /// What the search offers: every paint the app knows that is not in the box yet, and with the
    /// full version the colours of the libraries that are not among the paints.
    private func matches(for box: PaintBox) -> [ColourOption] {
        let words = query.lowercased().split(separator: " ").map(String.init)
        guard !words.isEmpty else { return [] }
        let inBox = Set(box.paintIDs)
        var options: [ColourOption] = library.all.filter { !inBox.contains($0.id) }.map { paint -> ColourOption in
            let label = "\(paint.vendor) \(paint.displayNumber) \(paint.displayName)"
            return ColourOption(id: paint.id, kind: .paint(paint.id), label: label, hex: paint.hex, search: "\(label) \(paint.name) \(paint.nameDe)".lowercased())
        }
        if store.unlocked {
            let known = Set(library.all.map { "\($0.vendor.lowercased())|\($0.number.lowercased())" })
            for source in library.libraries {
                // A colour without a reliable value is added through the form, where its colour is set by hand.
                options += source.catalogue.filter { $0.hex != nil && !known.contains("\(source.name.lowercased())|\($0.number.lowercased())") }.map { colour -> ColourOption in
                    let label = "\(source.name) \(colour.number) \(colour.name)"
                    let search = ([label] + colour.allNames + (colour.pigments ?? [])).joined(separator: " ").lowercased()
                    return ColourOption(id: "\(source.id):\(colour.number)", kind: .chart(colour, source), label: label, hex: colour.hex ?? "#ffffff", search: search)
                }
            }
        }
        return Array(options.filter { option in words.allSatisfy { option.search.contains($0) } }.prefix(30))
    }

    /// Under a box: what is done with the box itself.
    private func boxActions(_ box: PaintBox) -> some View {
        HStack(spacing: 14) {
            Button("Rename") {
                boxName = box.displayName
                naming = .rename(box.id)
            }
            if !box.paintIDs.isEmpty {
                Button(L(removing == box.id ? "Done" : "Remove Colours")) {
                    removing = removing == box.id ? nil : box.id
                    if removing != nil { addingTo = nil }
                }
                Button("Export") {
                    if let data = library.exportBox(box.id) { exporting = BoxDocument(data: data, name: box.displayName) }
                }
            }
            if library.boxes.count > 1 {
                Button("Delete Box", role: .destructive) { boxToDelete = box }
            }
        }
        .buttonStyle(.borderless)
        .font(Theme.small)
        .padding(.top, 4)
    }

    // MARK: Paints

    /// `autoKey`: the box can be ticked as a source for Auto.
    private func group(title: String?, highlighted: Bool = false, autoKey: String? = nil, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title {
                HStack(alignment: .firstTextBaseline) {
                    Text(title).font(Theme.title)
                    Spacer(minLength: 8)
                    if let autoKey {
                        Toggle("Use for Auto", isOn: Binding(get: { !library.palette.autoOff.contains(autoKey) }, set: { setAutoBox(autoKey, on: $0) }))
                            #if os(macOS)
                            .toggleStyle(.checkbox)
                            #endif
                            .fixedSize()
                            .help(L("Let Auto choose from %@", title))
                    }
                }
            }
            content()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .font(Theme.body)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius).strokeBorder(highlighted ? Color.accentColor : Color.primary.opacity(0.06), lineWidth: highlighted ? 1.5 : 1))
        .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    }

    private func grid(_ paints: [Paint], selected: Bool) -> some View {
        let used = layerMode ? [] : session.usedPaintIDs
        return LazyVGrid(columns: columns, spacing: 6) {
            ForEach(paints) { paint in
                Button {
                    if layerMode { library.toggleLayerPaint(paint.id) } else { library.toggle(paint.id) }
                } label: {
                    PaintChip(paint: paint, showForm: selected, used: selected && used.contains(paint.id))
                }
                .buttonStyle(.plain)
                .accessibilityHint(L("Removes the paint from the palette"))
            }
        }
    }

    /// One's own paints, edited here; they go into boxes with the + of a box.
    private var ownPaints: some View {
        group(title: L("Your own paints")) {
            ForEach(library.custom) { paint in
                HStack(spacing: 10) {
                    PaintChip(paint: paint, showForm: true).frame(width: 150)
                    Text(paint.vendor).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    Button("Edit") { editedPaint = EditedPaint(paint: paint, box: nil) }
                    Button("Delete") { paintToDelete = paint }
                }
                .buttonStyle(.bordered)
            }
        }
    }
}

/// A paint box as a JSON file for the file exporter.
struct BoxDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]

    var data: Data
    var name: String

    init(data: Data, name: String) {
        self.data = data
        self.name = name
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
        name = configuration.file.filename ?? ""
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

/// Add or change one of the user's own paints: series, number, form, name and colour.
struct PaintEditorView: View {
    @Environment(Library.self) private var library
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var paint: Paint
    /// The box a new paint goes into.
    var box: String? = nil
    /// "New series" picked: the series is typed in.
    @State private var newSeries = false

    private var isNew: Bool { !library.custom.contains { $0.id == paint.id } }
    private var complete: Bool {
        ![paint.vendor, paint.number, paint.name].contains { $0.trimmingCharacters(in: .whitespaces).isEmpty }
    }
    /// The library of the series entered: with the full version its numbers fill in name and colour.
    private var source: PaintLibrary? { library.library(named: paint.vendor) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Vendor and Series", selection: Binding(
                        get: { newSeries || !library.seriesNames.contains(paint.vendor) ? "" : paint.vendor },
                        set: { name in
                            newSeries = name.isEmpty
                            paint.vendor = name
                            lookUp()
                        }
                    )) {
                        ForEach(library.seriesNames, id: \.self) { Text($0).tag($0) }
                        Text("New series").tag("")
                    }
                    if newSeries || !library.seriesNames.contains(paint.vendor) {
                        TextField("Name of the series", text: $paint.vendor)
                            .onSubmit { lookUp() }
                    }
                    TextField("Number", text: $paint.number)
                        .onChange(of: paint.number) { lookUp() }
                    Picker("Form", selection: Binding(get: { paint.comes(as: .tube) ? PaintForm.tube : .pan }, set: { paint.forms = [$0.rawValue] })) {
                        ForEach(PaintForm.own) { Text($0.singular).tag($0) }
                    }
                    TextField("Name", text: $paint.name)
                    ColorPicker("Colour", selection: Binding(get: { .from(hex: paint.hex) }, set: { paint.hex = $0.hex }), supportsOpacity: false)
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Pick the colour of the paint at its strongest wash: about equal parts paint and water, dry on white paper. Not the colour straight from the pan or tube.")
                        if let source, store.unlocked { Text(L("%@ numbers fill in name and colour.", source.name)) }
                        if let found {
                            Text(([source.map { "\($0.name) \(found.number)" } ?? found.number] + found.details).joined(separator: " · "))
                            if found.hex == nil { Text("The chart gives no reliable colour for this paint: set it by hand.") }
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle(L(isNew ? "Add Paint" : "Edit Paint"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        paint.vendor = paint.vendor.trimmingCharacters(in: .whitespaces)
                        paint.number = paint.number.trimmingCharacters(in: .whitespaces)
                        paint.name = paint.name.trimmingCharacters(in: .whitespaces)
                        library.savePaint(paint, into: box)
                        dismiss()
                    }
                    .disabled(!complete)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 380)
        #endif
    }

    /// The colour of the chart the number entered stands for (full version).
    private var found: ChartColour? { store.unlocked ? source?.colour(number: paint.number) : nil }

    /// A number that is on the colour chart of its library fills in the rest: the name, and the
    /// colour where the chart gives one (full version).
    private func lookUp() {
        guard isNew, paint.name.isEmpty, let known = found else { return }
        paint.name = known.name
        if let hex = known.hex { paint.hex = hex }
    }
}
