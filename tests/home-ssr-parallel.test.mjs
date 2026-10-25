import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadHomeSSR } from './helpers/home-ssr-harness.mjs';
import { fixture, runs } from './helpers/home-ssr-backend.mjs';

// Serial control uses the same current route/markup, putting the comment-count
// dependency back in front of the existing three-way published-module group.
const serialSources = {};
for (const path of ['src/pages/index.astro', 'src/pages/en/index.astro']) {
  const source = await readFile(path, 'utf8');
  serialSources[resolve(path)] = source.replace(
    /const \[\s*homeCommentCountMap,\s*playableClassics,\s*emulatorTools,\s*quizzes\s*\] = await Promise\.all\(\[\s*(getApprovedCommentCountMap\([\s\S]*?\n  \)),\s*(getHomePlayableClassics[\s\S]*?)\n\]\);/,
    'const homeCommentCountMap = await $1;\nconst [playableClassics, emulatorTools, quizzes] = await Promise.all([$2\n]);',
  );
}
const parallel = await loadHomeSSR(), serial = await loadHomeSSR({ sources: serialSources });
after(async () => { await parallel.cleanup(); await serial.cleanup(); });
const starts = s => s.events.filter(e => e.phase === 'start');
const queries = s => s.queries.toSorted((a, b) => a.name.localeCompare(b.name));
const counts = s => Object.fromEntries([...new Set(starts(s).map(e => e.name))].sort().map(name => [name, starts(s).filter(e => e.name === name).length]));

for (const lang of ['it', 'en']) {
  for (const authenticated of [false, true]) {
    test(`${lang}/${authenticated ? 'user' : 'guest'}: identical full SSR HTML, queries, filters and middleware session`, async () => {
      const before = fixture({ authenticated }), afterState = fixture({ authenticated });
      const a = await serial.render(lang, before), b = await parallel.render(lang, afterState);
      assert.equal(b.html, a.html);
      assert.deepEqual(queries(afterState), queries(before));
      assert.equal(afterState.queries.length, 5);
      assert.ok(afterState.queries.every(q => q.cdn && q.perspective === 'published'));
      assert.deepEqual(counts(afterState), counts(before));
      assert.equal(starts(afterState).filter(e => e.name === 'auth').length, authenticated ? 1 : 0);
      assert.equal(starts(afterState).filter(e => e.name === 'newsletter').length, authenticated ? 1 : 0);
      assert.equal(starts(afterState).filter(e => e.name === 'editorial').length, authenticated ? 1 : 0);
      assert.match(b.html, new RegExp(`https://www.retro-gamers.it/${lang === 'en' ? 'en/' : ''}`));
      assert.doesNotMatch(b.html, /dummy|requestUserSession|requestEditorialSession/);
      assert.equal(await runs.run(afterState, () => parallel.navigation(b.locals, lang)), await b.locals.navigationSurveys.get(lang));
      assert.equal(afterState.queries.filter(q => q.name === 'survey').length, 1);
    });
  }

  test(`${lang}: independent fetches overlap, posts remain first and survey stays after success`, async () => {
    const s = fixture({ delays: { comments: 45, classics: 20, tools: 15, quizzes: 10 } });
    await parallel.render(lang, s);
    const end = name => s.events.find(e => e.name === name && e.phase === 'end').ms;
    const start = name => s.events.find(e => e.name === name && e.phase === 'start').ms;
    for (const name of ['comments', 'classics', 'tools', 'quizzes']) assert.ok(start(name) >= end('posts'));
    for (const name of ['classics', 'tools', 'quizzes']) assert.ok(start(name) < end('comments'));
    assert.ok(start('survey') >= Math.max(...['comments', 'classics', 'tools', 'quizzes'].map(end)));
  });

  for (const options of [{ empty: true }, { missing: 'classics' }, { missing: 'tools' }, { missing: 'quizzes' }, { missing: 'survey' }, { databaseError: 'comments' }, { databaseError: 'newsletter', authenticated: true }, { authenticated: true, subscription: 'active' }]) {
    test(`${lang}: same output and requests for ${JSON.stringify(options)}`, async () => {
      const a = fixture(options), b = fixture(options);
      const before = await serial.render(lang, a), afterState = await parallel.render(lang, b);
      assert.equal(afterState.html, before.html); assert.deepEqual(queries(a), queries(b));
      assert.deepEqual(counts(a), counts(b));
    });
  }

  for (const status of [403, 429, 503, 'timeout']) {
    test(`${lang}: critical posts ${status} prevents ALL downstream fetches and error shell is autonomous`, async () => {
      for (const h of [serial, parallel]) {
        const s = fixture({ failures: { posts: status }, delays: { posts: 3 } });
        await assert.rejects(h.render(lang, s), error => error.statusCode === status);
        assert.deepEqual(s.queries.map(q => q.name), ['posts']);
        assert.deepEqual(starts(s).map(e => e.name), ['request', 'posts']);
        const length = s.events.length;
        assert.match(await h.renderError(s), /Qualcosa è andato storto/);
        assert.equal(s.events.length, length);
      }
    });
  }

  test(`${lang}: published module failure is still critical, with no later survey/newsletter fetch or unhandled rejection`, async () => {
    const unhandled = []; const listener = e => unhandled.push(e);
    process.on('unhandledRejection', listener);
    try {
      for (const h of [serial, parallel]) {
        const s = fixture({ failures: { classics: 503, quizzes: 429 }, delays: { classics: 2, quizzes: 5, tools: 8 } });
        await assert.rejects(h.render(lang, s), /Offline classics failure/);
        await new Promise(resolve => setTimeout(resolve, 15));
        assert.deepEqual(s.queries.map(q => q.name).sort(), ['posts', 'classics', 'tools', 'quizzes'].sort());
        assert.equal(starts(s).filter(e => e.name === 'newsletter' || e.name === 'survey').length, 0);
      }
      assert.deepEqual(unhandled, []);
    } finally { process.off('unhandledRejection', listener); }
  });

  test(`${lang}: accessory survey outage retains Community fallback and 200 SSR`, async () => {
    const a = fixture({ failures: { survey: 503 } }), b = fixture({ failures: { survey: 503 } });
    const before = await serial.render(lang, a), afterState = await parallel.render(lang, b);
    assert.equal(before.html, afterState.html); assert.deepEqual(queries(a), queries(b));
    assert.match(afterState.html, /href="\/(?:en\/)?community\/"/);
  });
}

