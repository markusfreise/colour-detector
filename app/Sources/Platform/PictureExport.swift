import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// The picture as it is shown (view, outlines, numbers, layers shown) as a JPG for the share
/// sheet, at the size it is rendered; made when it is actually shared.
struct PictureJPG: Transferable {
    let name: String
    let make: @MainActor @Sendable () -> Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .jpeg) { picture in
            await picture.make()
        }
        .suggestedFileName { "\($0.name).jpg" }
    }

    @MainActor
    static func data(session: Session) -> Data {
        guard let image = session.rendered, let size = session.workingSize else { return Data() }
        let width = CGFloat(image.width)
        let height = CGFloat(image.height)
        // Numbers relative to the picture, as on the screen.
        let view = NumberedPicture(image: image, width: size.width, labels: session.pictureLabels())
            .frame(width: width, height: height)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        guard let picture = renderer.cgImage else { return Data() }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return Data() }
        CGImageDestinationAddImage(destination, picture, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return Data() }
        return data as Data
    }
}
