#!/bin/sh
set -eu

plugin_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
contents="$plugin_dir/.generated/Spot Chat.app/Contents"
mkdir -p "$contents/MacOS"
/usr/bin/xcrun swiftc -module-cache-path "$plugin_dir/.generated/module-cache" "$plugin_dir/macos/SpotChat.swift" -o "$contents/MacOS/SpotChat"
cp "$plugin_dir/macos/Info.plist" "$contents/Info.plist"
