#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"
qml_runner=$(command -v qmltestrunner || true)
if [[ -z "$qml_runner" && -x /usr/lib/qt6/bin/qmltestrunner ]]; then
  qml_runner=/usr/lib/qt6/bin/qmltestrunner
fi
if [[ -z "$qml_runner" ]]; then
  echo "Qt 6 qmltestrunner is required" >&2
  exit 1
fi
./scripts/build-helpers.sh
for crate in agent vault unlock-key; do
  cargo test --manifest-path "$crate/Cargo.toml" --locked
done
node --test tests/*.test.js
QML_XHR_ALLOW_FILE_READ=1 QT_QPA_PLATFORM=offscreen "$qml_runner" -input tests/qml -o -,txt
