import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('docs protect SAM modules and connector assets from orphan cleanup before branch integration',()=>{
  const d=readFileSync(new URL('../docs/EDITOR_ARCHITECTURE.md',import.meta.url),'utf8');
  assert.match(d,/app\/lib\/sam\.ts/);
  assert.match(d,/must therefore not be deleted as orphaned legacy/);
  assert.match(d,/local connector assets/);
  assert.match(d,/integrated from a separate branch/);
});
