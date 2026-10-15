import Observation
import StoreKit

/// The one-time purchase that lifts the limits on saved pictures and paint boxes.
@MainActor
@Observable
final class Store {
    static let productID = "de.markusfreise.watercolourlove.pro"
    /// What the free version holds.
    static let freeBoxes = 1
    static let freePictures = 1

    private(set) var unlocked = false
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
            await loadProduct()
            await refresh()
        }
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
        unlocked = owned
    }

    func purchase() async {
        error = nil
        busy = true
        defer { busy = false }
        if product == nil { await loadProduct() }
        guard let product else {
            error = "The App Store is not reachable right now. Please try again later."
            return
        }
        do {
            switch try await product.purchase() {
            case .success(let result):
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    await refresh()
                } else {
                    error = "The purchase could not be verified."
                }
            case .pending:
                error = "The purchase is waiting for approval."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            self.error = "The purchase did not go through: \(error.localizedDescription)"
        }
    }

    func restore() async {
        error = nil
        busy = true
        defer { busy = false }
        do {
            try await AppStore.sync()
            await refresh()
            if !unlocked { error = "No earlier purchase was found for this Apple Account." }
        } catch {
            // The user closed the sign-in sheet: nothing to report.
        }
    }
}
