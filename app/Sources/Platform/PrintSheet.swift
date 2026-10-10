import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import PDFKit
#else
import UIKit
#endif

/// The printable sheet: the picture, then every colour with its chosen mix, on A4 pages.
@MainActor
enum PrintSheet {
    private static let page = CGSize(width: 595, height: 842) // A4 in points
    private static let margin: CGFloat = 34
    private static let rowHeight: CGFloat = 44
    private static let pictureHeight: CGFloat = 400

    struct Row {
        let number: String
        let recipe: Recipe?
        let share: String
    }

    static func pdf(session: Session, library: Library) -> Data {
        let paints = library.byID
        var rows = session.order.map { index -> Row in
            let entry = session.entries[index]
            let percent = Int((entry.share * 100).rounded())
            return Row(number: entry.label, recipe: entry.recipe, share: percent == 0 ? "<1%" : "\(percent)%")
        }
        let picture = session.printImage()
        let labels = pictureLabels(session)

        let data = NSMutableData()
        var box = CGRect(origin: .zero, size: page)
        guard let consumer = CGDataConsumer(data: data), let context = CGContext(consumer: consumer, mediaBox: &box, nil) else { return Data() }

        let usable = page.height - 2 * margin
        var first = true
        repeat {
            let room = first ? usable - pictureHeight - 60 : usable
            let count = min(rows.count, max(1, Int(room / rowHeight)))
            let pageRows = Array(rows.prefix(count))
            rows.removeFirst(count)
            let view = PageView(
                title: first ? "\(session.imageName) – colours and mixes" : nil,
                picture: first ? picture : nil,
                segmentation: session.segmentation,
                labels: labels,
                rows: pageRows,
                paints: paints
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

    private static func pictureLabels(_ session: Session) -> [NumberedPicture.Label] {
        guard session.settings.numbers, let segmentation = session.segmentation else { return [] }
        return segmentation.regions.compactMap { region in
            let index = session.regionEntry[region.id]
            guard session.entries.indices.contains(index) else { return nil }
            return NumberedPicture.Label(
                text: session.entries[index].label,
                x: Double(region.anchorX) + 0.5,
                y: Double(region.anchorY) + 0.5,
                room: Double(region.anchorDist),
                color: session.settings.view == .original ? .white : Color.ink(on: session.displayHex(session.entries[index]))
            )
        }
    }

    private struct PageView: View {
        let title: String?
        let picture: CGImage?
        let segmentation: Segmentation?
        let labels: [NumberedPicture.Label]
        let rows: [Row]
        let paints: [String: Paint]

        var body: some View {
            VStack(alignment: .leading, spacing: 0) {
                if let title {
                    Text(title).font(.system(size: 15, weight: .semibold)).frame(height: 30, alignment: .top)
                }
                if let picture, let segmentation {
                    NumberedPicture(image: picture, segmentation: segmentation, labels: labels, fontSize: 7)
                        .frame(maxWidth: .infinity, maxHeight: PrintSheet.pictureHeight)
                        .frame(height: PrintSheet.pictureHeight + 30, alignment: .top)
                }
                ForEach(rows, id: \.number) { row in
                    HStack(spacing: 8) {
                        Text(row.number).font(.system(size: 12, weight: .bold)).frame(width: 32, alignment: .trailing)
                        if let recipe = row.recipe {
                            RecipeView(recipe: recipe, paints: paints, wide: true)
                        } else {
                            Spacer()
                        }
                        Text(row.share).font(.system(size: 10)).foregroundStyle(.secondary).frame(width: 30, alignment: .trailing)
                    }
                    .frame(height: PrintSheet.rowHeight)
                }
                Spacer(minLength: 0)
            }
            .padding(PrintSheet.margin)
            .foregroundStyle(.black)
            .background(.white)
        }
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
