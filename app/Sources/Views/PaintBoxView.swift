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

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 6)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    boxBar
                    group(title: nil, highlighted: true) {
                        if library.selected.isEmpty {
                            Text("No paints selected. Tap a paint below to add it.").foregroundStyle(.secondary)
                        } else {
                            grid(library.selected, selected: true)
                        }
                    }
                    ForEach(library.available) { available in
                        group(title: available.form.title) { grid(available.paints, selected: false) }
                    }
                    ownPaints
                }
                .padding()
            }
            .navigationTitle("Paint Box")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Menu("Select") {
                        Button("Auto: Paints for This Picture", systemImage: "wand.and.stars", action: auto)
                            .disabled(session.entries.isEmpty)
                        Button("Revert to Default", systemImage: "arrow.uturn.backward") { library.revert() }
                        Button("Clear", systemImage: "xmark.circle", role: .destructive) { library.clear() }
                    }
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
        .frame(minWidth: 640, minHeight: 620)
        #endif
    }

    // MARK: Boxes

    private var boxBar: some View {
        HStack {
            Menu {
                Picker("Paint box", selection: Binding(get: { library.activeBox.id }, set: { library.selectBox($0) })) {
                    ForEach(library.boxes) { Text($0.name).tag($0.id) }
                }
                Divider()
                Button("New Box", systemImage: "plus", action: newBox)
                Button("Rename", systemImage: "pencil") {
                    boxName = library.activeBox.name
                    namingBox = .rename
                }
                if library.boxes.count > 1 {
                    Button("Delete Box", systemImage: "trash", role: .destructive) { confirmingBoxDelete = true }
                }
            } label: {
                Label(library.activeBox.name, systemImage: "shippingbox")
                    .font(.headline)
            }
            .fixedSize()
            Spacer()
            Text("\(library.selected.count) paints").foregroundStyle(.secondary)
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

    /// Lets the app pick the paints for the current picture, from the default selection and the user's own paints.
    private func auto() {
        let targets = session.entries.map { (hex: $0.targetHex, weight: $0.share) }
        let pool = library.all.filter { $0.enabled || $0.isCustom }.map(\.mixPaint)
        library.setEnabled(Mixing.proposePaints(targets: targets, paints: pool, maxPaints: session.settings.maxPaints))
    }

    // MARK: Paints

    private func group(title: String?, highlighted: Bool = false, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { Text(title).font(.title3.weight(.semibold)) }
            content()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(highlighted ? Color.accentColor : .clear, lineWidth: 1.5))
    }

    private func grid(_ paints: [Paint], selected: Bool) -> some View {
        let used = session.usedPaintIDs
        return LazyVGrid(columns: columns, spacing: 6) {
            ForEach(paints) { paint in
                Button {
                    library.toggle(paint.id)
                } label: {
                    PaintChip(paint: paint, showForm: selected, used: selected && used.contains(paint.id))
                }
                .buttonStyle(.plain)
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
                    Button("Delete", role: .destructive) { paintToDelete = paint }
                }
                .buttonStyle(.borderless)
            }
            Button("Add Paint", systemImage: "plus") {
                editedPaint = Paint(id: "custom-\(UUID().uuidString.prefix(8))", vendor: "Schmincke", number: "", name: "", hex: "#c88c5f", forms: ["pan"], source: "custom", custom: true)
            }
            .buttonStyle(.bordered)
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
