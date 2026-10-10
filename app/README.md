# Tintmap – the native app

The iOS, iPadOS and macOS app of Colour Detector. SwiftUI, one multiplatform target, no third-party code.

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
| `Sources/Core/` | Colour maths, mixing model and segmentation: ports of `src/lib/*.js`. Change both sides together |
| `Sources/Model/` | `Library` (paints and paint boxes), `Session` (the picture being worked on), `PictureCollection` (saved pictures) |
| `Sources/Views/` | SwiftUI screens |
| `Sources/Platform/` | Picture decoding, camera, PDF and printing |
| `Sources/Store.swift` | StoreKit 2 purchase |
| `Tests/` | The web app's logic tests, in XCTest |
| `Tintmap.storekit` | Local purchase for runs from Xcode |
| `AppStore/` | Store texts (`metadata.md`) and screenshots |

Data is stored in Application Support/Tintmap: `library.json` (own paints, paint boxes) and `Collection/<id>/` (photo, thumbnail, settings).

## Free and paid

Free: one saved picture, one paint box. The purchase lifts both limits (`Store.freePictures`, `Store.freeBoxes`). Everything else is free.

## Screenshots

Debug builds accept launch arguments: `-screen paintbox|collection|editor|paywall` opens that screen, `-landscape` starts with the landscape sample.

```bash
xcrun simctl launch <device> de.markusfreise.tintmap -landscape -screen editor
xcrun simctl io <device> screenshot AppStore/screenshots/iphone-2-editor.png
```

## Before the first upload

1. App Store Connect: create the app with the bundle ID above, then the in-app purchase with the product ID above, and enter the texts from `AppStore/metadata.md`.
2. Put the support and privacy pages online (URLs in `metadata.md`).
3. Replace the temporary icon in `Resources/Assets.xcassets/AppIcon.appiconset`.
4. Archive in Xcode for iOS and for macOS, upload both, submit together with the purchase.
