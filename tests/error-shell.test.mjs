import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { loadErrorShellHarness } from './helpers/error-shell-harness.mjs';

const harness = await loadErrorShellHarness();
after(harness.cleanup);
const scenarios = ['quota', 403, 429, 500, 503, 'timeout', 'rejection'];
const failure = scenario => Object.assign(new Error(scenario === 'quota' ? 'API requests exhausted' : String(scenario)), { status: typeof scenario === 'number' ? scenario : undefined, name: scenario === 'timeout' ? 'TimeoutError' : 'Error' });

for (const scenario of scenarios) for (const status of [404, 500]) {
  test(`${status} renders with ${scenario}: correct status, zero data/session calls and no retry`, async () => {
    const calls = { sanity: 0, supabase: 0, session: 0, other: 0 };
    const fetch = globalThis.fetch;
    globalThis.fetch = async input => {
      const url = String(input?.url || input);
      calls[url.includes('sanity') ? 'sanity' : url.includes('supabase') ? 'supabase' : 'other']++;
      throw failure(scenario);
    };
    globalThis.__errorShellAuth = () => { calls.session++; throw failure(scenario); };
    try {
      const response = await harness.render(status);
      const html = await response.text();
      assert.equal(response.status, status);
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<main>/);
      assert.match(html, /<h1>/);
      assert.match(html, /href="\/">Torna alla home/);
      assert.match(html, /retro-gamers-logo-(ivory|navy)\.svg/);
      assert.match(html, /noindex, nofollow/);
      assert.doesNotMatch(html, /PRIVATE STACK SENTINEL|API requests exhausted|TimeoutError/);
      assert.deepEqual(calls, { sanity: 0, supabase: 0, session: 0, other: 0 });
    } finally { globalThis.fetch = fetch; delete globalThis.__errorShellAuth; }
  });
}

test('error component dependency graph contains only static layout, pages and CSS', () => {
  assert.deepEqual(harness.dependencies.sort(), [
    'src/layouts/ErrorLayout.astro', 'src/pages/404.astro', 'src/pages/500.astro',
    'src/styles/global.css', 'src/styles/pages/error.css',
  ]);
});

test('middleware uses matched error route even when the request URL is an article or an unknown path', async () => {
  globalThis.__errorShellAuth = () => { throw Error('Session must not be read'); };
  try {
    for (const routePattern of ['/404', '/500', '/404/', '/500/']) for (const pathname of ['/missing/deep/url/', '/news/failed-article/']) {
      let nextCalls = 0;
      const response = await harness.onRequest({ routePattern, url: new URL('https://example.test' + pathname), request: new Request('https://example.test' + pathname, { headers: { accept: 'text/html' } }) }, () => { nextCalls++; return new Response(null, { status: Number(routePattern.slice(1, 4)) }); });
      assert.equal(nextCalls, 1);
      assert.equal(response.status, Number(routePattern.slice(1, 4)));
    }
  } finally { delete globalThis.__errorShellAuth; }
});

test('normal public/auth routes still load the same session; APIs and legacy redirects remain unchanged', async () => {
  let reads = 0;
  const session = { user: { id: 'offline-only' } };
  globalThis.__errorShellAuth = () => { reads++; return session; };
  const run = async (pathname, routePattern = pathname) => {
    const locals = {};
    const url = new URL('https://example.test' + pathname);
    const response = await harness.onRequest({ url, routePattern, locals, cookies: {}, request: new Request(url, { headers: { accept: 'text/html' } }) }, () => new Response('unchanged'));
    return { locals, response };
  };
  try {
    for (const path of ['/', '/account/', '/en/account/login/', '/recensioni/final-fight/']) {
      const { locals, response } = await run(path);
      assert.equal(response.status, 200);
      assert.equal(locals.userSession, session);
      assert.equal(locals.routeLanguage, path.startsWith('/en/') ? 'en' : 'it');
    }
    assert.equal(reads, 4);
    await run('/api/example/');
    const { response } = await run('/piattaforma/amiga-500/', '/404');
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('Location'), 'https://example.test/piattaforme/computer/commodore/amiga-500/');
    assert.equal(reads, 4);
  } finally { delete globalThis.__errorShellAuth; }
});

test('error theme respects light/dark/system and survives unavailable storage', async () => {
  const html = await (await harness.render(404)).text();
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  for (const stored of ['light', 'dark', 'system', null, 'invalid', 'blocked']) for (const systemLight of [true, false]) {
    const document = { documentElement: { dataset: {} } };
    runInNewContext(script, { document, localStorage: { getItem() { if (stored === 'blocked') throw Error('Storage blocked'); return stored; } }, window: { matchMedia: () => ({ matches: systemLight }) } });
    assert.equal(document.documentElement.dataset.theme, stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : systemLight ? 'light' : 'dark');
  }
});

test('global canvas has solid theme fallbacks and no legacy grid source', async () => {
  const css = await readFile('src/styles/global.css', 'utf8');
  assert.doesNotMatch(css, /body::before|--page-background-size|76px 76px/);
  assert.deepEqual([...css.matchAll(/--page-background:\s*([^;]+);/g)].map(m => m[1]), ['var(--rg-shell-paper)', 'var(--rg-color-ivory)']);
  // Intentional component decoration has not been removed with the page grid.
  assert.match(css, /--section-box-background:\s*linear-gradient/);
});
