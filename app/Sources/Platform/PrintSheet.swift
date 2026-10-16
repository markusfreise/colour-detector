import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import PDFKit
#else
import UIKit
#endif

/// The printable sheet: the picture, then every mix with its washes and its recipe, on A4 pages.
@MainActor
enum PrintSheet {
    private static let page = CGSize(width: 595, height: 842) // A4 in points
    private static let margin: CGFloat = 34
    private static let rowHeight: CGFloat = 44
    private static let pictureHeight: CGFloat = 400


    static func pdf(session: Session, library: Library) -> Data {
        if session.layerMode { return layerPDF(session: session, library: library) }
        var rows = session.mixBlocks
        let picture = session.printImage()
        let labels = pictureLabels(session)

        let data = NSMutableData()
        var box = CGRect(origin: .zero, size: page)
        guard let consumer = CGDataConsumer(data: data), let context = CGContext(consumer: consumer, mediaBox: &box, nil) else { return Data() }

        let usable = page.height - 2 * margin
        var first = true
        repeat {
            let room = first ? usable - pictureHeight - 76 : usable
            let count = min(rows.count, max(1, Int(room / rowHeight)))
            let pageRows = Array(rows.prefix(count))
            rows.removeFirst(count)
            let view = PageView(
                title: first ? L("%@ – colours and mixes", session.imageName) : nil,
                picture: first ? picture : nil,
                segmentation: session.segmentation,
                labels: labels,
                rows: pageRows,
                key: first && pageRows.contains { $0.washes.count > 1 }
            )
            let renderer = ImageRenderer(content: view.frame(width: page.width, height: page.height).environment(\.colorScheme, .light))
            renderer.render { _, draw in
                context.beginPDFPage(nil)
                draw(context)
                context.endPDFPage()
            }
            first = false
        } while !rows.isEmpty
        context.closePDF()
        return data as Data
    }

    /// Layer mode: the finished picture with the list of layers, then one sheet per layer.
    private static func layerPDF(session: Session, library: Library) -> Data {
        guard let plan = session.layers else { return Data() }
        let rows = session.layerRows(paints: library.byID)
        let data = NSMutableData()
        var box = CGRect(origin: .zero, size: page)
        guard let consumer = CGDataConsumer(data: data), let context = CGContext(consumer: consumer, mediaBox: &box, nil) else { return Data() }
        func add(_ view: some View) {
            let renderer = ImageRenderer(content: view.frame(width: page.width, height: page.height).environment(\.colorScheme, .light))
            renderer.render { _, draw in
                context.beginPDFPage(nil)
                draw(context)
                context.endPDFPage()
            }
        }
        add(LayerOverviewPage(
            title: L("%@ – layers", session.imageName),
            picture: session.layerPicture(show: plan.layers.map(\.top)),
            width: plan.width,
            rows: rows
        ))
        for row in rows {
            let layer = plan.layers[row.id]
            let used = row.coats.count
            // "Coat 2 on the 2s and 3s."
            let more = (2...max(2, used)).filter { $0 <= used }.map { coat in
                L("Coat %lld on the %@.", coat, (coat...used).map { L("%llds", $0) }.joined(separator: L(" and ")))
            }
            add(LayerPage(
                title: L(row.accent ? "Accent %@: %@ (accent), %@" : "Layer %@: %@, %@", row.number, row.name, Words.guide(water: layer.water, consistency: layer.consistency)),
                instruction: row.accent
                    ? L("A strong wash on the numbered shapes, painted last, when everything else is dry.")
                    : ([L("Coat 1 on every numbered area.")] + more + [L("Let each coat dry.")]).joined(separator: " "),
                hex: row.hex,
                picture: session.layerPicture(show: plan.layers.indices.map { $0 == row.id ? layer.top : 0 }),
                width: plan.width,
                labels: layer.regions.compactMap { region in
                    region.coats > 0
                        ? NumberedPicture.Label(text: "\(region.coats)", x: Double(region.anchorX) + 0.5, y: Double(region.anchorY) + 0.5, room: Double(region.anchorDist), color: Color.ink(on: layer.hexes[region.coats]))
                        : nil
                }
            ))
        }
        context.closePDF()
        return data as Data
    }

    private struct LayerOverviewPage: View {
        let title: String
        let picture: CGImage?
        let width: Int
        let rows: [LayerRow]

