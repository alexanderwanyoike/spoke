#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_CACHE_DIR="${TAURI_CACHE_DIR:-$HOME/.cache/tauri}"
CREATE_UPDATER_ARTIFACTS="${SPOKE_CREATE_UPDATER_ARTIFACTS:-0}"
DRY_RUN=0

run_with_retries() {
  local attempts="$1"
  shift

  local attempt=1
  until "$@"; do
    if [[ "$attempt" -ge "$attempts" ]]; then
      return 1
    fi

    echo "Command failed; retrying ($attempt/$attempts): $*" >&2
    sleep "$((attempt * 5))"
    attempt="$((attempt + 1))"
  done
}

download_tauri_helper() {
  local filename="$1"
  local url="$2"
  local target="$TAURI_CACHE_DIR/$filename"

  if [[ -s "$target" ]]; then
    echo "    cached: $filename"
    return 0
  fi

  echo "    downloading: $filename"
  local tmp="$target.tmp"
  rm -f "$tmp"
  run_with_retries 5 curl -fL "$url" -o "$tmp"
  mv "$tmp" "$target"
}

prefetch_tauri_appimage_helpers() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi

  echo "==> Prefetching Tauri AppImage helper binaries"
  mkdir -p "$TAURI_CACHE_DIR"

  download_tauri_helper \
    "AppRun-x86_64" \
    "https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-x86_64"
  download_tauri_helper \
    "linuxdeploy-x86_64.AppImage" \
    "https://github.com/tauri-apps/binary-releases/releases/download/linuxdeploy/linuxdeploy-x86_64.AppImage"

  chmod 0755 \
    "$TAURI_CACHE_DIR/AppRun-x86_64" \
    "$TAURI_CACHE_DIR/linuxdeploy-x86_64.AppImage"
}

usage() {
  cat <<'USAGE'
Build the v0 Spoke Linux AppImage.

Usage:
  scripts/package-spoke.sh [--dry-run]

Options:
  --dry-run  Print the resolved packaging plan without building.
  --help     Show this help.

Environment:
  SPOKE_CREATE_UPDATER_ARTIFACTS  Set to 1 for signed Tauri updater artifacts.

Outputs:
  src-tauri/target/release/bundle/appimage/*.AppImage
  CI normalizes release assets to spoke-x86_64.AppImage
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
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

cat <<PLAN
Spoke v0 packaging plan
  repo:          $ROOT_DIR
  updater files: $CREATE_UPDATER_ARTIFACTS
PLAN

if [[ "$DRY_RUN" -eq 1 ]]; then
  exit 0
fi

echo "==> Installing Spoke dependencies if needed"
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  (cd "$ROOT_DIR" && npm ci)
fi

echo "==> Building Spoke web assets"
(cd "$ROOT_DIR" && npm run build)

prefetch_tauri_appimage_helpers

if [[ "$CREATE_UPDATER_ARTIFACTS" == "1" ]]; then
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
    echo "SPOKE_CREATE_UPDATER_ARTIFACTS=1 requires TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH" >&2
    exit 1
  fi
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
    TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY_PATH")"
    export TAURI_SIGNING_PRIVATE_KEY
  fi
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
fi

echo "==> Building Linux AppImage bundle"
TAURI_BUILD_ARGS=(build -- --bundles appimage)
if [[ "$CREATE_UPDATER_ARTIFACTS" == "1" ]]; then
  TAURI_BUILD_ARGS+=(--config '{"bundle":{"createUpdaterArtifacts":true}}')
fi
(cd "$ROOT_DIR" && run_with_retries 3 npm run tauri "${TAURI_BUILD_ARGS[@]}")

echo "==> Bundle artifacts"
find "$ROOT_DIR/src-tauri/target/release/bundle/appimage" -maxdepth 1 -type f -name '*.AppImage' -print
find "$ROOT_DIR/src-tauri/target/release/bundle/appimage" -maxdepth 1 -type f -name '*.AppImage.sig' -print
