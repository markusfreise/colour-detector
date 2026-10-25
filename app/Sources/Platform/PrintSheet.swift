import SwiftUI
import UniformTypeIdentifiers
import CoreImage.CIFilterBuiltins
#if os(macOS)
import PDFKit
#else
import UIKit
#endif

/// The printable sheet, as the web prints it: the picture on a page of its own, then every colour
/// as a card, four to a row: its base colour and washes on top, the ratio bar, its paints below.
/// At the top of the colours a QR code that restores the settings and paints on the website
/// (`RestoreLink`); at the foot of every page the picture's name, date and time, and the page number.
@MainActor
enum PrintSheet {
    private static let page = CGSize(width: 595, height: 842) // A4 in points
    private static let margin: CGFloat = 34
    private static let pictureHeight: CGFloat = 400
    /// Cards in a row, and the room between them.
    private static let cardsPerRow = 4
    private static let cardGap: CGFloat = 10
    private static let rowGap: CGFloat = 28
    /// The QR code, about 28 mm, and the room the title and key take beside it.
    private static let qrSize: CGFloat = 80

    static func pdf(session: Session, library: Library) -> Data {
        if session.layerMode { return layerPDF(session: session, library: library) }
        let cards = session.mixBlocks.map(Card.init)
        let qr = RestoreLink.url(settings: session.settings, palette: library.palette, paints: library.byID).flatMap(qrImage)
        var pages: [AnyView] = []
        func add(_ view: some View) { pages.append(AnyView(view)) }

        // The picture has the first page to itself.
        if let picture = session.printImage(), let segmentation = session.segmentation {
            add(PicturePage(picture: picture, width: segmentation.width, labels: pictureLabels(session), settings: session.settings))
        }
        // Then the cards, row by row, as many rows as fit on a page.
        var rows = stride(from: 0, to: cards.count, by: cardsPerRow).map { Array(cards[$0..<min($0 + cardsPerRow, cards.count)]) }
        var first = true
        repeat {
            var room = page.height - 2 * margin - (first ? max(30 + 22, qrSize) + 10 : 0)
            var pageRows: [[Card]] = []
            while let row = rows.first {
                let height = row.map(\.estimatedHeight).max() ?? 0
                guard pageRows.isEmpty || height <= room else { break }
                pageRows.append(row)
                rows.removeFirst()
                room -= height + rowGap
            }
            add(CardsPage(title: first ? L("%@ – colours and mixes", session.imageName) : nil, qr: first ? qr : nil, rows: pageRows))
            first = false
        } while !rows.isEmpty
        return render(pages, stamp: stamp(session.imageName))
    }

    /// The pages into one PDF, each with the stamp at its foot and its number of all.
    private static func render(_ pages: [AnyView], stamp: String) -> Data {
        let data = NSMutableData()
        var box = CGRect(origin: .zero, size: page)
        guard let consumer = CGDataConsumer(data: data), let context = CGContext(consumer: consumer, mediaBox: &box, nil) else { return Data() }
        for (index, view) in pages.enumerated() {
            let footed = view
                .frame(width: page.width, height: page.height)
                .overlay(alignment: .bottom) {
                    HStack {
                        Text(stamp)
                        Spacer()
                        Text("\(index + 1) / \(pages.count)")
                    }
                    .font(.system(size: 8))
                    .foregroundStyle(Color(white: 0.4))
                    .padding(.horizontal, margin)
                    .padding(.bottom, 14)
                }
                .environment(\.colorScheme, .light)
            ImageRenderer(content: footed).render { _, draw in
                context.beginPDFPage(nil)
                draw(context)
                context.endPDFPage()
            }
        }
        context.closePDF()
        return data as Data
    }

