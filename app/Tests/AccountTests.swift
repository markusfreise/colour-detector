import XCTest
@testable import Watercolourlove

/// The handoff of a sign-in from the browser sheet, as server/auth.php makes and checks it.
final class AccountTests: XCTestCase {
    /// The value exchangeHandoff in server/auth.php computes for the same secret (run in PHP).
    func testChallengeIsTheBase64urlSHA256OfTheVerifier() {
        XCTAssertEqual(Account.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r-wW1gFWFOEjXk"), "NPsYzawS-__wqk67X9gyb4dr3JBo3hnlEi5MNyD5jX0")
    }

    /// The server accepts 43 characters of base64url and nothing else.
    func testVerifierIsNewEachTimeAnd43Base64urlCharacters() {
        let verifier = Account.makeVerifier()
        XCTAssertEqual(verifier.count, 43)
        XCTAssertNil(verifier.range(of: "[^A-Za-z0-9_-]", options: .regularExpression))
        XCTAssertNotEqual(verifier, Account.makeVerifier())
        XCTAssertEqual(Account.challenge(for: verifier).count, 43)
    }

    func testReadsTheCodeOrTheReasonFromTheWayBack() {
        XCTAssertEqual(Account.handoff(from: URL(string: "de.markusfreise.watercolourlove://signed-in?code=abc123")!), .code("abc123"))
        XCTAssertEqual(Account.handoff(from: URL(string: "de.markusfreise.watercolourlove://signed-in?error=no-email")!), .failure("no-email"))
        XCTAssertEqual(Account.handoff(from: URL(string: "de.markusfreise.watercolourlove://signed-in")!), .failure("failed"))
    }
}
