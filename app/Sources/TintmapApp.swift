import SwiftUI

@main
struct TintmapApp: App {
    @State private var library: Library
    @State private var session: Session
    @State private var collection = PictureCollection()
    @State private var store = Store()

    init() {
        let library = Library()
        _library = State(initialValue: library)
        _session = State(initialValue: Session(library: library))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(library)
                .environment(session)
                .environment(collection)
                .environment(store)
                #if os(macOS)
                .frame(minWidth: 940, minHeight: 600)
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 1280, height: 860)
        #endif
    }
}
