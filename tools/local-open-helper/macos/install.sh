#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STAGING_DIR="${TMPDIR:-/tmp}/guangyu-open-helper-build"
DESTINATION="${HOME}/Applications/GuangyuOpenHelper.app"

"$SCRIPT_DIR/build.sh" "$STAGING_DIR"
mkdir -p "$(dirname -- "$DESTINATION")"
ditto "$STAGING_DIR/GuangyuOpenHelper.app" "$DESTINATION"
open -a "$DESTINATION"
printf 'Installed %s\n' "$DESTINATION"
