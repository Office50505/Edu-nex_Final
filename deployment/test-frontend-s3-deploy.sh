#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

mkdir -p "$TEMP_DIR/dist/assets" "$TEMP_DIR/dist/static-pages/skillomate-ai-influencer-courseweb"
printf '<!doctype html><title>Skillomate</title>\n' >"$TEMP_DIR/dist/index.html"
printf '<!doctype html><title>Marketing</title>\n' >"$TEMP_DIR/dist/static-pages/skillomate-ai-influencer-courseweb/index.html"
printf 'console.log("app");\n' >"$TEMP_DIR/dist/assets/index-AbCd1234.js"
printf 'logo\n' >"$TEMP_DIR/dist/assets/skillomate-logo-dark-v1.webp"
printf 'legacy\n' >"$TEMP_DIR/dist/assets/legacy.js"

cat >"$TEMP_DIR/aws" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$AWS_CALL_LOG"
EOF
chmod +x "$TEMP_DIR/aws"

AWS_CALL_LOG="$TEMP_DIR/aws.log" \
AWS_COMMAND="$TEMP_DIR/aws" \
SKILLOMATE_FRONTEND_DIST="$TEMP_DIR/dist" \
SKILLOMATE_FRONTEND_BUCKET="skillomate-test" \
SKILLOMATE_FRONTEND_DISTRIBUTION_ID="TEST123" \
  bash "$SCRIPT_DIR/deploy-frontend-s3.sh" --skip-build >/dev/null

grep -Fq 's3 sync' "$TEMP_DIR/aws.log"
grep -Fq 'public,max-age=2592000,stale-while-revalidate=31536000' "$TEMP_DIR/aws.log"
grep -Fq 'no-cache,max-age=0,must-revalidate' "$TEMP_DIR/aws.log"
grep -Fq 'assets/index-AbCd1234.js' "$TEMP_DIR/aws.log"
grep -Fq 'assets/skillomate-logo-dark-v1.webp' "$TEMP_DIR/aws.log"
grep -Fq 'public,max-age=31536000,immutable' "$TEMP_DIR/aws.log"
grep -Fq "s3api put-object --bucket skillomate-test --key marketing-web --body $TEMP_DIR/dist/static-pages/skillomate-ai-influencer-courseweb/index.html" "$TEMP_DIR/aws.log"
grep -Fq "s3api put-object --bucket skillomate-test --key marketing-web/ --body $TEMP_DIR/dist/static-pages/skillomate-ai-influencer-courseweb/index.html" "$TEMP_DIR/aws.log"
grep -Fq 'cloudfront create-invalidation --distribution-id TEST123 --paths /*' "$TEMP_DIR/aws.log"

echo "Frontend S3 cache deployment test passed."
