#!/usr/bin/env bash
# Sync altstore.json with a published GitHub release.
#
#   scripts/altstore-release.sh              # latest release, changelog = release notes
#   scripts/altstore-release.sh v1.2.0       # specific tag, changelog = release notes
#   scripts/altstore-release.sh v1.2.0 "..."  # specific tag, changelog override
#
# Run AFTER a release is published with a localchat.ipa asset: this fills in the
# real IPA size and URL, then prepends the version entry. AltStore refuses to
# install an entry whose `size` does not match the downloaded file, so the size
# must come from the release API and never be hand-written.
#
# The release workflow calls this and commits the result to main.
set -euo pipefail

REPO="${ALTSTORE_REPO:-samuelloranger/localchat}"
TAG="${1:-}"

if [ -n "$TAG" ]; then
  REL_JSON="$(gh api "repos/$REPO/releases/tags/$TAG")"
else
  REL_JSON="$(gh api "repos/$REPO/releases/latest")"
  TAG="$(jq -r .tag_name <<<"$REL_JSON")"
  echo "latest release: $TAG"
fi
VERSION="${TAG#v}"

NOTES="${2:-$(jq -r '.body // ""' <<<"$REL_JSON")}"
[ -n "${NOTES// /}" ] || NOTES="See the release notes on GitHub."

ASSET_JSON="$(jq '(.assets[] | select(.name | endswith(".ipa")))
  | {size, url: .browser_download_url}' <<<"$REL_JSON")"
[ -n "$ASSET_JSON" ] || {
  echo "no .ipa asset on release $TAG" >&2
  exit 1
}
SIZE="$(jq -r .size <<<"$ASSET_JSON")"
URL="$(jq -r .url <<<"$ASSET_JSON")"
DATE="$(jq -r '.published_at[:10]' <<<"$REL_JSON")"

# minOSVersion must track expo-build-properties' ios.deploymentTarget. AltStore
# hides the app on older devices based on this; if it under-reports, the install
# succeeds and the app crashes on launch.
MIN_OS="$(jq -r '
  .expo.plugins[]
  | select(type == "array" and .[0] == "expo-build-properties")
  | .[1].ios.deploymentTarget // "16.4"' app.json)"

# Newest first, and drop any existing entry for this version so re-running after
# a re-upload replaces it instead of duplicating.
jq --arg v "$VERSION" --arg d "$DATE" --arg url "$URL" \
  --argjson size "$SIZE" --arg notes "$NOTES" --arg minos "$MIN_OS" '
  .apps[0].versions |= ([{
    version: $v, date: $d, localizedDescription: $notes,
    downloadURL: $url, size: $size, minOSVersion: $minos
  }] + map(select(.version != $v)))
' altstore.json >altstore.json.tmp && mv altstore.json.tmp altstore.json

echo "altstore.json updated: $VERSION ($SIZE bytes, iOS $MIN_OS+) -> $URL"
