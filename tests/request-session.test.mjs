import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { loadSessionHarness } from './helpers/session-harness.mjs';
import { requests, fixture } from './helpers/session-backend.mjs';

const h = await loadSessionHarness();
after(() => h.cleanup());
const user = (id = 'alice', options = {}) => fixture({ cookies: { rg_access_token: id }, ...options });
const session = (s, locals = {}) => h.getUserSessionFromCookies(s.cookies, locals);
const context = (s, path = '/', routePattern = path) => ({ cookies: s.cookies, locals: {}, url: new URL(`https://example.test${path}`), request: new Request(`https://example.test${path}`, { headers: { accept: 'text/html' } }), routePattern });

test('guest: repeated consumers never contact Auth or the database', async () => {
  const s = fixture(), locals = {};
  await requests.run(s, async () => {
    const values = await Promise.all([session(s, locals), session(s, locals)]);
    assert.equal(values[0], values[1]); assert.equal(values[0].status, 401);
  });
  assert.equal(s.auth + s.profiles + s.editorial + s.refresh, 0);
});

test('same request: middleware, consumers and editorial context share authoritative promises', async () => {
  const s = user(), ctx = context(s);
  await requests.run(s, async () => {
    await h.onRequest(ctx, async () => {});
    const values = await Promise.all(Array.from({ length: 12 }, () => session(s, ctx.locals)));
    assert.ok(values.every(value => value === ctx.locals.userSession));
    const editorial = await Promise.all(values.map(value => h.getEditorialSessionForUserSession(value, ctx.locals)));
    assert.ok(editorial.every(value => value === editorial[0]));
    assert.equal(editorial[0].user.id, 'alice');
  });
  assert.equal(s.auth, 1); assert.equal(s.profiles, 1); assert.equal(s.editorial, 1);
});

for (const token of ['malformed', 'expired', 'revoked']) {
  test(`${token}: invalid identity is never upgraded by reuse`, async () => {
    const s = user(token), locals = {};
    await requests.run(s, async () => {
      for (let i = 0; i < 3; i++) {
        const value = await session(s, locals);
        assert.equal(value.status, 401); assert.equal(value.user, null);
        const editorial = await h.getEditorialSessionForUserSession(value, locals);
        assert.equal(editorial.isEditorialActive, false);
      }
    });
    assert.equal(s.auth, 1); assert.equal(s.profiles + s.editorial, 0);
  });
}

test('refresh: one rotation for parallel callers; new cookies require revalidation', async () => {
  const s = fixture({ cookies: { rg_access_token: 'expired', rg_refresh_token: 'refresh' } }), locals = {};
  await requests.run(s, async () => {
    const values = await Promise.all([session(s, locals), session(s, locals)]);
    assert.equal(values[0], values[1]); assert.equal(values[0].refreshed, true);
    assert.equal(values[0].user.id, 'renewed'); assert.equal(s.refresh, 1); assert.equal(s.cookieWrites, 2);
    const next = await session(s, locals);
    assert.equal(next.user.id, 'renewed'); assert.equal(next.refreshed, false);
    assert.equal(s.refresh, 1); assert.equal(s.auth, 3);
  });
});

test('failed refresh remains unauthorized and does not write cookies', async () => {
  const s = fixture({ cookies: { rg_access_token: 'expired', rg_refresh_token: 'refresh' }, refreshFails: true }), locals = {};
  await requests.run(s, async () => {
    assert.equal((await session(s, locals)).status, 401);
    assert.equal((await session(s, locals)).user, null);
  });
  assert.equal(s.refresh, 1); assert.equal(s.cookieWrites, 0);
});

for (const role of ['reader', 'admin', 'moderator']) {
  test(`${role}: staff distinction and editorial permissions survive reuse`, async () => {
    const s = user(role, { role }), locals = {};
    await requests.run(s, async () => {
      const value = await session(s, locals);
      assert.equal(h.isStaffProfile(value.profile), role !== 'reader');
      assert.equal(value.profile.role === 'admin', role === 'admin');
      const editorial = await h.getEditorialSessionForUserSession(value, locals);
      assert.equal(h.canManageEditorialMappings(editorial), role === 'admin');
      assert.equal(editorial.permissions.canPublishArticle, false);
      assert.equal(await h.getEditorialSessionForUserSession(value, locals), editorial);
    });
  });
}

