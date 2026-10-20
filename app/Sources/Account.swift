import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import Security
import SwiftUI

/// The account of the web app, optional here: signing in with Apple or Google brings a plan or
/// licence bought on watercolourlove.de into the app. Pictures, paint boxes and the collection stay
/// on the device either way; the account is an e-mail address and what was paid for.
@MainActor
@Observable
final class Account {
    nonisolated static let api = URL(string: "https://watercolourlove.de/api/")!
    /// Where a sign-in in the browser sheet comes back to: the bundle ID (APP_SCHEME in server/auth.php).
    nonisolated static let scheme = "de.markusfreise.watercolourlove"

    /// What the server tells about an account (describeUser in server/lib.php).
    struct User: Codable, Equatable {
        let email: String
        let pro: Bool
        let plan: String?
        let until: Int?
        let consent: Bool
    }

    private(set) var user: User? {
        didSet { Self.cache(user) }
    }
    /// The ways the server offers to the app, in its order: "apple", "google", "meta".
    private(set) var providers: [String] = []
    private(set) var busy = false
    var error: String?
    /// The server has been asked once, and whether it answered.
    private(set) var asked = false
    private(set) var reached = false

    /// A plan or licence from the web: the full version, as if bought here.
    var pro: Bool { user?.pro ?? false }

    @ObservationIgnored private var token: String? = Keychain.read()

    init() {
        // The last known state, so that a web plan still counts offline.
        user = token == nil ? nil : Self.cached()
        Task { await refresh() }
    }

    // MARK: - Asking the server

    /// The account and the ways to sign in. Offline the last known state stays.
    func refresh() async {
        struct Me: Decodable {
            let user: User?
            let appProviders: [String]?
        }
        let answer: Me? = try? await request("GET", "me")
        asked = true
        reached = answer != nil
        guard let me = answer else { return }
        providers = me.appProviders ?? []
        // A session the server no longer knows (signed out elsewhere, deleted, expired).
        if me.user == nil, token != nil { forget() }
        user = me.user
    }

    /// Sign in with Apple, from SignInWithAppleButton: the server redeems Apple's code.
    func signInWithApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) else {
                error = L("Apple did not confirm the sign-in. Please try again.")
                return
            }
            await signIn("auth/apple/native", ["code": code])
        case .failure(let failure):
            // Closing Apple's sheet is no error.
            if (failure as? ASAuthorizationError)?.code != .canceled {
                error = L("Signing in did not work: %@", failure.localizedDescription)
            }
        }
    }

    /// Google (or another provider of the web) in a browser sheet. The server sends the browser back
    /// to the app with a code, which is good only together with the secret made here.
    func signInInBrowser(_ provider: String, using session: WebAuthenticationSession) async {
        error = nil
        let verifier = Self.makeVerifier()
        var start = URLComponents(url: Self.api.appending(path: "auth/\(provider)/start"), resolvingAgainstBaseURL: false)!
        start.queryItems = [URLQueryItem(name: "app", value: Self.challenge(for: verifier))]
        let back: URL
        do {
            back = try await session.authenticate(using: start.url!, callbackURLScheme: Self.scheme, preferredBrowserSession: .ephemeral)
        } catch {
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                self.error = L("Signing in did not work: %@", error.localizedDescription)
            }
            return
        }
        switch Self.handoff(from: back) {
        case .code(let code):
            await signIn("auth/app/exchange", ["code": code, "verifier": verifier])
        case .failure(let reason):
            error = reason == "no-email"
                ? L("The provider did not share an e-mail address. Please allow it, or sign in another way.")
                : L("Signing in did not work. Please try again.")
        }
    }

    /// The two statements the web asks for, once per account and version of the privacy text.
    func agree() async {
        struct Answer: Decodable { let user: User }
        if let answer: Answer = await run({ try await self.request("POST", "consent", ["privacy": true, "local": true]) }) {
            user = answer.user
        }
    }

    func signOut() async {
        struct Done: Decodable {}
        let _: Done? = try? await request("POST", "logout", [:])
        forget()
    }

    /// The account and everything stored with it, on the server. A subscription bought on the web
    /// ends with it; what is on this device stays.
    func delete() async {
        struct Done: Decodable {}
        if let _: Done = await run({ try await self.request("POST", "delete", [:]) }) {
            forget()
        }
    }

    private func signIn(_ route: String, _ body: [String: Any]) async {
        struct Session: Decodable {
            let token: String
            let user: User
        }
        if let session: Session = await run({ try await self.request("POST", route, body) }) {
            token = session.token
            Keychain.write(session.token)
            user = session.user
        }
    }

    private func forget() {
        token = nil
        Keychain.write(nil)
        user = nil
    }

    /// Runs a request with the busy state and the error shown to the user.
    private func run<T>(_ work: @escaping () async throws -> T) async -> T? {
        error = nil
        busy = true
        defer { busy = false }
        do {
            return try await work()
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    private struct Failure: LocalizedError {
        let errorDescription: String?
    }

    private func request<T: Decodable>(_ method: String, _ route: String, _ body: [String: Any]? = nil) async throws -> T {
        var request = URLRequest(url: Self.api.appending(path: route))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            // The server's own words (fail() in server/lib.php), else a general one.
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            if status == 401, route != "auth/app/exchange", route != "auth/apple/native" { forget() }
            throw Failure(errorDescription: message ?? L("The server is not reachable right now. Please try again later."))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - The handoff from the browser (pure, for the tests)

    enum Handoff: Equatable {
        case code(String)
        case failure(String)
    }

    /// A random secret, 32 bytes as base64url (43 characters).
    nonisolated static func makeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return base64url(Data(bytes))
    }

    /// What the server keeps of the secret: its SHA-256 as base64url (exchangeHandoff in server/auth.php).
    nonisolated static func challenge(for verifier: String) -> String {
        base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    /// The address the server sends the browser back to: `<scheme>://signed-in?code=...` or `?error=...`.
    nonisolated static func handoff(from url: URL) -> Handoff {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty {
            return .code(code)
        }
        return .failure(items.first(where: { $0.name == "error" })?.value ?? "failed")
    }

    nonisolated private static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // MARK: - Kept on the device

    private static let userKey = "accountUser"

    private static func cache(_ user: User?) {
        UserDefaults.standard.set(user.flatMap { try? JSONEncoder().encode($0) }, forKey: userKey)
    }

    private static func cached() -> User? {
        UserDefaults.standard.data(forKey: userKey).flatMap { try? JSONDecoder().decode(User.self, from: $0) }
    }
}

/// The session token in the keychain, on this device only.
private enum Keychain {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: Account.scheme,
        kSecAttrAccount as String: "session",
    ]

    static func read() -> String? {
        var found: AnyObject?
        var search = query
        search[kSecReturnData as String] = true
        guard SecItemCopyMatching(search as CFDictionary, &found) == errSecSuccess, let data = found as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ token: String?) {
        SecItemDelete(query as CFDictionary)
        guard let token else { return }
        var item = query
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }
}
