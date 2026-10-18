#!/usr/bin/env bash
# Hash crate-local build inputs, including their paths, without following symlinks.
set -euo pipefail
export LC_ALL=C
if [[ $# != 1 || ! -d "$1" || -L "$1" ]]; then
    echo "Usage: $0 <crate-dir>" >&2
    exit 1
fi
cd -- "$1"
if [[ ! -f Cargo.toml || ! -d src || -L src || -L .cargo ]]; then
    echo "Expected a crate with Cargo.toml and a local src directory" >&2
    exit 1
fi
hash=$({
    for file in Cargo.toml Cargo.lock rust-toolchain.toml .cargo/config* build.rs; do
        if [[ -e "$file" || -L "$file" ]]; then
            printf '%s\0' "$file"
        fi
    done
    find src \( -type f -o -type l \) -print0
} | sort -z | while IFS= read -r -d '' file; do
    if [[ -L "$file" || ! -f "$file" ]]; then
        echo "Not a regular crate-local input: $file" >&2
        exit 1
    fi
    printf '%s\0' "$file"
    sha256sum < "$file" || exit 1
done | sha256sum | cut -d ' ' -f 1)
printf '%s\n' "$hash"
