import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { loadSessionShellHarness } from './helpers/session-shell-harness.mjs';
import { fixture, requests } from './helpers/session-backend.mjs';
const h = await loadSessionShellHarness();
after(() => h.cleanup());

for (const lang of ['it', 'en']) {
  for (const auth of [false, true]) {
    test(`real Astro layout ${lang}/${auth ? 'user' : 'guest'}: shared locals, safe HTML, unchanged shell`, async () => {
      const s = fixture({ userId: 'reader', cookies: auth ? { rg_access_token: 'PRIVATE_ACCESS_SENTINEL', rg_refresh_token: 'PRIVATE_REFRESH_SENTINEL' } : {} });
      const ctx = { cookies: s.cookies, locals: {}, request: new Request(`https://example.test/${lang === 'en' ? 'en/' : ''}`, { headers: { accept: 'text/html' } }), url: new URL(`https://example.test/${lang === 'en' ? 'en/' : ''}`), routePattern: '/' };
      await requests.run(s, async () => {
        await h.onRequest(ctx, async () => {});
        const value = await h.getUserSessionFromCookies(s.cookies, ctx.locals);
        assert.equal(value, ctx.locals.userSession);
        const html = await h.render(ctx, { lang });
        assert.match(html, /Route body sentinel/);
        assert.match(html, /site-header/);
        assert.match(html, /article-desktop-sidebar/);
        assert.doesNotMatch(html, /PRIVATE_ACCESS_SENTINEL|PRIVATE_REFRESH_SENTINEL|requestUserSession|requestEditorialSession/);
        assert.equal(s.auth, auth ? 1 : 0);
        assert.equal(s.profiles, auth ? 1 : 0);
        assert.equal(s.editorial, auth ? 1 : 0);
        // Unmemoized rendering must produce byte-identical output. It only
        // repeats the editorial read; identity/permissions/UI stay unchanged.
        delete ctx.locals.requestEditorialSession;
        assert.equal(await h.render(ctx, { lang }), html);
      });
    });
  }
}

test('account preview stays minimal and adds no editorial shell lookup', async () => {
  const s = fixture({ cookies: { rg_access_token: 'reader' } });
  const ctx = { cookies: s.cookies, locals: {}, request: new Request('https://example.test/utenti/reader/?accountPreview=1', { headers: { accept: 'text/html' } }), url: new URL('https://example.test/utenti/reader/?accountPreview=1'), routePattern: '/utenti/[username]' };
  await requests.run(s, async () => {
    await h.onRequest(ctx, async () => {});
    const html = await h.render(ctx, { minimal: true });
    assert.match(html, /rg-profile-preview/);
    assert.doesNotMatch(html, /data-sidebar-notifications/);
    assert.equal(s.editorial, 0);
  });
});
