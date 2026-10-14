#!/usr/bin/env bash
# Native DMS widgets, inert service/process stubs, disposable fixtures.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec python demo/render-dms-preview.py --test-ui "$@"
