import XCTest
@testable import Watercolourlove

/// The link of the QR code on the printed sheet, in the web's format (`src/lib/restoreLink.js`).
final class RestoreLinkTests: XCTestCase {
    private func data(of link: String) throws -> [String: Any] {
        let prefix = RestoreLink.site + "#restore="
        XCTAssertTrue(link.hasPrefix(prefix))
        var code = String(link.dropFirst(prefix.count)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while code.count % 4 != 0 { code += "=" }
        let packed = try XCTUnwrap(Data(base64Encoded: code))
        let json = try (packed as NSData).decompressed(using: .zlib) as Data
        return try XCTUnwrap(JSONSerialization.jsonObject(with: json) as? [String: Any])
    }

    func testCarriesWhatDiffersInTheWebsTerms() throws {
        var settings = AnalysisSettings()
        settings.colours = 24
        settings.simplify = 2
        settings.numbers = .backdrop
        settings.grid = .grey
        let own = Paint(id: "custom-1", vendor: "Daniel Smith", number: "012", name: "Quinacridone Gold", hex: "#d08a2a", forms: ["pan"], source: "custom", custom: true)
        let palette = Palette(paintIDs: ["schmincke-horadam-494", "custom-1"], auto: false)
        let link = try XCTUnwrap(RestoreLink.url(settings: settings, palette: palette, paints: ["custom-1": own, "schmincke-horadam-494": own.with(id: "schmincke-horadam-494", custom: false)]))
        let data = try data(of: link)
        XCTAssertEqual(data["v"] as? Int, 1)
        let s = try XCTUnwrap(data["s"] as? [String: Any])
        XCTAssertEqual(Set(s.keys), ["colours", "simplify", "numbers", "grid"])
        XCTAssertEqual(s["colours"] as? Int, 24)
        // Simplify as the web counts it: the shown 2 is 0 on the web's scale (zero at -2).
        XCTAssertEqual(s["simplify"] as? Int, 2 + Segmenter.simplifyZero)
        XCTAssertEqual(s["numbers"] as? String, "backdrop")
        XCTAssertEqual(s["grid"] as? String, "grey")
        let paints = try XCTUnwrap(data["p"] as? [Any])
        XCTAssertEqual(paints.first as? String, "schmincke-horadam-494")
        XCTAssertEqual(paints.last as? [String], ["Daniel Smith", "012", "Quinacridone Gold", "#d08a2a"])
        XCTAssertNil(data["l"])
        XCTAssertNil(data["o"])
    }

    func testTheDefaultsCarryNothingButTheVersion() throws {
        let data = try data(of: try XCTUnwrap(RestoreLink.url(settings: AnalysisSettings(), palette: Palette(paintIDs: [], auto: true), paints: [:])))
        XCTAssertEqual((data["s"] as? [String: Any])?.count, 0)
        XCTAssertNil(data["p"])
    }
}

private extension Paint {
    func with(id: String, custom: Bool) -> Paint {
        var paint = self
        paint.id = id
        paint.custom = custom
        return paint
    }
}
