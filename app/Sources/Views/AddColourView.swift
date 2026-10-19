import SwiftUI

/// Colours for one box, as the web's Add colour dialog: a colour of one's own (colour, number,
/// series, name, and pan, tube, liquid or other), then the libraries by series, sorted by number,
/// filtered by words and nine hue groups. A tap adds a colour or takes it out again; colours
/// already in the box are ghosted.
struct AddColourView: View {
    @Environment(Library.self) private var library
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    let boxID: String
    /// The purchase screen, for the catalogues of known manufacturers.
    let getPro: () -> Void

    @State private var query = ""
    @State private var hue: HueGroup?
    @State private var form: Paint
    @State private var hidden = AddColourView.hiddenSeries

    /// The series switched off, kept while the app is open: whoever adds colours from two makers
    /// wants those two the next time too.
    nonisolated(unsafe) private static var hiddenSeries = Set<String>()

    init(boxID: String, getPro: @escaping () -> Void) {
        self.boxID = boxID
        self.getPro = getPro
        _form = State(initialValue: Self.blank(boxID))
    }

    private static func blank(_ boxID: String) -> Paint {
        Paint(id: "custom-\(UUID().uuidString.prefix(8))", vendor: "", number: "", name: "", hex: "#b22727", forms: [boxID == "tube" ? "tube" : "pan"], source: "custom", custom: true)
    }