test('blocked profile and suspended editorial status retain their denials', async () => {
  const blocked = user('alice', { status: 'blocked' });
  await requests.run(blocked, async () => {
    const value = await session(blocked);
    assert.equal(value.status, 403);
    const editorial = await h.getEditorialSessionForUserSession(value, {});
    assert.equal(editorial.user, null); assert.equal(editorial.authStatus, 403);
  });
  const suspended = user('alice', { editorialStatus: 'suspended' });
  await requests.run(suspended, async () => {
    const value = await session(suspended);
    const editorial = await h.getEditorialSessionForUserSession(value, {});
    assert.equal(editorial.isEditorialActive, false);
    assert.ok(Object.values(editorial.permissions).every(value => value === false));
  });
});

test('concurrent users and guest/admin requests never share identity or editorial data', async () => {
  const states = [user('alice'), user('bob'), fixture(), user('staff', { role: 'admin' })];
  const values = await Promise.all(states.map(s => requests.run(s, async () => {
    const locals = {};
    const value = await session(s, locals);
    return h.getEditorialSessionForUserSession(value, locals);
  })));
  assert.deepEqual(values.map(v => v.user?.id ?? null), ['alice', 'bob', null, 'staff']);
  assert.deepEqual(values.map(v => v.sanityAuthorId), ['author-alice', 'author-bob', null, 'author-staff']);
  assert.equal(values[2].profile, null);
});

test('successive requests revalidate even for the same token; revocation takes effect', async () => {
  const first = user(), second = user('alice', { revoked: true });
  const a = await requests.run(first, () => session(first));
  const b = await requests.run(second, () => session(second));
  assert.equal(a.user.id, 'alice'); assert.equal(b.user, null);
  assert.equal(first.auth, 1); assert.equal(second.auth, 1);
});

test('cookie replacement, deletion and refresh-token-only changes invalidate reuse', async () => {
  const s = user(), locals = {};
  await requests.run(s, async () => {
    const a = await session(s, locals);
    await h.getEditorialSessionForUserSession(a, locals);
    h.setAuthSessionCookies(s.cookies, { access_token: 'bob' });
    const b = await session(s, locals);
    const editorial = await h.getEditorialSessionForUserSession(b, locals);
    assert.equal(editorial.user.id, 'bob'); assert.equal(s.editorial, 2);
    s.cookies.set('rg_refresh_token', 'new-refresh');
    assert.notEqual(await session(s, locals), b);
    h.clearAuthSessionCookies(s.cookies);
    assert.equal((await session(s, locals)).user, null);
  });
});

test('old in-flight verification cannot poison the cache for replacement cookies', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const s = user('alice', { wait: () => gate }), locals = {};
  await requests.run(s, async () => {
    const a = session(s, locals);
    s.cookies.set('rg_access_token', 'bob');
    const b = session(s, locals);
    release();
    assert.equal((await a).user.id, 'alice'); assert.equal((await b).user.id, 'bob');
    assert.equal(await session(s, locals), await b); assert.equal(s.auth, 2);
  });
});

test('Auth exceptions propagate and are retryable, never a valid cached identity', async () => {
  const s = user('alice', { authThrows: true }), locals = {};
  await requests.run(s, async () => {
    await assert.rejects(session(s, locals), /Auth unavailable/);
    assert.equal(locals.requestUserSession, undefined);
    s.authThrows = false;
    assert.equal((await session(s, locals)).user.id, 'alice');
  });
  assert.equal(s.auth, 2);
});

test('profile and editorial service errors keep original status and permissions', async () => {
  const s = user('alice', { profileError: { message: 'profile unavailable' } });
  await requests.run(s, async () => {
    const value = await session(s);
    assert.equal(value.status, 500); assert.equal(value.profile, null);
  });
  const missing = user('alice', { missingProfile: true });
  await requests.run(missing, async () => assert.equal((await session(missing)).status, 404));
  const editorialError = user('alice', { editorialError: { message: 'editorial unavailable' } });
  await requests.run(editorialError, async () => {
    const value = await h.getEditorialSessionForUserSession(await session(editorialError), {});
    assert.equal(value.editorialProfileError, 'editorial unavailable');
    assert.equal(value.isEditorialActive, false);
  });
});

