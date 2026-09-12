import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const allowlistPath = 'tests/fixtures/editor-i18n-debt-allowlist.json';
const keyPattern = /\bcopy\.([A-Za-z0-9_]+)/g;
const keysFrom = (source) => new Set([...source.matchAll(keyPattern)].map((match) => match[1]));

const mainFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'origin/main', '--', 'app/annotate'], { encoding: 'utf8' })
  .trim().split('\n').filter((file) => /\.[cm]?[jt]sx?$/.test(file));
const mainKeys = new Set();
for (const file of mainFiles) {
  const source = execFileSync('git', ['show', `origin/main:${file}`], { encoding: 'utf8' });
  for (const key of keysFrom(source)) mainKeys.add(key);
}

const currentKeys = new Set();
function walk(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.[cm]?[jt]sx?$/.test(name)) {
      for (const key of keysFrom(readFileSync(full, 'utf8'))) currentKeys.add(key);
    }
  }
}
for (const root of ['app/editor', 'app/raster', 'app/annotate']) walk(root);

const debt = [...mainKeys].filter((key) => !currentKeys.has(key)).sort();
const allowed = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowedSet = new Set(allowed);
const unexpected = debt.filter((key) => !allowedSet.has(key));
const stale = allowed.filter((key) => !debt.includes(key));

if (unexpected.length || stale.length) {
  console.error('Editor i18n parity gate failed.');
  if (unexpected.length) console.error('New missing keys:', unexpected.join(', '));
  if (stale.length) console.error('Remove restored keys from allowlist:', stale.join(', '));
  process.exit(1);
}
console.log(`Editor i18n parity debt: ${debt.length} exact allowlisted key(s).`);
