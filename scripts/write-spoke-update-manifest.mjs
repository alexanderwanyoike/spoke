#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const [tag, signaturePath, outputPath] = process.argv.slice(2);

if (!tag || !signaturePath || !outputPath) {
  console.error(
    "Usage: scripts/write-spoke-update-manifest.mjs <tag> <signature-path> <output-path, usually latest.json>"
  );
  process.exit(2);
}

const repo = process.env.SPOKE_REPO ?? "alexanderwanyoike/spoke";
const assetName = process.env.SPOKE_ASSET_NAME ?? "spoke-x86_64.AppImage";
const version = tag.replace(/^v/, "");
const signature = readFileSync(signaturePath, "utf8").trim();
const pubDate = process.env.SPOKE_RELEASE_PUB_DATE ?? new Date().toISOString();
const releaseNotes = process.env.SPOKE_RELEASE_NOTES ?? `Spoke ${tag} signed update.`;

if (!signature) {
  console.error(`Updater signature is empty: ${signaturePath}`);
  process.exit(1);
}

const manifest = {
  version,
  notes: releaseNotes,
  pub_date: pubDate,
  platforms: {
    "linux-x86_64": {
      signature,
      url: `https://github.com/${repo}/releases/download/${tag}/${assetName}`
    }
  }
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
