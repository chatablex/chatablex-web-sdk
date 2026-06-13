#!/usr/bin/env node
/**
 * Sync release version from git tag into package.json (and package-lock.json).
 * SDK_VERSION is derived from package.json at build/runtime — no source patch needed.
 *
 * Usage:
 *   node scripts/sync-version.mjs 1.2.3
 *   VERSION=1.2.3 node scripts/sync-version.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const raw = process.argv[2] || process.env.VERSION || '';
const version = raw.replace(/^v/, '').trim();

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid semver: "${raw}" (expected e.g. 1.2.3 or v1.2.3)`);
  process.exit(1);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
writeJson(pkgPath, pkg);

const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) {
    lock.packages[''].version = version;
  }
  writeJson(lockPath, lock);
}

console.log(`Synced version → ${version}`);
console.log('  package.json');
if (fs.existsSync(lockPath)) {
  console.log('  package-lock.json');
}
