#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly FRONTEND_DIR="$REPOSITORY/edunex-f"
readonly DIST_DIR="${SKILLOMATE_FRONTEND_DIST:-$FRONTEND_DIR/dist}"
readonly AWS_COMMAND="${AWS_COMMAND:-aws}"
readonly BUCKET="${SKILLOMATE_FRONTEND_BUCKET:-}"
readonly DISTRIBUTION_ID="${SKILLOMATE_FRONTEND_DISTRIBUTION_ID:-}"
readonly HTML_CACHE_CONTROL="no-cache,max-age=0,must-revalidate"
readonly STATIC_CACHE_CONTROL="public,max-age=2592000,stale-while-revalidate=31536000"
readonly IMMUTABLE_CACHE_CONTROL="public,max-age=31536000,immutable"

skip_build=0
if test "${1:-}" = "--skip-build"; then
  skip_build=1
elif test $# -gt 0; then
  echo "Usage: $0 [--skip-build]"
  exit 2
fi

if test -z "$BUCKET" || test -z "$DISTRIBUTION_ID"; then
  echo "Set SKILLOMATE_FRONTEND_BUCKET and SKILLOMATE_FRONTEND_DISTRIBUTION_ID."
  exit 2
fi

if ! command -v "$AWS_COMMAND" >/dev/null 2>&1; then
  echo "AWS CLI command not found: $AWS_COMMAND"
  exit 2
fi

if test "$skip_build" -eq 0; then
  (cd "$FRONTEND_DIR" && npm run build)
fi

if test ! -f "$DIST_DIR/index.html"; then
  echo "Frontend build is missing: $DIST_DIR/index.html"
  exit 2
fi

destination="s3://${BUCKET#s3://}/"
bucket_path="${BUCKET#s3://}"
bucket_name="${bucket_path%%/*}"
object_prefix=""
if test "$bucket_path" != "$bucket_name"; then
  object_prefix="${bucket_path#*/}/"
fi

# Sync changed files and remove stale objects. HTML is overwritten below with a
# revalidation policy, while ordinary static files retain a useful fallback TTL.
"$AWS_COMMAND" s3 sync "$DIST_DIR/" "$destination" \
  --delete \
  --cache-control "$STATIC_CACHE_CONTROL" \
  --only-show-errors

"$AWS_COMMAND" s3 cp "$DIST_DIR/" "$destination" \
  --recursive \
  --exclude "*" \
  --include "*.html" \
  --cache-control "$HTML_CACHE_CONTROL" \
  --only-show-errors

if test -f "$DIST_DIR/static-pages/skillomate-ai-influencer-courseweb/index.html"; then
  "$AWS_COMMAND" s3api put-object \
    --bucket "$bucket_name" \
    --key "${object_prefix}marketing-web" \
    --body "$DIST_DIR/static-pages/skillomate-ai-influencer-courseweb/index.html" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "$HTML_CACHE_CONTROL" \
    --server-side-encryption AES256 \
    --output text >/dev/null

  "$AWS_COMMAND" s3api put-object \
    --bucket "$bucket_name" \
    --key "${object_prefix}marketing-web/" \
    --body "$DIST_DIR/static-pages/skillomate-ai-influencer-courseweb/index.html" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "$HTML_CACHE_CONTROL" \
    --server-side-encryption AES256 \
    --output text >/dev/null
fi

immutable_count=0
while IFS= read -r -d '' file; do
  relative="${file#"$DIST_DIR/"}"
  if [[ "$relative" =~ ^assets/.+-[A-Za-z0-9_-]{8,}\.[^.]+$ || "$relative" =~ -v[0-9]+\.[^.]+$ ]]; then
    "$AWS_COMMAND" s3 cp "$file" "${destination}${relative}" \
      --cache-control "$IMMUTABLE_CACHE_CONTROL" \
      --only-show-errors
    immutable_count=$((immutable_count + 1))
  fi
done < <(find "$DIST_DIR" -type f -print0)

"$AWS_COMMAND" cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --output text >/dev/null

echo "Frontend deployed to $destination"
echo "Immutable assets refreshed: $immutable_count"
echo "CloudFront invalidation created for distribution $DISTRIBUTION_ID"
