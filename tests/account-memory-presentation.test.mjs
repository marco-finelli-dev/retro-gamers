import assert from 'node:assert/strict';
import test from 'node:test';
import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';

const { code } = await transform(
  await readFile(new URL('../src/lib/account-memory-presentation.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'esm' },
);
const { getMemoryPresentation } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('approved comments retain their public permalink eligibility', () => {
  assert.deepEqual(getMemoryPresentation({ status: 'approved', deleted_at: null }), {
    status: 'approved', isPublic: true,
  });
});

test('soft-deleted approved comments are hidden and cannot link to a public comment', () => {
  assert.deepEqual(getMemoryPresentation({ status: 'approved', deleted_at: '2026-09-23T18:00:00Z' }), {
    status: 'hidden', isPublic: false,
  });
});

for (const status of ['pending', 'rejected', 'spam', 'unknown', null]) {
  test(`${status}: preserve the underlying state when not hidden`, () => {
    assert.deepEqual(getMemoryPresentation({ status, deleted_at: null }), {
      status: status || '', isPublic: false,
    });
  });
  test(`${status}: the existing soft-delete marker takes precedence`, () => {
    assert.deepEqual(getMemoryPresentation({ status, deleted_at: '2026-09-23T18:00:00Z' }), {
      status: 'hidden', isPublic: false,
    });
  });
}