        var body: some View {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.system(size: 15, weight: .semibold)).frame(height: 30, alignment: .top)
                if let picture {
                    NumberedPicture(image: picture, width: width, labels: [])
                        .frame(maxWidth: .infinity, maxHeight: PrintSheet.pictureHeight)
                        .frame(height: PrintSheet.pictureHeight + 24, alignment: .top)
                }
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 7) {
                    GridRow {
                        Text("Layer"); Text(""); Text("Paint"); Text("Wash"); Text("Coats"); Text("Of image")
                    }
                    .font(.system(size: 9, weight: .bold))
                    ForEach(rows) { row in
                        GridRow {
                            Text(row.number).font(.system(size: 11, weight: .bold))
                            RoundedRectangle(cornerRadius: 4).fill(Color(hex: row.hex)).frame(width: 26, height: 18)
                                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.black.opacity(0.35), lineWidth: 1))
                            Text(row.name + (row.accent ? L(" (accent)") : ""))
                            Text(row.wash)
                            Text("\(max(1, row.coats.count))")
                            Text(PrintSheet.percent(row.share))
                        }
                        .font(.system(size: 10))
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(PrintSheet.margin)
            .foregroundStyle(.black)
            .background(.white)
        }
    }

    private struct LayerPage: View {
        let title: String
        let instruction: String
        let hex: String
        let picture: CGImage?
        let width: Int
        let labels: [NumberedPicture.Label]

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 4).fill(Color(hex: hex)).frame(width: 30, height: 20)
                        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.black.opacity(0.35), lineWidth: 1))
                    Text(title).font(.system(size: 13, weight: .semibold))
                }
                Text(instruction).font(.system(size: 10))
                if let picture {
                    NumberedPicture(image: picture, width: width, labels: labels, fontSize: 7)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
                Spacer(minLength: 0)
            }
            .padding(PrintSheet.margin)
            .foregroundStyle(.black)
            .background(.white)
        }
    }

    private static func pictureLabels(_ session: Session) -> [NumberedPicture.Label] {
        guard session.settings.numbers, let segmentation = session.segmentation, session.regionEntry.count == segmentation.regions.count else { return [] }
        return segmentation.regions.compactMap { region in
            let index = session.regionEntry[region.id]
            guard session.entries.indices.contains(index) else { return nil }
            return NumberedPicture.Label(
                text: session.entries[index].label,
                x: Double(region.anchorX) + 0.5,
                y: Double(region.anchorY) + 0.5,
                room: Double(region.anchorDist),
                color: session.settings.view == .original ? .white : session.settings.view == .template ? Color.templateNumber : Color.ink(on: session.displayHex(session.entries[index]))
            )
        }
    }

    private struct PageView: View {
        let title: String?
        let picture: CGImage?
        let segmentation: Segmentation?
        let labels: [NumberedPicture.Label]
        let rows: [MixBlock]
        /// The letters of the water levels, above the list.
        let key: Bool

        var body: some View {
            VStack(alignment: .leading, spacing: 0) {
                if let title {
                    Text(title).font(.system(size: 15, weight: .semibold)).frame(height: 30, alignment: .top)
                }
                if let picture, let segmentation {
                    NumberedPicture(image: picture, width: segmentation.width, labels: labels, fontSize: 7)
                        .frame(maxWidth: .infinity, maxHeight: PrintSheet.pictureHeight)
                        .frame(height: PrintSheet.pictureHeight + 30, alignment: .top)
                }
                if key {
                    Text(Mixing.washLetters.map { "\($0.letter) \(L($0.label))" }.joined(separator: "   "))
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                        .frame(height: 16, alignment: .top)
                }
                ForEach(rows) { row in
                    HStack(spacing: 8) {
                        Text(row.number).font(.system(size: 12, weight: .bold)).frame(width: 22, alignment: .trailing)
                        // The washes of the mix side by side, lightest first, each in its own colour.
                        HStack(spacing: 0) {
                            ForEach(row.washes) { wash in
                                VStack(spacing: 1) {
                                    Text(wash.letter.isEmpty ? row.number : wash.letter).font(.system(size: 10, weight: .bold))
                                    Text(PrintSheet.percent(wash.share)).font(.system(size: 7))
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color(hex: wash.hex))
                                .foregroundStyle(Color.ink(on: wash.hex))
                            }
                        }
                        .frame(width: 150, height: 36)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.black.opacity(0.35), lineWidth: 1))
                        if row.paints.isEmpty {
                            Text("Leave the paper white").font(.system(size: 10)).italic().frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            VStack(spacing: 3) {
                                HStack(spacing: 6) {
                                    ForEach(0..<3, id: \.self) { slot in
                                        if slot < row.paints.count {
                                            paint(row.paints[slot])
                                        } else {
                                            Color.clear.frame(maxWidth: .infinity, maxHeight: 22)
                                        }
                                    }
                                }
                                RecipeBar(parts: row.paints, fontSize: 8).frame(height: 11)
                            }
                        }
                        Text(PrintSheet.percent(row.share)).font(.system(size: 10)).foregroundStyle(.secondary).frame(width: 30, alignment: .trailing)
                    }
                    .frame(height: PrintSheet.rowHeight)
                }
                Spacer(minLength: 0)
            }
            .padding(PrintSheet.margin)
            .foregroundStyle(.black)
            .background(.white)
        }

        private func paint(_ part: MixBlock.Part) -> some View {
            HStack(spacing: 6) {
                Text("\(Text(part.parts + " x").bold()) \(part.paint.formLabel)").fixedSize()
                Spacer(minLength: 0)
                Text("\(Text(part.paint.displayNumber).bold()) \(part.paint.displayName)").truncationMode(.tail)
            }
            .font(.system(size: 8.5))
            .lineLimit(1)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, minHeight: 22, maxHeight: 22)
            .background(Color(hex: part.paint.hex))
            .foregroundStyle(Color.ink(on: part.paint.hex))
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(.black.opacity(0.35), lineWidth: 1))
        }
    }

    fileprivate static func percent(_ share: Double) -> String {
        let percent = Int((share * 100).rounded())
        return percent == 0 ? "<1%" : "\(percent)%"
    }

    /// Opens the system print dialog for the sheet.
    static func print(session: Session, library: Library) {
        let data = pdf(session: session, library: library)
        #if os(macOS)
        guard let document = PDFDocument(data: data) else { return }
        let info = NSPrintInfo.shared
        info.jobDisposition = .spool
        document.printOperation(for: info, scalingMode: .pageScaleToFit, autoRotate: true)?.run()
        #else
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = session.imageName
        controller.printInfo = info
        controller.printingItem = data
        controller.present(animated: true)
        #endif
    }
}

/// The sheet as a PDF file for the share sheet; made when it is actually shared.
struct SheetPDF: Transferable {
    let name: String
    let make: @MainActor @Sendable () -> Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .pdf) { sheet in
            await sheet.make()
        }
        .suggestedFileName { "\($0.name).pdf" }
    }
}
