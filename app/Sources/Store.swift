import Observation
import StoreKit

/// The one-time purchase that lifts the limit on saved pictures and adds paint boxes of one's own.
@MainActor
@Observable
final class Store {
    static let productID = "de.markusfreise.watercolourlove.pro"
    /// What the free version holds.
    static let freePictures = 1

    /// The full version: bought, or switched on or off in the debug menu of a test build.
    var unlocked: Bool { testing ? debugPro ?? owned : owned }
    /// Bought, as the verified transactions say.
    private var owned = false
    /// A build for testing (Xcode or TestFlight): it shows the debug menu.
    private(set) var testing = false
    /// The debug menu's choice: nil follows the purchase. Kept across launches.
    var debugPro: Bool? = Store.readDebugPro() {
        didSet { UserDefaults.standard.set(debugPro.map { $0 ? "on" : "off" }, forKey: Self.debugProKey) }
    }
    private static let debugProKey = "debugPro"
    private static func readDebugPro() -> Bool? {
        switch UserDefaults.standard.string(forKey: debugProKey) {
        case "on": true
        case "off": false
        default: nil
        }
    }
    /// The purchase state has been read once: before that `unlocked` is not known yet.
    private(set) var checked = false
    private(set) var price: String?
    private(set) var error: String?
    private(set) var busy = false

    @ObservationIgnored private var product: Product?
    @ObservationIgnored private var updates: Task<Void, Never>?

    init() {
        // Purchases made elsewhere (another device, Ask to Buy, refunds) arrive here.
        updates = Task { [weak self] in
            for await _ in Transaction.updates {
                await self?.refresh()
            }
        }
        Task {
            await findTesting()
            await loadProduct()
            await refresh()
        }
    }

    /// Xcode and TestFlight builds are test builds; one from the App Store is not.
    private func findTesting() async {
        #if DEBUG
        testing = true
        #else
        if case .verified(let transaction) = try? await AppTransaction.shared {
            testing = transaction.environment != .production
        }
        #endif
    }

    private func loadProduct() async {
        do {
            product = try await Product.products(for: [Self.productID]).first
            price = product?.displayPrice
        } catch {
            // Offline: the price stays unknown, an existing purchase still counts.
        }
    }

    /// Reads the purchase state from the device's verified transactions.
    func refresh() async {
        var owned = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productID == Self.productID,
               transaction.revocationDate == nil {
                owned = true
            }
        }
        #if DEBUG
        // "-pro" at launch: the full version, for screenshots and checks.
        if ProcessInfo.processInfo.arguments.contains("-pro") { owned = true }
        #endif
        self.owned = owned
        checked = true
    }

    func purchase() async {
        error = nil
        busy = true
        defer { busy = false }
        if product == nil { await loadProduct() }
        guard let product else {
            error = L("The App Store is not reachable right now. Please try again later.")
            return
        }
        do {
            switch try await product.purchase() {
            case .success(let result):
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    await refresh()
                } else {
                    error = L("The purchase could not be verified.")
                }
            case .pending:
                error = L("The purchase is waiting for approval.")
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            self.error = L("The purchase did not go through: %@", error.localizedDescription)
        }
    }

    func restore() async {
        error = nil
        busy = true
        defer { busy = false }
        do {
            try await AppStore.sync()
            await refresh()
            if !unlocked { error = L("No earlier purchase was found for this Apple Account.") }
        } catch {
            // The user closed the sign-in sheet: nothing to report.
        }
    }
}
