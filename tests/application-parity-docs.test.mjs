import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('docs distinguish restored application parity from separately integrated SAM',()=>{
  const r=readFileSync(new URL('../README.md',import.meta.url),'utf8');
  const d=readFileSync(new URL('../docs/EDITOR_ARCHITECTURE.md',import.meta.url),'utf8');
  assert.match(r,/Status of `refactor\/editor-architecture`/);
  assert.match(r,/local SAM UI is intentionally not part of this\s+> branch's merge target/i);
  assert.match(r,/integrated from its dedicated branch/);
  assert.match(d,/## Application parity/);
  assert.match(d,/advanced vector operations/);
  assert.match(d,/SAM is not a merge blocker/);
  assert.match(d,/integrated from a separate branch/);
  assert.match(d,/## Core migration status/);
});
