import AuthenticationServices
import SwiftUI

/// The account of watercolourlove.de, as a sheet: signing in with Apple or Google, the two
/// statements of the web's sign-in, and signing out or deleting the account.
struct AccountView: View {
    @Environment(Account.self) private var account
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @State private var privacy = false
    @State private var local = false
    @State private var confirmingDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Account").font(Theme.title)
            if let user = account.user {
                if user.consent {
                    signedIn(user)
                } else {
                    statements(user)
                }
            } else {
                signIn
            }
            if let error = account.error {
                Text(error).foregroundStyle(.red)
            }
            Divider()
            HStack {
                Spacer()
                Button("Close") { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .foregroundStyle(Theme.copy)
        .disabled(account.busy)
        .presentationDetents([.medium, .large])
        .task { await account.refresh() }
        #if os(macOS)
        .frame(width: 440)
        #endif
    }

    // MARK: - Signed out

    @ViewBuilder private var signIn: some View {
        Text("Have an account on watercolourlove.de? Sign in to use your full version here as well. Your pictures, paint boxes and collection stay on this device.")
            .foregroundStyle(Theme.copyLight)
            .fixedSize(horizontal: false, vertical: true)
        if !account.asked {
            ProgressView().frame(maxWidth: .infinity)
        } else if account.providers.isEmpty {
            Text(account.reached ? L("Signing in is not available right now.") : L("The server is not reachable right now. Please try again later."))
                .foregroundStyle(Theme.copyLight)
        }
        VStack(spacing: 10) {
            if account.providers.contains("apple") {
                SignInWithAppleButton(.continue) { request in
                    request.requestedScopes = [.email]
                } onCompletion: { result in
                    Task { await account.signInWithApple(result) }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 44)
            }
            ForEach(account.providers.filter { $0 != "apple" }, id: \.self) { provider in
                Button {
                    Task { await account.signInInBrowser(provider, using: webAuthenticationSession) }
                } label: {
                    HStack(spacing: 8) {
                        if provider == "google" {
                            Image("mark.google").resizable().frame(width: 18, height: 18)
                        }
                        Text(L("Continue with %@", provider == "google" ? "Google" : "Facebook"))
                            .font(.system(size: 17, weight: .medium))
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundStyle(Theme.copy)
                    .background(Theme.raised)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSmall))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall).strokeBorder(Theme.border))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - The two statements, once per account

    @ViewBuilder private func statements(_ user: Account.User) -> some View {
        Text(L("Signed in as %@. Before you go on:", user.email))
        Toggle(isOn: $privacy) {
            Text("I have read the [privacy policy](\(legal("privacy"))) and the [terms](\(legal("terms"))) and agree to them.")
        }
        .toggleStyle(.box)
        Toggle(isOn: $local) {
            Text("I understand that my pictures, paint boxes and collection are stored only in this app on this device and not in the cloud. They are not part of my account.")
                .fixedSize(horizontal: false, vertical: true)
        }
        .toggleStyle(.box)
        HStack {
            Button("Continue") { Task { await account.agree() } }
                .buttonStyle(.borderedProminent)
                .disabled(!privacy || !local)
            Button("Sign out") { Task { await account.signOut() } }
        }
    }

    // MARK: - Signed in

    @ViewBuilder private func signedIn(_ user: Account.User) -> some View {
        Text(L("Signed in as %@.", user.email))
        Text(user.pro ? L("Your account unlocks the full version on this device.") : L("This account has no full version."))
            .foregroundStyle(Theme.copyLight)
        HStack {
            Button("Sign out") { Task { await account.signOut() } }
            Spacer()
            Button("Delete account", role: .destructive) { confirmingDelete = true }
        }
        .confirmationDialog("Delete your account?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) { Task { await account.delete() } }
        } message: {
            Text("Your account and everything stored with it on the server are deleted, and a subscription ends. Pictures, paint boxes and the collection on this device stay.")
        }
    }

    /// The legal pages of the web, in the language of the app.
    private func legal(_ page: String) -> String {
        let german = Localization.current == "de"
        let path = switch page {
        case "privacy": german ? "de/datenschutz/" : "privacy/"
        default: german ? "de/agb/" : "terms/"
        }
        return "https://watercolourlove.de/" + path
    }
}

/// The web's checkboxes: the Mac's own; iOS has none, so a box to tap beside the text, whose
/// links stay links.
private struct BoxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        #if os(macOS)
        Toggle(configuration).toggleStyle(.checkbox)
        #else
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Button { configuration.isOn.toggle() } label: {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .foregroundStyle(configuration.isOn ? Theme.corporate : Theme.copyLight)
                    .imageScale(.large)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(configuration.isOn ? .isSelected : [])
            configuration.label
                .multilineTextAlignment(.leading)
        }
        #endif
    }
}

private extension ToggleStyle where Self == BoxStyle {
    static var box: BoxStyle { BoxStyle() }
}
