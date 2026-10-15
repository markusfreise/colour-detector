#!/usr/bin/env bash
# Archives Tintmap for iOS and macOS and uploads both to App Store Connect (TestFlight).
# Usage: scripts/release.sh [--export-only]
#   --export-only  builds the signed packages into build/release/ without uploading them.
# Signing is automatic: Xcode needs to be signed in to the team's Apple account
# (Xcode > Settings > Accounts). The build number is the number of commits, so it rises with
# every release and the same commit always gets the same number.
set -euo pipefail

cd "$(dirname "$0")/.."
DESTINATION=upload
[ "${1:-}" = "--export-only" ] && DESTINATION=export
BUILD="$(git rev-list --count HEAD)"
OUT=build/release
VERSION="$(sed -n 's/^ *MARKETING_VERSION: "\(.*\)"/\1/p' project.yml)"

[ -z "$(git status --porcelain -- . ../src/data)" ] || { echo "Uncommitted changes in app/ or src/data: commit first." >&2; exit 1; }

(cd .. && npm run app:data >/dev/null)
xcodegen generate --quiet
rm -rf "$OUT"
mkdir -p "$OUT"
cat > "$OUT/export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>$DESTINATION</string>
<key>teamID</key><string>752F6BF2SD</string>
<key>signingStyle</key><string>automatic</string>
<key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

for platform in iOS macOS; do
  echo "== $platform $VERSION ($BUILD)"
  xcodebuild -project Tintmap.xcodeproj -scheme Tintmap -configuration Release \
    -destination "generic/platform=$platform" -archivePath "$OUT/Tintmap-$platform.xcarchive" \
    CURRENT_PROJECT_VERSION="$BUILD" -allowProvisioningUpdates archive -quiet
  xcodebuild -exportArchive -archivePath "$OUT/Tintmap-$platform.xcarchive" \
    -exportOptionsPlist "$OUT/export.plist" -exportPath "$OUT/$platform" -allowProvisioningUpdates -quiet
done
echo "Done: version $VERSION, build $BUILD ($DESTINATION)."
