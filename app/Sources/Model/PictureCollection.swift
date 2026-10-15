import CoreGraphics
import Foundation
import Observation

struct SavedPicture: Codable, Identifiable {
    var id: String
    var name: String
    var updatedAt: Date
    var settings: AnalysisSettings
    var edits: [EntryEdit]
}

/// Pictures the user saved, each in its own folder: the photo, a thumbnail and the settings.
@MainActor
@Observable
final class PictureCollection {
    private(set) var items: [SavedPicture] = []
    @ObservationIgnored private var thumbnails: [String: CGImage] = [:]
    @ObservationIgnored private let root = Storage.directory.appendingPathComponent("Collection", isDirectory: true)

    init() {
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let folders = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        items = folders
            .compactMap { try? Data(contentsOf: $0.appendingPathComponent("meta.json")) }
            .compactMap { try? JSONDecoder().decode(SavedPicture.self, from: $0) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    private func folder(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }

    func thumbnail(for id: String) -> CGImage? {
        if let cached = thumbnails[id] { return cached }
        guard let data = try? Data(contentsOf: folder(id).appendingPathComponent("thumb.jpg")),
              let image = Pictures.decode(data, maxSide: 480) else { return nil }
        thumbnails[id] = image
        return image
    }

    /// Saves the session's picture with its settings and colour changes; updates it when it is already saved.
    func save(_ session: Session) throws {
        guard let image = session.image else { return }
        let id = session.savedID ?? "img-\(UUID().uuidString.prefix(8))"
        let folder = folder(id)
        if session.savedID == nil {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            guard let photo = Pictures.jpeg(image, quality: 0.9),
                  let small = Pictures.scaled(image, maxSide: 480).flatMap({ Pictures.jpeg($0, quality: 0.8) }) else {
                throw CocoaError(.fileWriteUnknown)
            }
            try photo.write(to: folder.appendingPathComponent("image.jpg"), options: .atomic)
            try small.write(to: folder.appendingPathComponent("thumb.jpg"), options: .atomic)
        }
        let record = SavedPicture(id: id, name: session.imageName, updatedAt: Date(), settings: session.settings, edits: session.exportEdits())
        try write(record)
        session.savedID = id
    }

    func open(_ id: String, in session: Session) {
        guard let record = items.first(where: { $0.id == id }),
              let data = try? Data(contentsOf: folder(id).appendingPathComponent("image.jpg")),
              session.load(data, name: record.name, settings: record.settings, edits: record.edits) else {
            session.error = L("Could not open the saved picture.")
            return
        }
        session.savedID = id
    }

    func rename(_ id: String, to name: String, session: Session) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, var record = items.first(where: { $0.id == id }) else { return }
        record.name = trimmed
        try? write(record)
        if session.savedID == id { session.imageName = trimmed }
    }

    func delete(_ id: String, session: Session) {
        try? FileManager.default.removeItem(at: folder(id))
        items.removeAll { $0.id == id }
        thumbnails[id] = nil
        if session.savedID == id { session.savedID = nil }
    }

    private func write(_ record: SavedPicture) throws {
        try JSONEncoder().encode(record).write(to: folder(record.id).appendingPathComponent("meta.json"), options: .atomic)
        items.removeAll { $0.id == record.id }
        items.insert(record, at: 0)
    }
}
