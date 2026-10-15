# Tintmap – the native app

The iOS, iPadOS and macOS app of Watercolourlove. SwiftUI, one multiplatform target, no third-party code.

| | |
|---|---|
| Bundle ID | `de.markusfreise.tintmap` |
| In-app purchase | `de.markusfreise.tintmap.pro` (non-consumable, 4,99 EUR) |
| Minimum system | iOS 17, macOS 14 |
| Project | generated with XcodeGen from `project.yml` |

## Build

```bash
npm run app:data          # in the repo root: paint stock, colour chart and samples -> Resources/Data
cd app
xcodegen generate
open Tintmap.xcodeproj
```

Run `npm run app:data` again whenever `src/data/` or the sample photos change.

Tests run on an iOS simulator (`xcodebuild test`, or Cmd-U in Xcode). On macOS the sandboxed test host does not start with ad-hoc signing; with your signing identity in Xcode it does.

## Layout

| Path | Contents |
|---|---|
| `Sources/Core/` | Colour maths, mixing model, segmentation, mix planning and layer mode: ports of `src/lib/*.js`. Change both sides together; `Tests/CoreTests.swift` and `Tests/LayerTests.swift` check them against reference values from the web logic |
| `Sources/Model/` | `Library` (paints and paint boxes), `Session` (the picture being worked on), `PictureCollection` (saved pictures) |
| `Sources/Views/` | SwiftUI screens, laid out as the web app rather than after Apple's guidelines: the picture fills the window, icon buttons at the top left (picture) and top right (panels), the view tools at the top centre (bottom on a phone), panels on floating cards. Tokens and building blocks in `Theme.swift` |
| `Sources/Platform/` | Picture decoding, camera, PDF and printing |
| `Sources/Store.swift` | StoreKit 2 purchase |
| `Tests/` | The web app's logic tests, in XCTest |
| `Tintmap.storekit` | Local purchase for runs from Xcode |
| `AppStore/` | Store texts (`metadata.md`) and screenshots |

Data is stored in Application Support/Tintmap: `library.json` (own paints, paint boxes) and `Collection/<id>/` (photo, thumbnail, settings).

## Free and paid

Free: one saved picture, one paint box. The purchase lifts both limits (`Store.freePictures`, `Store.freeBoxes`). Everything else is free.

## Screenshots

Debug builds accept launch arguments: `-screen paintbox|collection|editor|breakdown|samples|settings|colours|paywall` opens that screen, `-view mixed|target|overlay|original|template` sets what the picture shows, `-sample` steps to the next sample photo, `-auto` switches the paint box to Auto, `-geometric` switches to geometric areas, `-layer` switches to layer mode (`-step n` opens that step of the walk, `-stepview paint|wash|result` sets its picture, `-spot` selects the middle of the picture). On the Mac, `-snapshot` also writes every window as a PNG into the app's temporary folder, and `-pdf` the printed sheet as `sheet.pdf`.

```bash
xcrun simctl launch <device> de.markusfreise.tintmap -screen editor
xcrun simctl io <device> screenshot AppStore/screenshots/iphone-2-editor.png
```

## Website

`AppStore/site/` is the app's page with support, privacy and imprint, at https://tintmap.markus-freise.de (Mittwald, `~/html/_sites/tintmap`). These are the URLs in `metadata.md`. To publish a change:

```bash
rsync -az --delete -e "ssh -i ~/.ssh/mittwald -o IdentitiesOnly=yes" AppStore/site/ p236891@p236891.mittwaldserver.info:html/_sites/tintmap/
```

## TestFlight and release

```bash
scripts/release.sh               # archive iOS and macOS, upload both to App Store Connect
scripts/release.sh --export-only # the same, signed packages in build/release/ without uploading
```

Signing is automatic: Xcode must be signed in to the team account (Xcode > Settings > Accounts); the distribution certificate and profiles are made in the cloud. The build number is the number of commits, the version is `MARKETING_VERSION` in `project.yml`. The app sends nothing anywhere (`Resources/PrivacyInfo.xcprivacy`, no network entitlement), so the App Privacy answer in App Store Connect is "Data Not Collected".

### Once, before the first upload

1. App Store Connect: create the app (iOS and macOS, bundle ID `de.markusfreise.tintmap`, SKU `tintmap`), then the in-app purchase `de.markusfreise.tintmap.pro` (non-consumable), with the texts from `AppStore/metadata.md`.
2. App Privacy: "Data Not Collected". Age rating questionnaire: all "None".
3. TestFlight: internal testers need nothing more. For external testers fill in the beta description, feedback address `support@markus-freise.de` and the privacy URL; the first external build goes to Beta App Review.
4. Run `scripts/release.sh`. Builds show up in TestFlight after Apple's processing, usually within half an hour.
