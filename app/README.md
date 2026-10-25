# Watercolourlove – the native app

The iOS, iPadOS and macOS app of Watercolourlove. SwiftUI, one multiplatform target, no third-party code.

| | |
|---|---|
| Bundle ID | `de.markusfreise.watercolourlove` |
| In-app purchase | `de.markusfreise.watercolourlove.pro` (non-consumable, 4,99 EUR) |
| Minimum system | iOS 17, macOS 14 |
| Project | generated with XcodeGen from `project.yml` |

## Build

```bash
npm run app:data          # in the repo root: paint stock, colour chart and samples -> Resources/Data
cd app
xcodegen generate
open Watercolourlove.xcodeproj
```

Run `npm run app:data` again whenever `src/data/` or the sample photos change.

Tests run on an iOS simulator (`xcodebuild test`, or Cmd-U in Xcode). On macOS the sandboxed test host does not start with ad-hoc signing; with your signing identity in Xcode it does.

## Layout

| Path | Contents |
|---|---|
| `Sources/Core/` | Colour maths, mixing model, segmentation (with its calm areas in `Smooth.swift` and focus boxes in `Details.swift`), Blocking, mix planning and layer mode: ports of `src/lib/*.js`. Change both sides together; the tests in `Tests/` check them against reference values from the web logic (`SegmentationSyncTests` and `BlockingTests` compare the areas pixel for pixel) |
| `Sources/Model/` | `Library` (paints, paint boxes, the palette of the picture), `Session` (the picture being worked on), `PictureCollection` (saved pictures) |
| `Sources/Views/` | SwiftUI screens, laid out as the web app rather than after Apple's guidelines: the picture fills the window, icon buttons at the top left (picture) and top right (panels), the view tools at the top centre (bottom on a phone), panels on floating cards. Tokens and building blocks in `Theme.swift` |
| `Sources/Platform/` | Picture decoding, camera, PDF and printing, the chosen language (`Localization.swift`) |
| `Sources/Store.swift` | StoreKit 2 purchase |
| `Tests/` | The web app's logic tests, in XCTest |
| `Watercolourlove.storekit` | Local purchase for runs from Xcode |
| `AppStore/` | Store texts (`metadata.md`) and screenshots |

Data is stored in Application Support/Watercolourlove: `library.json` (own paints, paint boxes, the palette on screen) and `Collection/<id>/` (photo, thumbnail, settings with the palette of the picture). A paint box exports to a JSON file of the same format as the web app's, and imports from one.

## Languages and look

English and German. Every text is in `Resources/Localizable.xcstrings` (the camera prompt in `InfoPlist.xcstrings`): the key is the English text, German is the translation. Literals in `Text`, `Button`, `Label` and so on are collected by the compiler; texts built as a `String` go through `L("...")` (`Platform/Localization.swift`), with plurals as two keys (`L(count: n, "%lld coat", "%lld coats")`). The colour logic in `Sources/Core/` stays English, because its tests compare it with the web; `Views/Words.swift` turns its words (dilution, match, consistency, the wash recipe) into the chosen language. In German the paints show their German chart name (`Paint.displayName`).

The person button at the bottom of the left column opens Preferences, as on the web: language (Automatic, English, Deutsch) and look (Automatic, Light, Dark), kept in UserDefaults. Both switch at once, without a restart: `Localization.apply` points `Bundle.main` at the chosen `.lproj`, the screen is drawn again (`.id(language)`), and the open cards stay open (`@SceneStorage`).

A new text: write it in English in the code, build once, then add its German in `Localizable.xcstrings` (Xcode shows it as new).

## Free and paid

Free: one saved picture and the paint boxes the app starts with. The purchase lifts the picture limit (`Store.freePictures`) and adds what the web app's `server/plans.json` lists under `native.locked`: new and imported paint boxes, the catalogues of the paint libraries (`Resources/Data/libraries.json`), close-ups, the Blocking view and Simplify below 0. Everything else is free, Monochrome included. The web's picture credits and Starter box belong to its accounts; the app has none of them.

## Account (optional)

