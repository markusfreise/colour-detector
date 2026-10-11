import SwiftUI

/// The paints in the active box on top (tap removes), all other paints below (tap adds), and the user's own paints.
struct PaintBoxView: View {
    @Environment(Library.self) private var library
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var editedPaint: Paint?
    @State private var boxName = ""
    @State private var namingBox: BoxNaming?
    @State private var confirmingBoxDelete = false
    @State private var paintToDelete: Paint?
    @State private var showingPaywall = false

    private enum BoxNaming: Identifiable {
        case new, rename

        var id: Self { self }
    }

    private let columns = [GridItem(.adaptive(minimum: 116), spacing: 6)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    boxBar
                    if layerMode {
                        Text("Layer mode paints with a few base paints, one layer each (\(selected.count) of \(Library.maxLayerPaints)). They are kept apart from the paints selected for mixing.\(full ? " \(Library.maxLayerPaints) layers at most: remove one before adding another." : "")")
                            .font(Theme.small)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    group(title: nil, highlighted: true) {
                        if selected.isEmpty {
                            Text(layerMode ? "No base paints chosen. Tap a paint below to add it, or press Auto." : "No paints selected. Tap a paint below to add it.").foregroundStyle(.secondary)
                        } else {
                            grid(selected, selected: true)
                        }
                    }
                    ForEach(available) { available in
                        group(title: available.form.title) { grid(available.paints, selected: false) }
                    }
                    ownPaints
                }
                .padding()
            }
            .background(Theme.page)
            .navigationTitle(layerMode ? "Paint Box: Base Paints" : "Paint Box")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $editedPaint) { PaintEditorView(paint: $0) }
            .sheet(isPresented: $showingPaywall) { PaywallView(reason: "keep more than one paint box") }
            .alert(namingBox == .new ? "New Paint Box" : "Rename Paint Box", isPresented: Binding(get: { namingBox != nil }, set: { if !$0 { namingBox = nil } })) {
                TextField("Name", text: $boxName)
                Button("Cancel", role: .cancel) {}
                Button(namingBox == .new ? "Create" : "Save") {
                    if namingBox == .new { library.addBox(named: boxName) } else { library.renameBox(library.activeBox.id, to: boxName) }
                }
            }
            .confirmationDialog("Delete the box \"\(library.activeBox.name)\"?", isPresented: $confirmingBoxDelete, titleVisibility: .visible) {
                Button("Delete Box", role: .destructive) { library.deleteBox(library.activeBox.id) }
            } message: {
                Text("The paints stay in your library.")
            }
            .confirmationDialog("Delete this paint?", isPresented: Binding(get: { paintToDelete != nil }, set: { if !$0 { paintToDelete = nil } }), titleVisibility: .visible, presenting: paintToDelete) { paint in
                Button("Delete \(paint.name)", role: .destructive) { library.deletePaint(paint.id) }
            } message: { _ in
                Text("It is removed from every paint box.")
            }
        }
        #if os(macOS)
        .frame(minWidth: 760, minHeight: 680)
        #endif
    }

    /// In layer mode the screen edits the base paints of the box instead of its selection for mixing.
    private var layerMode: Bool { session.settings.mode == .layer }
    private var autoOn: Bool { layerMode ? library.activeBox.layerAuto : library.activeBox.auto }
    private var selected: [Paint] { layerMode ? library.layerPaints.sortedForBox() : library.selected }
    private var available: [PaintGroup] {
        guard layerMode else { return library.available }
        let base = Set(library.activeBox.layerIDs)
        return library.all.filter { !base.contains($0.id) }.groupedByForm()
    }
    private var full: Bool { layerMode && library.activeBox.layerIDs.count >= Library.maxLayerPaints }

    // MARK: Boxes

    /// The boxes as buttons with what can be done to them, then what can be done to the selection.
    private var boxBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(library.boxes) { box in
                        Button(box.name) { library.selectBox(box.id) }
                            .buttonStyle(OutlineButtonStyle(prominent: box.id == library.activeBox.id))
                            .accessibilityAddTraits(box.id == library.activeBox.id ? .isSelected : [])
                    }
                    Button("New Box", systemImage: "plus", action: newBox)
                    Button("Rename") {
                        boxName = library.activeBox.name
                        namingBox = .rename
                    }
                    if library.boxes.count > 1 {
                        Button("Delete Box") { confirmingBoxDelete = true }
                    }
                }
                .buttonStyle(.outline)
                .padding(1)
            }
            HStack(spacing: 6) {
                Button("Auto", systemImage: "wand.and.stars", action: auto)
                    .buttonStyle(OutlineButtonStyle(prominent: autoOn))
                    .fixedSize()
                    .disabled(session.image == nil)
                    .help(layerMode ? "Let the app choose the base paints for this picture" : "Let the app select the paints that suit each picture")
                    .accessibilityAddTraits(autoOn ? .isSelected : [])
                if !layerMode {
                    Button("Revert") { library.revert() }
                        .help("Back to the default selection")
                }
                Button("Clear") {
                    if layerMode { library.setLayerPaints([]) } else { library.clear() }
                }
                Spacer(minLength: 8)
                Text("\(selected.count) selected").font(Theme.small).foregroundStyle(.secondary).lineLimit(1)
            }
            .buttonStyle(.outline)
        }
    }

    private func newBox() {
        guard store.unlocked || library.boxes.count < Store.freeBoxes else {
            showingPaywall = true
            return
        }
        boxName = ""
        namingBox = .new
    }

    /// Lets the app pick the paints for each picture, from the default selection and the user's own paints.
    private func auto() {
        if layerMode {
            // The proposal needs the picture, so it is made while the layers are planned again.
            session.proposeLayers()
            return
        }
        library.switchToAuto()
        session.recomputeAllRecipes()
    }

    // MARK: Paints

    private func group(title: String?, highlighted: Bool = false, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { Text(title).font(Theme.title) }
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
                // A full set of base paints takes no more; the note above says why.
                .disabled(!selected && full)
                .opacity(!selected && full ? 0.45 : 1)
                .accessibilityHint(selected ? "Removes the paint from the box" : "Adds the paint to the box")
            }
        }
    }

    private var ownPaints: some View {
        group(title: "Your own paints") {
            if library.custom.isEmpty {
                Text("Add paints of any brand that are not in the lists above.").foregroundStyle(.secondary)
            }
            ForEach(library.custom) { paint in
                HStack(spacing: 10) {
                    PaintChip(paint: paint, showForm: true).frame(width: 150)
                    Text(paint.vendor).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    Button("Edit") { editedPaint = paint }
                    Button("Delete") { paintToDelete = paint }
                }
                .buttonStyle(.outline)
            }
            Button("Add Paint", systemImage: "plus") {
                editedPaint = Paint(id: "custom-\(UUID().uuidString.prefix(8))", vendor: "Schmincke", number: "", name: "", hex: "#c88c5f", forms: ["pan"], source: "custom", custom: true)
            }
            .buttonStyle(.outlineProminent)
        }
    }
}

