#!/usr/bin/env bash
# CI publish helper — always prints diagnostics; never fails silently.
set -uo pipefail

log() { echo "=== $* ==="; }
fail() {
  echo "::error::$1"
  exit "${2:-1}"
}

log "npm publish via Trusted Publishing (OIDC)"
log "node: $(node --version)"
log "npm: $(npm --version)"

NODE_MIN="22.14.0"
NPM_MIN="11.5.1"

node -e "
  const [nv, mv] = ['$NODE_MIN', '$NPM_MIN'];
  const nodeOk = process.version.localeCompare('v' + nv, undefined, { numeric: true }) >= 0;
  const npmV = require('child_process').execSync('npm --version', { encoding: 'utf8' }).trim();
  const npmOk = npmV.localeCompare(mv, undefined, { numeric: true }) >= 0;
  if (!nodeOk) { console.error('Node must be >= ' + nv + ', got ' + process.version); process.exit(1); }
  if (!npmOk) { console.error('npm must be >= ' + mv + ', got ' + npmV); process.exit(1); }
" || fail "Node/npm version too old for Trusted Publishing (need Node >= 22.14, npm >= 11.5.1)"

PKG_NAME="$(node -p 'require("./package.json").name')"
PKG_VERSION="$(node -p 'require("./package.json").version')"
PKG_REPO="$(node -p 'require("./package.json").repository.url')"

log "package: ${PKG_NAME}@${PKG_VERSION}"
log "repository.url: ${PKG_REPO}"
log "github.workflow: ${GITHUB_WORKFLOW:-unknown}"
log "github.ref: ${GITHUB_REF:-unknown}"
log "github.repository: ${GITHUB_REPOSITORY:-unknown}"

if [ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  fail "ACTIONS_ID_TOKEN_REQUEST_URL is unset — workflow needs permissions.id-token: write"
fi
log "OIDC token URL present (Trusted Publishing can proceed)"

log "npm publish --access public"
set +e
npm publish --access public --loglevel verbose > /tmp/npm-publish.log 2>&1
PUBLISH_EXIT=$?
set -e

cat /tmp/npm-publish.log

if [ "$PUBLISH_EXIT" -ne 0 ]; then
  echo ""
  log "npm publish FAILED (exit ${PUBLISH_EXIT})"
  if ls "$HOME/.npm/_logs/"*-debug-*.log >/dev/null 2>&1; then
    log "npm debug logs"
    for f in "$HOME/.npm/_logs/"*-debug-*.log; do
      echo "--- ${f} ---"
      cat "$f"
    done
  fi
  if grep -q "ENEEDAUTH" /tmp/npm-publish.log; then
    fail "ENEEDAUTH — verify npm Trusted Publisher: repo=chatablex/chatablex-web-sdk, workflow=publish.yml, id-token:write"
  fi
  if grep -q "E403" /tmp/npm-publish.log; then
    fail "E403 — trusted publisher may not allow this workflow/environment"
  fi
  if grep -q "E404" /tmp/npm-publish.log; then
    fail "E404 — package not found or no publish permission"
  fi
  fail "npm publish failed with exit code ${PUBLISH_EXIT}" "$PUBLISH_EXIT"
fi

log "publish succeeded"
npm view "${PKG_NAME}" version
