import XCTest
@testable import Watercolourlove

/// Saved settings as the web app's analysis store reads them (savedSettings, the defaults).
final class SettingsTests: XCTestCase {
    private func decode(_ json: String) throws -> AnalysisSettings {
        try JSONDecoder().decode(AnalysisSettings.self, from: Data(json.utf8))
    }

    func testDefaults() {
        let settings = AnalysisSettings()
        XCTAssertEqual(settings.numbers, .plain)
        XCTAssertEqual(settings.numberSize, .normal)
        XCTAssertNil(settings.grid)
        XCTAssertEqual(settings.gridColumns, 8)
        XCTAssertEqual(settings.details, 5)
    }

    func testOlderPicturesLackTheNewerSettings() throws {
        let settings = try decode(#"{"colours": 12, "numbers": false}"#)
        XCTAssertEqual(settings.colours, 12)
        XCTAssertEqual(settings.numbers, NumberStyle.none)
        XCTAssertEqual(settings.numberSize, .normal)
        XCTAssertNil(settings.grid)
        XCTAssertEqual(settings.gridColumns, 8)
    }

    func testNumbersAreSavedAsTheWebSavesThem() throws {
        for (style, json) in [(NumberStyle.none, "false"), (.plain, "true"), (.backdrop, #""backdrop""#)] {
            var settings = AnalysisSettings()
            settings.numbers = style
            let saved = String(decoding: try JSONEncoder().encode(settings), as: UTF8.self)
            XCTAssertTrue(saved.contains(#""numbers":\#(json)"#), saved)
            XCTAssertEqual(try decode(saved).numbers, style)
        }
    }

    func testNumbersButtonCycles() {
        XCTAssertEqual(NumberStyle.none.next, .plain)
        XCTAssertEqual(NumberStyle.plain.next, .backdrop)
        XCTAssertEqual(NumberStyle.backdrop.next, NumberStyle.none)
    }

    func testGridButtonCyclesThroughNoneWhiteGreyBlack() {
        var grid: GridColour? = nil
        var seen: [String] = []
        for _ in 0..<4 {
            grid = GridColour.next(after: grid)
            seen.append(grid?.rawValue ?? "none")
        }
        XCTAssertEqual(seen, ["white", "grey", "black", "none"])
        XCTAssertEqual(try decode(#"{"grid": "grey", "gridColumns": 12}"#).grid, .grey)
        XCTAssertEqual(try decode(#"{"grid": "grey", "gridColumns": 12}"#).gridColumns, 12)
    }

    /// Pictures saved before 2026-10-18 have `variety`, the Details slider the other way round.
    func testOldVarietyBecomesDetails() throws {
        XCTAssertEqual(try decode(#"{"variety": 2}"#).details, 8)
        XCTAssertEqual(try decode(#"{"variety": 2, "details": 3}"#).details, 3)
        XCTAssertEqual(try decode(#"{"details": 9}"#).variety, 1)
    }
}
