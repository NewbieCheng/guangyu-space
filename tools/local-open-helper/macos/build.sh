#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="${1:-$PROJECT_ROOT/.local-helper-build}"
APP_DIR="$OUTPUT_DIR/GuangyuOpenHelper.app"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64|x86_64) ;;
  *) printf 'Unsupported macOS architecture: %s\n' "$ARCH" >&2; exit 1 ;;
esac

mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources" "$OUTPUT_DIR/ModuleCache"
cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/Info.plist"
printf 'APPL????' > "$APP_DIR/Contents/PkgInfo"
swiftc -target "${ARCH}-apple-macosx12.0" -O -module-cache-path "$OUTPUT_DIR/ModuleCache" -framework AppKit "$SCRIPT_DIR/main.swift" -o "$APP_DIR/Contents/MacOS/GuangyuOpenHelper"
codesign --force --deep --sign - "$APP_DIR"
printf 'Built %s\n' "$APP_DIR"
