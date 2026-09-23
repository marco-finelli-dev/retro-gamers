import assert from 'node:assert/strict';
import test from 'node:test';
import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';

const { code } = await transform(
  await readFile(new URL('../src/lib/supabase/oauth-origin.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'esm' },
);
const { getOAuthCallbackOrigin } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const site = 'https://www.retro-gamers.it/';

for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  test(`local ${host} keeps its origin and port despite a production site URL`, () => {
    const request = new URL(`http://${host}:4321/api/auth/oauth/start?provider=google`);
    assert.equal(getOAuthCallbackOrigin(request, site), request.origin);
  });
}

for (const host of ['retro-gamers-example-team.vercel.app', 'retro-gamers-git-visual-refresh-team.vercel.app']) {
  test(`preview ${host} uses the actual request origin, including branch aliases`, () => {
    const request = new URL(`https://${host}/api/auth/oauth/start?returnTo=%2Fen%2F`);
    assert.equal(getOAuthCallbackOrigin(request, site, 'preview'), request.origin);
  });
}

for (const environment of ['production', undefined]) {
  test(`${environment || 'unknown'} hosting retains the canonical production origin`, () => {
    assert.equal(getOAuthCallbackOrigin(new URL('https://alternate-host.example/api/auth/oauth/start'), site, environment), 'https://www.retro-gamers.it');
  });
}
