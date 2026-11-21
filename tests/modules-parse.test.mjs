import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = new URL('../js/', import.meta.url);

test('every Station module parses as an ES module (catches a stray brace or a duplicated import line)', () => {
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.ok(files.length > 10);
  const tmp = mkdtempSync(join(tmpdir(), 'station-parse-'));
  files.forEach(f => {
    const copy = join(tmp, f.replace(/\.js$/, '.mjs'));
    writeFileSync(copy, readFileSync(new URL(f, dir), 'utf8'));
    const r = spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
    assert.equal(r.status, 0, f + ': ' + r.stderr);
  });
});
