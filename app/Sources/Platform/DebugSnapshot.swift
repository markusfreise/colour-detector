#if DEBUG && os(macOS)
import AppKit

/// Writes every window of the app as a PNG into the temporary folder: "-snapshot" at launch, for checking layouts.
@MainActor
enum DebugSnapshot {
    static func writeAll() {
        for (index, window) in NSApp.windows.enumerated() where window.isVisible {
            // The frame view includes title bar and toolbar.
            guard let view = window.contentView?.superview ?? window.contentView,
                  let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { continue }
            view.cacheDisplay(in: view.bounds, to: bitmap)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("snapshot-\(index).png")
            try? bitmap.representation(using: .png, properties: [:])?.write(to: url)
            print("snapshot", url.path)
        }
    }
}
#endif