test('sensitive callers without locals remain fresh even in the same request', async () => {
  const s = user();
  await requests.run(s, async () => {
    await h.getUserSessionFromCookies(s.cookies);
    s.revoked = true;
    assert.equal((await h.getUserSessionFromCookies(s.cookies)).status, 401);
  });
  assert.equal(s.auth, 2);
});

test('middleware preserves redirects, language, API exclusion and autonomous error routes', async () => {
  const s = user();
  await requests.run(s, async () => {
    const redirect = await h.onRequest(context(s, '/home/'), () => assert.fail('redirect must stop'));
    assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), 'https://example.test/');
    for (const [path, pattern] of [['/404/', '/404'], ['/500/', '/500'], ['/unknown/', '/404'], ['/api/auth/me/', '/api/auth/me']]) {
      const ctx = context(s, path, pattern);
      await h.onRequest(ctx, async () => {});
      assert.deepEqual(ctx.locals, {});
    }
    assert.equal(s.auth, 0);
    const ctx = context(s, '/en/');
    await h.onRequest(ctx, async () => {});
    assert.equal(ctx.locals.effectiveLanguage, 'en'); assert.equal(ctx.locals.languageSessionOverride, null);
  });
});

test('auth/me response never serializes cache entries or session tokens', async () => {
  const s = user('alice'), ctx = context(s, '/api/auth/me/');
  await requests.run(s, async () => {
    await session(s, ctx.locals);
    const response = await h.me(ctx), text = await response.text();
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(JSON.parse(text).user.id, 'alice');
    assert.doesNotMatch(text, /requestUserSession|requestEditorialSession|accessToken|refreshToken|rg_access_token|rg_refresh_token/);
  });
  assert.equal(s.auth, 2); // API deliberately does not trust the SSR cache.
});

test('runtime auth import graph has no cycles or dependencies on middleware/layouts', () => {
  const graph = h.graph, visiting = new Set(), visited = new Set();
  function walk(path) {
    assert.equal(visiting.has(path), false, `cycle: ${path}`);
    if (visited.has(path) || !graph[path]) return;
    visiting.add(path);
    for (const edge of graph[path].imports) if (!edge.external) walk(edge.path);
    visiting.delete(path); visited.add(path);
  }
  for (const path of Object.keys(graph)) walk(path);
  for (const path of ['src/lib/supabase/auth.ts', 'src/lib/editorial/session.server.ts']) {
    assert.ok(graph[path].imports.every(edge => !/middleware|\.astro$/.test(edge.path)));
  }
});

test('real logout handler clears cookies and invalidates same-context SSR identity', async () => {
  const s = user(), ctx = context(s);
  await requests.run(s, async () => {
    assert.equal((await session(s, ctx.locals)).user.id, 'alice');
    assert.equal((await h.logout(ctx)).status, 200);
    assert.equal((await session(s, ctx.locals)).user, null);
  });
});

test('real notifications endpoint keeps private responses and admin-only activity reads', async () => {
  for (const role of ['reader', 'moderator', 'admin']) {
    const s = user(role, { role }), ctx = context(s, '/api/account/messages/unread-count/');
    await requests.run(s, async () => {
      const response = await h.notifications(ctx);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const payload = await response.json();
      assert.equal(payload.unreadCount, 3);
      assert.equal(payload.adminUnreadCount, role === 'admin' ? 4 : 0);
      assert.equal(s.auth, 1); assert.equal(s.profiles, 1);
      assert.equal(s.adminUnreadReads || 0, role === 'admin' ? 1 : 0);
    });
  }
  const guest = fixture();
  await requests.run(guest, async () => {
    const response = await h.notifications(context(guest));
    assert.equal((await response.json()).unreadCount, 0);
    assert.equal(guest.accountUnreadReads, undefined);
  });
});
