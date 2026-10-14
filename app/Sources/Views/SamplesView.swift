import SwiftUI

/// The sample pictures to choose from, as in the web app's sample library.
struct SamplesView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var thumbnails: [Int: CGImage] = [:]

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(Array(Session.samples.enumerated()), id: \.offset) { index, sample in
                        Button {
                            session.loadSample(index)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                thumbnail(index)
                                Text(sample.name.replacingOccurrences(of: " (sample)", with: ""))
                                    .font(.subheadline)
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Open \(sample.name)")
                    }
                }
                .padding()
                Text("Sample images © Markus Freise. For personal use only, not for commercial use.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding([.horizontal, .bottom])
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Samples")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() } }
            }
            .task { await loadThumbnails() }
        }
    }

    private func thumbnail(_ index: Int) -> some View {
        Color.secondary.opacity(0.12)
            .aspectRatio(4 / 3, contentMode: .fit)
            .overlay {
                if let image = thumbnails[index] {
                    Image(decorative: image, scale: 1).resizable().scaledToFill()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func loadThumbnails() async {
        for (index, sample) in Session.samples.enumerated() where thumbnails[index] == nil {
            guard let url = Bundle.main.url(forResource: sample.file, withExtension: "webp") else { continue }
            let image = await Task.detached(priority: .userInitiated) {
                (try? Data(contentsOf: url)).flatMap { Pictures.decode($0, maxSide: 480) }
            }.value
            thumbnails[index] = image
        }
    }
}
