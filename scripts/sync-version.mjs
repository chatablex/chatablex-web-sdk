#!/usr/bin/env node
/**
 * Sync release version from git tag into package.json and SDK_VERSION.
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

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const indexPath = path.join(root, 'src/index.ts');
let indexSrc = fs.readFileSync(indexPath, 'utf8');
indexSrc = indexSrc.replace(
  /export const SDK_VERSION = '[^']*';/,
  `export const SDK_VERSION = '${version}';`,
);
fs.writeFileSync(indexPath, indexSrc);

console.log(`Synced version → ${version}`);
console.log('  package.json');
console.log('  src/index.ts (SDK_VERSION)');
