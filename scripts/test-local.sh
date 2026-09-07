#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
yarn test
yarn build
yarn verify:distribution