    private struct Section: Identifiable {
        let id: String
        let name: String
        let colours: [SeriesColour]
    }

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 6)]

    var body: some View {
        NavigationStack {
            ScrollViewReader { scroller in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Own colour").font(Theme.title).id("top")
                        OwnColourForm(paint: $form, submit: saveOwn)

                        Text("Library").font(Theme.title)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 6)], alignment: .leading, spacing: 6) {
                            ForEach(sections) { section in
                                Button { toggle(section.id) } label: {
                                    Text(L(section.name)).lineLimit(1).frame(maxWidth: .infinity)
                                }
                                .borderedStyle(selected: !hidden.contains(section.id))
                                .accessibilityAddTraits(hidden.contains(section.id) ? [] : .isSelected)
                            }
                        }
                        .buttonStyle(.bordered)
                        .tint(Theme.corporate)

                        filter

                        if !store.unlocked {
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Button("Get pro", action: getPro).buttonStyle(.borderless)
                                Text("and easily add pre-defined colours from the catalogues of known manufacturers and brands.")
                                    .font(Theme.small).foregroundStyle(.secondary)
                            }
                        }

                        let shown = shownSections
                        ForEach(shown) { section in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(L(section.name)).font(Theme.strong)
                                LazyVGrid(columns: columns, spacing: 6) {
                                    ForEach(section.colours) { colour in
                                        chip(colour) { pick(colour, scroller: scroller) }
                                    }
                                }
                            }
                        }
                        if shown.isEmpty {
                            Text("No colour found").foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                }
            }
            .background(Theme.page)
            .navigationTitle(L("Add colour"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Clear", systemImage: "eraser", action: clear)
                        .help(L("Clear: empty the search and the filters"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 720, minHeight: 680)
        #endif
    }

    /// Words, and the hue groups as round swatches.
    private var filter: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(L("Name, number …"), text: $query)
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()
                .accessibilityLabel(L("Search a colour"))
            HStack(spacing: 6) {
                ForEach(HueGroup.allCases) { group in
                    Button { hue = hue == group ? nil : group } label: {
                        Circle()
                            .fill(Color(hex: group.hex))
                            .frame(width: 26, height: 26)
                            .overlay(Circle().strokeBorder(Theme.corporate, lineWidth: hue == group ? 2.5 : 0).padding(-4))
                            .padding(4)
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(L(group.name))
                    .accessibilityLabel(L(group.name))
                    .accessibilityAddTraits(hue == group ? .isSelected : [])
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L("Hue"))
        }
    }

    private func chip(_ colour: SeriesColour, action: @escaping () -> Void) -> some View {
        let added = inBox(colour)
        let hex = colour.hex
        return Button(action: action) {
            HStack(spacing: 6) {
                Text(Paint.displayNumber(colour.number)).bold()
                Text(colour.name).lineLimit(1).truncationMode(.tail)
                Spacer(minLength: 0)
            }
            .font(Theme.chip)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            .background(hex.map { Color(hex: $0) } ?? .clear)
            .foregroundStyle(hex.map { Color.ink(on: $0) } ?? Theme.copy)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay {
                if hex == nil {
                    RoundedRectangle(cornerRadius: 6).strokeBorder(.primary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                } else {
                    RoundedRectangle(cornerRadius: 6).strokeBorder(.primary.opacity(0.35), lineWidth: 1)
                }
            }
            .opacity(added ? 0.35 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(title(colour))
        .accessibilityLabel(title(colour))
        .accessibilityAddTraits(added ? .isSelected : [])
    }

    // MARK: Data

    private var charts: Bool { store.unlocked }

    /// The libraries, then every other series the paints of the app come in. The common colours are
    /// for everybody, the charts of the makers with the full version.
    private var sections: [Section] {
        let paints = library.all
        let libraries = library.libraries.map { (id: $0.id, name: $0.name, catalogue: $0.isOpen(unlocked: charts) ? $0.catalogue : []) }
        let others = Set(paints.map(\.vendor).filter { !$0.isEmpty && library.library(named: $0) == nil })
            .sorted { $0.localizedCompare($1) == .orderedAscending }
            .map { (id: "vendor:\($0)", name: $0, catalogue: [ChartColour]()) }
        return (libraries + others).compactMap { source in
            let colours = SeriesColours.list(vendor: source.name, catalogue: source.catalogue, paints: paints, name: \.displayName, locale: Localization.current)
            return colours.isEmpty ? nil : Section(id: source.id, name: source.name, colours: colours)
        }
    }

    /// The series switched on, with the colours that match the search and the hue.
    private var shownSections: [Section] {
        sections.filter { !hidden.contains($0.id) }.compactMap { section in
            let found = SeriesColours.filter(section.colours, query: query, hue: hue)
            return found.isEmpty ? nil : Section(id: section.id, name: section.name, colours: found)
        }
    }

    private var box: PaintBox? { library.boxes.first { $0.id == boxID } }

    private func inBox(_ colour: SeriesColour) -> Bool {
        guard let id = colour.paintID, let box else { return false }
        return box.paintIDs.contains(id)
    }

    private func title(_ colour: SeriesColour) -> String {
        let text = "\(L(colour.vendor)) \(Paint.displayNumber(colour.number)) \(colour.name)"
        return colour.hex == nil ? "\(text) · \(L("The chart gives no reliable colour for this paint: set it by hand."))" : text
    }

    // MARK: Actions

    private func toggle(_ id: String) {
        if hidden.contains(id) { hidden.remove(id) } else { hidden.insert(id) }
        Self.hiddenSeries = hidden
    }

    private func clear() {
        query = ""
        hue = nil
        form = Self.blank(boxID)
    }

    /// A tap puts the colour into the box or takes it out again. A colour the chart has no reliable
    /// value for goes to the form above, where its colour is set by hand.
    private func pick(_ colour: SeriesColour, scroller: ScrollViewProxy) {
        if inBox(colour), let id = colour.paintID {
            library.removeFromBox(boxID, paint: id)
        } else if colour.hex != nil {
            library.addColour(colour, to: boxID)
        } else {
            var paint = Self.blank(boxID)
            paint.vendor = colour.vendor
            paint.number = colour.number
            paint.name = colour.chartName
            form = paint
            withAnimation { scroller.scrollTo("top", anchor: .top) }
        }
    }

    private func saveOwn() {
        library.savePaint(form.trimmed, into: boxID)
        dismiss()
    }
}

/// A paint of one's own, new or edited, as the web's PaintForm: colour, number, series and name,
/// its form below, with the note on how to pick the colour for a new one.
struct OwnColourForm: View {
    @Environment(Library.self) private var library
    @Environment(Store.self) private var store
    @Binding var paint: Paint
    var isNew = true
    let submit: () -> Void
    var cancel: (() -> Void)? = nil

    private var complete: Bool {
        ![paint.vendor, paint.number, paint.name].contains { $0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    /// The library of the series entered: its numbers fill in name and colour where it is open.
    private var source: PaintLibrary? { library.library(named: paint.vendor) }
    private var open: Bool { source?.isOpen(unlocked: store.unlocked) == true }
    private var found: ChartColour? { open ? source?.colour(number: paint.number) : nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) { fields }
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        swatch
                        numberField.frame(width: 90)
                        seriesField
                    }
                    nameField
                }
            }
            HStack(spacing: 8) {
                Picker("Form", selection: Binding(get: { paint.ownForm }, set: { paint.forms = [$0.rawValue] })) {
                    ForEach(PaintForm.own) { Text($0.singular).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
                Spacer(minLength: 8)
                if let cancel {
                    Button("Cancel", action: cancel).buttonStyle(.bordered)
                }
                Button(L("Okay"), action: submit)
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.corporate)
                    .disabled(!complete)
            }
            if isNew {
                Text("Pick the colour of the paint at its strongest wash: about equal parts paint and water, dry on white paper. Not the colour straight from the pan or tube.")
                    + (source != nil && open ? Text(" " + L("%@ numbers fill in name and colour.", L(source?.name ?? ""))) : Text(""))
            }
            if let found {
                Text(([source.map { "\(L($0.name)) \(found.number)" } ?? found.number] + found.details).joined(separator: " · ") + ".")
                if found.hex == nil { Text("The chart gives no reliable colour for this paint: set it by hand.") }
            }
        }
        .font(Theme.small)
        .foregroundStyle(Theme.copy)
        .onChange(of: paint.number) { lookUp() }
        .onChange(of: paint.vendor) { lookUp() }
    }

    @ViewBuilder private var fields: some View {
        swatch
        numberField.frame(width: 90)
        seriesField
        nameField
    }

    private var swatch: some View {
        ColorPicker(L("Colour"), selection: Binding(get: { .from(hex: paint.hex) }, set: { paint.hex = $0.hex }), supportsOpacity: false)
            .labelsHidden()
            .help(L("Colour"))
    }

    private var numberField: some View {
        TextField(L("Number"), text: $paint.number)
            .textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
    }

    /// Typed, or picked from the series in use and those that come with the app.
    private var seriesField: some View {
        HStack(spacing: 2) {
            TextField(L("Series"), text: $paint.vendor)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
            Menu {
                ForEach(library.seriesNames, id: \.self) { name in
                    Button(L(name)) { paint.vendor = name }
                }
            } label: {
                Image(systemName: "chevron.down").frame(width: 24, height: 28)
            }
            .menuIndicator(.hidden)
            .fixedSize()
            .accessibilityLabel(L("Series"))
        }
        .frame(minWidth: 150)
    }

    private var nameField: some View {
        TextField(L("Name"), text: $paint.name)
            .textFieldStyle(.roundedBorder)
            .frame(minWidth: 140)
    }

    /// A number that is on the colour chart of its library fills in the rest: the name, and the
    /// colour where the chart gives one.
    private func lookUp() {
        guard isNew, paint.name.isEmpty, let known = found else { return }
        paint.name = known.name
        if let hex = known.hex { paint.hex = hex }
    }
}

/// One of the user's own paints edited, in the form of Add colour.
struct PaintEditorView: View {
    @Environment(Library.self) private var library
    @Environment(\.dismiss) private var dismiss
    @State var paint: Paint
    /// The box a new paint goes into.
    var box: String? = nil

    var body: some View {
        NavigationStack {
            ScrollView {
                OwnColourForm(paint: $paint, isNew: !library.custom.contains { $0.id == paint.id }, submit: {
                    library.savePaint(paint.trimmed, into: box)
                    dismiss()
                }, cancel: { dismiss() })
                .padding()
            }
            .background(Theme.page)
            .navigationTitle(L("Edit Paint"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
        #if os(macOS)
        .frame(minWidth: 640, minHeight: 240)
        #endif
    }
}

extension Paint {
    /// Series, number and name without the spaces around them.
    var trimmed: Paint {
        var paint = self
        paint.vendor = vendor.trimmingCharacters(in: .whitespaces)
        paint.number = number.trimmingCharacters(in: .whitespaces)
        paint.name = name.trimmingCharacters(in: .whitespaces)
        return paint
    }

    /// Vendor number with at least three digits, as `displayNumber`.
    static func displayNumber(_ number: String) -> String {
        number.allSatisfy(\.isNumber) && number.count < 3 ? String(repeating: "0", count: 3 - number.count) + number : number
    }
}
