#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-TyranidScreeps2.0.wiki}"
WIKI_BRANCH="${WIKI_BRANCH:-master}"
WIKI_REPO_URL="${WIKI_REPO_URL:-}"
WIKI_TOKEN="${WIKI_TOKEN:-}"
WIKI_USERNAME="${WIKI_USERNAME:-git}"
AUTHOR_NAME="${GIT_AUTHOR_NAME:-github-actions[bot]}"
AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"
COMMIT_MESSAGE="${WIKI_COMMIT_MESSAGE:-Sync wiki from repo}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source wiki directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [ -z "$WIKI_REPO_URL" ]; then
  echo "WIKI_REPO_URL is required." >&2
  exit 1
fi

tmp_root="$(mktemp -d)"
tmpdir="$tmp_root/wiki"
cleanup() {
  rm -rf "$tmp_root"
}
trap cleanup EXIT

git_cmd=(git)
if [ -n "$WIKI_TOKEN" ]; then
  credentials_file="$tmp_root/.git-credentials"
  printf 'https://%s:%s@github.com\n' "$WIKI_USERNAME" "$WIKI_TOKEN" > "$credentials_file"
  chmod 600 "$credentials_file"
  git_cmd+=( -c "credential.helper=store --file=$credentials_file" )
fi

"${git_cmd[@]}" clone --depth 1 --branch "$WIKI_BRANCH" "$WIKI_REPO_URL" "$tmpdir"

# The GitHub wiki is a separate git repository. Replace its tracked contents
# with the repo-managed wiki folder so this directory remains the source of truth.
find "$tmpdir" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -a "$SOURCE_DIR"/. "$tmpdir"/

git -C "$tmpdir" config user.name "$AUTHOR_NAME"
git -C "$tmpdir" config user.email "$AUTHOR_EMAIL"
git -C "$tmpdir" add --all

if git -C "$tmpdir" diff --cached --quiet; then
  echo "Wiki mirror already up to date."
  exit 0
fi

git -C "$tmpdir" commit -m "$COMMIT_MESSAGE"
"${git_cmd[@]}" -C "$tmpdir" push origin "HEAD:$WIKI_BRANCH"