/// Add or change one of the user's own paints.
struct PaintEditorView: View {
    @Environment(Library.self) private var library
    @Environment(\.dismiss) private var dismiss
    @State var paint: Paint

    private var isNew: Bool { !library.custom.contains { $0.id == paint.id } }
    private var complete: Bool {
        ![paint.vendor, paint.number, paint.name].contains { $0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Brand", text: $paint.vendor)
                    TextField("Number", text: $paint.number)
                        .onChange(of: paint.number) { lookUp() }
                    TextField("Name", text: $paint.name)
                    Picker("Form", selection: Binding(get: { paint.comes(as: .tube) ? PaintForm.tube : .pan }, set: { paint.forms = [$0.rawValue] })) {
                        ForEach(PaintForm.allCases) { Text($0.singular).tag($0) }
                    }
                    ColorPicker("Colour", selection: Binding(get: { .from(hex: paint.hex) }, set: { paint.hex = $0.hex }), supportsOpacity: false)
                } footer: {
                    Text("Pick the colour of a medium wash on white paper, not the colour straight from the pan or tube. Schmincke Horadam numbers fill in name and colour.")
                }
            }
            .formStyle(.grouped)
            .navigationTitle(isNew ? "Add Paint" : "Edit Paint")
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
                        library.savePaint(paint)
                        dismiss()
                    }
                    .disabled(!complete)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 360)
        #endif
    }

    /// A Horadam number that is on the colour chart fills in the rest.
    private func lookUp() {
        guard isNew, paint.name.isEmpty, paint.vendor.localizedCaseInsensitiveContains("schmincke"),
              let known = library.chartColour(number: paint.number) else { return }
        paint.name = known.name
        paint.hex = known.hex
    }
}
