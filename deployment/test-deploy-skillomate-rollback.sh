#!/usr/bin/env bash

set -Eeuo pipefail

self_test_directory="$(mktemp -d /tmp/skillomate-rollback-selftest.XXXXXX)"

cleanup() {
  rm -rf -- "$self_test_directory"
}

trap cleanup EXIT

git -C "$self_test_directory" init -q
git -C "$self_test_directory" config user.name "Skillomate Deployment Self-Test"
git -C "$self_test_directory" config user.email "deployment-self-test@localhost"

printf 'version-a\n' >"$self_test_directory/version.txt"
git -C "$self_test_directory" add version.txt
git -C "$self_test_directory" commit -q -m "known good"
old_commit="$(git -C "$self_test_directory" rev-parse HEAD)"

printf 'version-b\n' >"$self_test_directory/version.txt"
git -C "$self_test_directory" commit -q -am "candidate"
new_commit="$(git -C "$self_test_directory" rev-parse HEAD)"

git -C "$self_test_directory" reset -q --hard "$new_commit"

# Simulate a post-switch deployment failure, then exercise the same Git reset
# behavior used by the production rollback without touching production paths.
simulated_deployment_status=1
if test "$simulated_deployment_status" -ne 0; then
  git -C "$self_test_directory" reset -q --hard "$old_commit"
fi

test "$(git -C "$self_test_directory" rev-parse HEAD)" = "$old_commit"
test "$(cat "$self_test_directory/version.txt")" = "version-a"

echo "ROLLBACK SELF-TEST PASSED"
echo "scope=temporary_non_production_repository"
echo "candidate_commit=$new_commit"
echo "restored_commit=$old_commit"