    /// "Underground · 24 Oct 2026, 14:03": the picture and when the sheet was made, as on the web.
    private static func stamp(_ name: String) -> String {
        let time = Date.now.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(Localization.locale))
        return [name, time].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// The QR code of a link, sharp at any size.
    private static func qrImage(_ text: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "L"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)) else { return nil }
        return CIContext().createCGImage(output, from: output.extent)
    }

    /// One colour on the printed sheet, as the web's PrintLegend: the concentrated wash is the base
    /// colour; without one, the mix with its strongest paint at full strength, as a C wash would be.
    private struct Card: Identifiable {
        struct Wash: Identifiable {
            let id: Int
            let letter: String
            let hex: String
            let share: Double
        }

        let id: String
        let number: String
        let hex: String
        let baseShare: Double?
        /// The other washes, darkest first.
        let washes: [Wash]
        let paints: [MixBlock.Part]

        static let concentrated = Mixing.washLetters.last?.letter ?? "C"

        init(_ block: MixBlock) {
            id = block.id
            number = block.number
            paints = block.paints
            let base = block.washes.first { $0.letter == Self.concentrated || $0.letter.isEmpty }
            baseShare = base?.share
            if let base {
                hex = base.hex
            } else if let most = block.paints.map(\.share).max(), most > 0 {
                hex = Mixing.mixHex(block.paints.map { MixPaint(id: $0.paint.id, hex: $0.paint.hex) }, block.paints.map { $0.share / most * Mixing.maxAmount })
            } else {
                hex = block.hex
            }
            let rank = { (letter: String) in Mixing.washLetters.firstIndex { $0.letter == letter } ?? -1 }
            washes = block.washes
                .filter { $0.id != base?.id }
                .sorted { rank($0.letter) > rank($1.letter) }
                .map { Wash(id: $0.id, letter: $0.letter, hex: $0.hex, share: $0.share) }
        }

        /// About how tall the card is drawn: washes, bar and a paint of up to two lines each.
        var estimatedHeight: CGFloat {
            42 + 4 + (paints.isEmpty ? 14 : 30 + 4 + CGFloat(paints.count) * 25 + CGFloat(paints.count - 1) * 3)
        }
    }

    private struct PicturePage: View {
        let picture: CGImage
        let width: Int
        let labels: [NumberedPicture.Label]
        let settings: AnalysisSettings

        var body: some View {
            NumberedPicture(image: picture, width: width, labels: labels, fontSize: 9, settings: settings)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .padding(PrintSheet.margin)
                .background(.white)
        }
    }

    private struct CardsPage: View {
        let title: String?
        let qr: CGImage?
        let rows: [[Card]]

        var body: some View {
            VStack(alignment: .leading, spacing: 0) {
                if let title {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 0) {
                            // Two lines where the QR code leaves too little room for one.
                            Text(title).font(.system(size: 15, weight: .semibold)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                                .padding(.bottom, 8)
                            // The letters of the water levels.
                            HStack(spacing: 12) {
                                ForEach(Mixing.washLetters, id: \.letter) { wash in
                                    Text("\(Text(wash.letter).bold()) \(L(wash.label))")
                                }
                            }
                            .font(.system(size: 9))
                            .frame(height: 22, alignment: .top)
                        }
                        Spacer(minLength: 0)
                        if let qr {
                            // L: the sheet is drawn outside the views, where a plain Text would take the system's language.
                            Text(L("Scan to bring back these paints and settings, then open the photo again."))
                                .font(.system(size: 8))
                                .foregroundStyle(Color(white: 0.4))
                                .frame(width: 120, alignment: .leading)
                            Image(decorative: qr, scale: 1)
                                .interpolation(.none)
                                .resizable()
                                .frame(width: PrintSheet.qrSize, height: PrintSheet.qrSize)
                        }
                    }
                    .frame(height: max(30 + 22, qr == nil ? 0 : PrintSheet.qrSize) + 10, alignment: .top)
                }
                VStack(alignment: .leading, spacing: PrintSheet.rowGap) {
                    ForEach(rows.indices, id: \.self) { r in
                        HStack(alignment: .top, spacing: PrintSheet.cardGap) {
                            ForEach(0..<PrintSheet.cardsPerRow, id: \.self) { c in
                                if c < rows[r].count {
                                    card(rows[r][c])
                                } else {
                                    Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
                                }
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(PrintSheet.margin)
            .foregroundStyle(.black)
            .background(.white)
        }

        private func card(_ card: Card) -> some View {
            VStack(alignment: .leading, spacing: 4) {
                // The base colour with the number, then the other washes, darkest first.
                GeometryReader { geometry in
                    // The base colour 1.4 times as wide as each other wash.
                    let unit = geometry.size.width / (1.4 + CGFloat(card.washes.count))
                    HStack(spacing: 0) {
                        VStack(spacing: 1) {
                            Text(card.number).font(.system(size: 16, weight: .bold)).monospacedDigit()
                            Text("\(Text(Card.concentrated).font(.system(size: 11, weight: .bold)))\(card.baseShare.map { " " + PrintSheet.percent($0) } ?? "")")
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .frame(width: unit * 1.4, height: geometry.size.height)
                        .background(Color(hex: card.hex))
                        .foregroundStyle(Color.ink(on: card.hex))
                        ForEach(card.washes) { wash in
                            VStack(spacing: 1) {
                                Text(wash.letter).font(.system(size: 11, weight: .bold))
                                Text(PrintSheet.percent(wash.share)).lineLimit(1).minimumScaleFactor(0.7)
                            }
                            .frame(width: unit, height: geometry.size.height)
                            .background(Color(hex: wash.hex))
                            .foregroundStyle(Color.ink(on: wash.hex))
                            .overlay(alignment: .leading) { Rectangle().fill(.black.opacity(0.3)).frame(width: 1) }
                        }
                    }
                }
                .font(.system(size: 9))
                .frame(height: 42)
                .clipShape(RoundedRectangle(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(.black.opacity(0.35), lineWidth: 1))
                if card.paints.isEmpty {
                    Text("Leave the paper white").font(.system(size: 9)).italic()
                } else {
                    // The recipe as a bar: one segment per paint, as wide as its part of the mix.
                    PrintBar(parts: card.paints).frame(height: 30)
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(card.paints) { part in
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text("\(part.parts) x \(part.paint.formLabel)").bold().fixedSize()
                                Text("\(Text(part.paint.displayNumber).bold()) \(part.paint.displayName)")
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                            }
                            .font(.system(size: 9))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(hex: part.paint.hex))
                            .foregroundStyle(Color.ink(on: part.paint.hex))
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(.black.opacity(0.35), lineWidth: 1))
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The ratio bar of a card: black outline and dividers, the parts in each segment.
    private struct PrintBar: View {
        let parts: [MixBlock.Part]

        var body: some View {
            GeometryReader { geometry in
                let total = max(parts.reduce(0) { $0 + $1.share }, 0.0001)
                HStack(spacing: 0) {
                    ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                        Text(part.parts)
                            .font(.system(size: 12, weight: .bold))
                            .lineLimit(1)
                            .frame(width: max(6, geometry.size.width * part.share / total), height: geometry.size.height)
                            .background(Color(hex: part.paint.hex))
                            .foregroundStyle(Color.ink(on: part.paint.hex))
                            .overlay(alignment: .leading) { if index > 0 { Rectangle().fill(.black).frame(width: 1) } }
                            .clipped()
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.black, lineWidth: 1))
        }
    }

    /// Layer mode: the finished picture with the list of layers, then one sheet per layer.
    private static func layerPDF(session: Session, library: Library) -> Data {
        guard let plan = session.layers else { return Data() }
        let rows = session.layerRows(paints: library.byID)
        var pages: [AnyView] = []
        func add(_ view: some View) { pages.append(AnyView(view)) }
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
                        ? NumberedPicture.Label(text: "\(region.coats)", x: Double(region.anchorX) + 0.5, y: Double(region.anchorY) + 0.5, room: Double(region.anchorDist), color: Session.inkHex(on: layer.hexes[region.coats]))
                        : nil
                }
            ))
        }
        return render(pages, stamp: stamp(session.imageName))
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
        guard session.settings.numbers != .none, let segmentation = session.segmentation, session.regionEntry.count == segmentation.regions.count else { return [] }
        return segmentation.regions.compactMap { region in
            let index = session.regionEntry[region.id]
            guard session.entries.indices.contains(index) else { return nil }
            return NumberedPicture.Label(
                text: session.entries[index].label,
                x: Double(region.anchorX) + 0.5,
                y: Double(region.anchorY) + 0.5,
                room: Double(region.anchorDist),
                color: session.labelHex(index),
                ink: session.settings.view == .template ? "#ffffff" : nil
            )
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
