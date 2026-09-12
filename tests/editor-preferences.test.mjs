import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
test('canonical editor honors persisted language/theme and uses theme tokens',()=>{
  const s=readFileSync(new URL('../app/editor/workbench/canonical-editor-workbench.tsx',import.meta.url),'utf8');
  assert.match(s,/storedLanguage\(\)/); assert.match(s,/storedTheme\(\)/); assert.match(s,/const copy = getCopy\(language\)/);
  assert.doesNotMatch(s,/getCopy\("pt"\)/); assert.match(s,/var\(--paper\)/); assert.match(s,/var\(--canvas-bg\)/); assert.doesNotMatch(s,/background: "#111315"/);
});
