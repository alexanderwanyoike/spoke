#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required=(
  website/index.html
  website/styles.css
  website/script.js
  website/fonts/geist-latin-wght-normal.woff2
  website/fonts/Geist-LICENSE.txt
)
for file in "${required[@]}"; do
  test -s "$file" || { echo "missing website file: $file" >&2; exit 1; }
done

required_privacy_contract=(
  '@font-face'
  'font-family: "Geist Variable"'
  'url("fonts/geist-latin-wght-normal.woff2") format("woff2-variations")'
)

for value in "${required_privacy_contract[@]}"; do
  grep -Fq "$value" website/styles.css || {
    echo "missing self-hosted font contract: $value" >&2
    exit 1
  }
done

for value in \
  'fonts.googleapis.com' \
  'fonts.gstatic.com' \
  'https://alexanderwanyoike.github.io/jolt/'; do
  if grep -Fq "$value" website/index.html website/styles.css; then
    echo "premature or third-party website dependency remains: $value" >&2
    exit 1
  fi
done

grep -Fq 'https://github.com/alexanderwanyoike/jolt' website/index.html || {
  echo "website does not link to the currently available Jolt home" >&2
  exit 1
}
grep -Fq 'https://github.com/alexanderwanyoike/jolt/releases/latest' website/index.html || {
  echo "website does not provide an available Jolt download destination" >&2
  exit 1
}

required_jolt_dependency_contract=(
  'Spoke is a Jolt app. It cannot run standalone.'
  'Install and start Jolt before opening Spoke.'
  'aria-label="Learn about Jolt"'
  'class="jolt-prerequisite reveal"'
)

for value in "${required_jolt_dependency_contract[@]}"; do
  grep -Fq "$value" website/index.html || {
    echo "missing explicit Jolt dependency contract: $value" >&2
    exit 1
  }
done

jolt_release_link_count="$(grep -Fc 'https://github.com/alexanderwanyoike/jolt/releases/latest' website/index.html)"
test "$jolt_release_link_count" -ge 3 || {
  echo "Jolt prerequisite is not linked at every install decision point" >&2
  exit 1
}

em_dash="$(printf '\342\200\224')"
for file in website/index.html website/styles.css scripts/verify-website.sh; do
  if grep -Fq "$em_dash" "$file"; then
    echo "house-style em dash remains in $file" >&2
    exit 1
  fi
done

python3 - <<'PY'
from pathlib import Path

font = Path("website/fonts/geist-latin-wght-normal.woff2")
if font.read_bytes()[:4] != b"wOF2":
    raise SystemExit(f"self-hosted Geist asset is not WOFF2: {font}")
PY

required_download_contract=(
  '__VERSION__'
  '__RELEASE_DATE__'
  'https://github.com/alexanderwanyoike/spoke/releases/download/__VERSION__/spoke-x86_64.AppImage'
  'https://github.com/alexanderwanyoike/spoke/releases/download/__VERSION__/spoke-aarch64.dmg'
  'https://github.com/alexanderwanyoike/spoke/releases/download/__VERSION__/spoke-x86_64-setup.exe'
)

for value in "${required_download_contract[@]}"; do
  grep -Fq "$value" website/index.html || {
    echo "missing website download contract: $value" >&2
    exit 1
  }
done

required_social_visual_contract=(
  'Spoke gathers their posts and replies, while encrypted private messages are delivered through Jolt.'
  'SOCIAL GRAPH'
  'POSTS + IMAGES'
  'MESSAGES'
  'REPLIES'
)

for value in "${required_social_visual_contract[@]}"; do
  grep -Fq "$value" website/index.html || {
    echo "missing application-accurate hero contract: $value" >&2
    exit 1
  }
done

for value in '6 ACTIVE' 'move between them'; do
  if grep -Fq "$value" website/index.html; then
    echo "misleading social hero terminology remains: $value" >&2
    exit 1
  fi
done

grep -Fq "workflows: [\"Package Spoke\"]" .github/workflows/pages.yml || {
  echo "Pages workflow does not follow tagged Spoke releases" >&2
  exit 1
}
grep -Fq 'gh release view' .github/workflows/pages.yml || {
  echo "Pages workflow does not resolve the latest published release" >&2
  exit 1
}

python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

root = Path("website")
html_files = list(root.rglob("*.html"))

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag in {"a", "link", "script"}:
            values = dict(attrs)
            target = values.get("href") or values.get("src")
            if target:
                self.links.append(target)

for page in html_files:
    parser = Links()
    parser.feed(page.read_text())
    for link in parser.links:
        split = urlsplit(link)
        if split.scheme or link.startswith(("#", "//")):
            continue
        target = (page.parent / split.path).resolve()
        if split.path.endswith("/") or (target.exists() and target.is_dir()):
            target = target / "index.html"
        if not target.exists():
            raise SystemExit(f"broken local link in {page}: {link}")

print(f"verified {len(html_files)} HTML page")
PY
