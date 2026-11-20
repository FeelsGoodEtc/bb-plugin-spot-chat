#!/bin/sh
# Rebuilds the prebuilt native window, macos/Spot Chat.app, as a universal
# (arm64 + x86_64) binary with an ad-hoc signature. Requires the Xcode Command
# Line Tools. Commit the result so installs from git work without Xcode.
set -eu

plugin_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
min_macos=12.0
app="$plugin_dir/macos/Spot Chat.app"
build="$plugin_dir/.generated/macos-build"
contents="$app/Contents"

rm -rf "$app" "$build"
mkdir -p "$contents/MacOS" "$build"
for arch in arm64 x86_64; do
  /usr/bin/xcrun swiftc -O \
    -target "$arch-apple-macos$min_macos" \
    -module-cache-path "$plugin_dir/.generated/module-cache" \
    "$plugin_dir/macos/SpotChat.swift" -o "$build/SpotChat-$arch"
done
/usr/bin/lipo -create "$build/SpotChat-arm64" "$build/SpotChat-x86_64" -output "$contents/MacOS/SpotChat"
cp "$plugin_dir/macos/Info.plist" "$contents/Info.plist"
/usr/bin/codesign --force --sign - "$app"
/usr/bin/lipo -archs "$contents/MacOS/SpotChat"
