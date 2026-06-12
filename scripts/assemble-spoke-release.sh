#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Assemble normalized Spoke artifacts into a tagged release directory.

Usage:
  scripts/assemble-spoke-release.sh --tag TAG [--dist-dir DIR] [--release-dir DIR]

Defaults:
  --dist-dir     dist
  --release-dir  release
USAGE
}

TAG=""
DIST_DIR="dist"
RELEASE_DIR="release"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    --dist-dir)
      DIST_DIR="${2:-}"
      shift 2
      ;;
    --release-dir)
      RELEASE_DIR="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$TAG" ]]; then
  echo "--tag is required" >&2
  usage >&2
  exit 2
fi

mkdir -p "$RELEASE_DIR"
find "$DIST_DIR" -maxdepth 2 -type f -exec cp {} "$RELEASE_DIR/" \;

required_assets=(
  "spoke-x86_64.AppImage"
  "spoke-x86_64.AppImage.sha256"
  "spoke-x86_64.AppImage.sig"
  "spoke-aarch64.dmg"
  "spoke-aarch64.dmg.sha256"
  "spoke-aarch64.app.tar.gz"
  "spoke-aarch64.app.tar.gz.sha256"
  "spoke-aarch64.app.tar.gz.sig"
  "spoke-x86_64-setup.exe"
  "spoke-x86_64-setup.exe.sha256"
  "spoke-x86_64-setup.exe.sig"
)

for asset in "${required_assets[@]}"; do
  if [[ ! -f "$RELEASE_DIR/$asset" ]]; then
    echo "Missing release asset: $RELEASE_DIR/$asset" >&2
    exit 1
  fi
done

node scripts/write-spoke-update-manifest.mjs \
  "$TAG" \
  "$RELEASE_DIR/latest.json" \
  linux-x86_64 \
  "$RELEASE_DIR/spoke-x86_64.AppImage.sig" \
  spoke-x86_64.AppImage \
  darwin-aarch64 \
  "$RELEASE_DIR/spoke-aarch64.app.tar.gz.sig" \
  spoke-aarch64.app.tar.gz \
  windows-x86_64 \
  "$RELEASE_DIR/spoke-x86_64-setup.exe.sig" \
  spoke-x86_64-setup.exe