test('barrier detects real concurrency and rejects a serial regression (negative control)', async () => {
  for (const [h, expected] of [[parallel, 4], [serial, 1]]) {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const names = ['comments', 'classics', 'tools', 'quizzes'];
    const s = fixture({ gates: Object.fromEntries(names.map(name => [name, () => gate])) });
    const pending = h.render('it', s);
    try {
      await new Promise(resolve => setTimeout(resolve, 20));
      const n = starts(s).filter(e => names.includes(e.name)).length;
      assert.equal(n, expected);
      if (h === serial) assert.throws(() => assert.equal(n, 4));
    } finally { release(); await pending; }
  }
});

test('simultaneous IT/EN requests retain separate survey cache, filters, content and identity', async () => {
  const a = fixture(), b = fixture({ authenticated: true });
  const [it, en] = await Promise.all([parallel.render('it', a), parallel.render('en', b)]);
  assert.notEqual(it.locals, en.locals); assert.notEqual(it.locals.navigationSurveys, en.locals.navigationSurveys);
  assert.match(it.html, /IT story/); assert.doesNotMatch(it.html, /EN story/);
  assert.match(en.html, /EN story/); assert.doesNotMatch(en.html, /IT story/);
  for (const [s, lang] of [[a, 'it'], [b, 'en']]) for (const q of s.queries.filter(q => q.name !== 'posts')) assert.equal(q.params.lang || q.params.language, lang);
});

test('one slow service changes waiting time only, not the result or request count', async () => {
  const options = { delays: { comments: 65, tools: 10 } }, a = fixture(options), b = fixture(options);
  assert.equal((await serial.render('it', a)).html, (await parallel.render('it', b)).html);
  assert.deepEqual(queries(a), queries(b));
});

test('no runtime import cycle introduced by Home routes', () => {
  const visiting = new Set(), visited = new Set(), graph = parallel.graph;
  function visit(path) {
    if (!graph[path] || visited.has(path)) return;
    assert.ok(!visiting.has(path), `cycle: ${path}`); visiting.add(path);
    for (const edge of graph[path].imports) if (!edge.external) visit(edge.path);
    visiting.delete(path); visited.add(path);
  }
  for (const path of Object.keys(graph)) visit(path);
});
