import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadLayoutShellHarness } from './helpers/layout-shell-harness.mjs';
const harness = await loadLayoutShellHarness();
after(harness.cleanup);
for (const lang of ['it', 'en']) {
  test(`actual shell ${lang}: missing/empty/partial/stale editorial props never fetch a catalogue or change HTML`, async () => {
    globalThis.__layoutReads = { catalog: 0, navigation: 0, editorial: 0 };
    try {
      const baseline = await harness.render({ lang });
      for (const props of [{ reviews: [], news: [] }, { reviews: [{ title: 'Unused sentinel' }] }, { news: [{ title: 'Unused sentinel' }] }]) {
        assert.equal(await harness.render({ lang, ...props }), baseline);
      }
      assert.equal(globalThis.__layoutReads.catalog, 0);
      assert.equal(globalThis.__layoutReads.navigation, 4);
      assert.match(baseline, /Route content sentinel/);
      assert.match(baseline, /article-desktop-sidebar/);
      assert.match(baseline, /data-mobile-menu/);
      assert.match(baseline, /data-theme-choice/);
      assert.match(baseline, /MAGAZINE/);
      assert.match(baseline, lang === 'en' ? /\/en\/reviews\// : /\/recensioni\//);
      assert.doesNotMatch(baseline, /Unused sentinel/);
    } finally { delete globalThis.__layoutReads; }
  });
}
test('minimal shell performs neither navigation nor catalogue reads', async () => {
  globalThis.__layoutReads = { catalog: 0, navigation: 0, editorial: 0 };
  try { const html = await harness.render({ minimal: true }); assert.match(html, /Route content sentinel/); assert.deepEqual(globalThis.__layoutReads, { catalog: 0, navigation: 0, editorial: 0 }); }
  finally { delete globalThis.__layoutReads; }
});

test('necessary public and preview datasets are retained at their real consumers', async () => {
  for (const path of ['src/pages/index.astro', 'src/pages/en/index.astro', 'src/pages/recensioni/index.astro', 'src/pages/en/reviews/index.astro', 'src/pages/news/index.astro', 'src/pages/en/news/index.astro', 'src/pages/piattaforme/[type]/[manufacturer]/[platform].astro']) {
    assert.match(await readFile(path, 'utf8'), /await getAllPosts\(\)/, path);
  }
  for (const path of ['src/pages/[category]/[slug].astro', 'src/pages/en/[category]/[slug].astro']) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /getSanityClient\(isPreview\)/);
    assert.match(source, /getRelatedPosts\(hydratedPost, publicPostSummaries, 3\)/);
  }
  const preview = await readFile('src/components/editorial/EditorialArticlePreviewPage.astro', 'utf8');
  for (const fn of ['requireEditorialArticleContext', 'fetchPreviewableEditorialArticle', 'fetchEditorialArticlePreviewPost', 'fetchEditorialArticlePreviewRelatedPostCandidates', 'fetchEditorialArticlePreviewSeriesPosts']) assert.match(preview, new RegExp(fn+'\\('));
  assert.doesNotMatch(preview, /getPublicPostSummaries|headerReviews|headerNews/);
});

test('catalogue-free routes do not reintroduce indirect legacy menu datasets', async () => {
  for (const path of ['src/layouts/BaseLayout.astro', 'src/pages/creatori/[slug].astro', 'src/pages/en/creators/[slug].astro', 'src/pages/aziende/[slug].astro', 'src/pages/en/companies/[slug].astro', 'src/pages/quiz/[slug].astro', 'src/pages/en/quiz/[slug].astro', 'src/components/community/CommunitySurveyPage.astro', 'src/components/playable-classics/PlayableClassicsIndex.astro', 'src/components/emulator-tools/EmulatorToolsIndex.astro', 'src/pages/privacy-policy.astro', 'src/pages/en/privacy-policy.astro']) assert.doesNotMatch(await readFile(path, 'utf8'), /getAllPosts|groupPosts|providedReviews|providedNews/, path);
});
