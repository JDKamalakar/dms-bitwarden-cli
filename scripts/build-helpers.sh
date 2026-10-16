#!/usr/bin/env bash
# Build only from this checkout, using each checked-in Cargo.lock.
set -euo pipefail
cd "$(dirname "$0")/.."
for crate in vault unlock-key agent; do
    (cd "$crate" && cargo build --locked)
    case "$crate" in
        vault) name=qs-bitwarden-vault ;;
        unlock-key) name=qs-bitwarden-unlock-key ;;
        agent) name=qs-bitwarden-ssh-agent ;;
    esac
    "$crate/target/debug/$name" --self-test
    bash scripts/helper-source-hash.sh "$crate" > "$crate/target/debug/$name.source-sha256"
done