Preferences > Account and the purchase screen offer to sign in to the account of watercolourlove.de, with Apple (in the app, `SignInWithAppleButton`) or Google (the web's sign-in in a browser sheet, `WebAuthenticationSession`). An account with a plan or licence of the web unlocks the full version as if bought here (`Store.accountPro`, App Review guideline 3.1.3(b)); the app does not name or link the web's prices. Signing in is never needed: without it the app works as before, and pictures never leave the device either way. The account sheet also asks for the web's two statements (privacy policy and terms; pictures stay on the device), signs out and deletes the account (Apple's rule for apps with sign-up). The session is a token in the keychain; the last known account is kept in UserDefaults, so that a web plan still counts offline. How the server side works: `server/README.md`, "The native app". The buttons appear only for the ways the server has keys for (`appProviders` in `GET me`).

## Screenshots

Debug builds accept launch arguments: `-screen paintbox|addcolour|collection|editor|breakdown|samples|settings|colours|paywall|preferences` opens that screen, `-language de` and `-theme dark` set the preferences for that launch, `-switch de,theme:dark,en,auto` changes them while the app runs, one step every 4 seconds (with `-snapshot` on the Mac a PNG after each step), `-view mixed|target|overlay|original|template|blocking` sets what the picture shows, `-pro` acts as if the full version were bought, `-hints` turns Help on, `-grid white|grey|black` draws the grid, `-backdrop` puts the numbers on squares, `-large` makes them large, `-monochrome` switches to Monochrome, `-sample` steps to the next sample photo, `-auto` switches the paint box to Auto, `-geometric` switches to geometric areas, `-layer` switches to layer mode (`-step n` opens that step of the walk, `-stepview paint|wash|result` sets its picture, `-spot` selects the middle of the picture). On the Mac, `-snapshot` also writes every window as a PNG into the app's temporary folder; `-pdf` writes the printed sheet there as `sheet.pdf` (on the Mac and in the simulator).

```bash
xcrun simctl launch <device> de.markusfreise.watercolourlove -screen editor
xcrun simctl io <device> screenshot AppStore/screenshots/iphone-2-editor.png
```

## Printed sheet

`Platform/PrintSheet.swift` draws the sheet as the web prints it. Every page has the picture's name, date and time at its foot and its number of all; the first page of the colours has a QR code with a link to the website that restores the settings and paints (`Model/RestoreLink.swift`, the web's format of `src/lib/restoreLink.js`: the settings in the web's terms, raw deflate, base64url). The photo is not in it.

## Website

The app's pages are part of the web app: `public/app/` (overview, support, privacy) at https://watercolourlove.de/app/, with the web's imprint. These are the URLs in `metadata.md`. They go online with every deploy of the web app.

## TestFlight and release

```bash
scripts/release.sh               # archive iOS and macOS, upload both to App Store Connect
scripts/release.sh --export-only # the same, signed packages in build/release/ without uploading
```

Signing is automatic: Xcode must be signed in to the team account (Xcode > Settings > Accounts); the distribution certificate and profiles are made in the cloud. The build number is the number of commits, the version is `MARKETING_VERSION` in `project.yml`. The app sends nothing anywhere unless the user signs in to the optional account: then the e-mail address, linked to the user, for app functionality, no tracking (`Resources/PrivacyInfo.xcprivacy`; on the Mac the network entitlement). That is the App Privacy answer in App Store Connect.

### Once, before the first upload

1. App Store Connect: create the app (iOS and macOS, bundle ID `de.markusfreise.watercolourlove`, SKU `watercolourlove`), then the in-app purchase `de.markusfreise.watercolourlove.pro` (non-consumable), with the texts from `AppStore/metadata.md`.
2. App Privacy: Contact Info > Email Address, linked to the user, used for App Functionality, not for tracking. Age rating questionnaire: all "None". The App ID needs the capability Sign in with Apple (the entitlements ask for it; automatic signing adds it).
3. TestFlight: internal testers need nothing more. For external testers fill in the beta description, feedback address `support@markus-freise.de` and the privacy URL; the first external build goes to Beta App Review.
4. Run `scripts/release.sh`. Builds show up in TestFlight after Apple's processing, usually within half an hour.
