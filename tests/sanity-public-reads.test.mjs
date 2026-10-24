import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSanityReadHarness } from './helpers/sanity-read-harness.mjs';
import { loadSurveyHarness, cookieJar } from './helpers/survey-harness.mjs';
import { state, reset } from './helpers/survey-backend.mjs';
import { HOME_SURVEY_KEY } from '../src/lib/home-survey.ts';

const harness = await loadSanityReadHarness();
const api = await loadSurveyHarness();
after(harness.cleanup);
const source = file => readFile(file, 'utf8');
const seedNavigation = () => {
  reset();
  for (const language of ['it', 'en']) {
    const document = structuredClone(state.documents.find(d => d.language === language));
    state.documents.push({ ...document, _id: `navigation-${language}`, surveyKey: 'community-survey-2026', slug: 'community-survey-2026' });
  }
};

test('public clients use CDN with or without a server token; fresh and preview stay direct', async () => {
  const original = process.env.SANITY_API_READ_TOKEN;
  try {
    delete process.env.SANITY_API_READ_TOKEN;
    const anonymous = await harness.loadConfig('anonymous');
    assert.equal(anonymous.getPublishedCdnReadClient(), anonymous.publicClient);
    assert.equal(anonymous.publicClient.config().useCdn, true);
    assert.equal(anonymous.getPublishedReadClient().config().useCdn, false);
    process.env.SANITY_API_READ_TOKEN = 'offline-test-token';
    const authenticated = await harness.loadConfig('authenticated');
    const published = authenticated.getPublishedCdnReadClient().config();
    assert.equal(published.useCdn, true);
    assert.equal(published.token, 'offline-test-token');
    assert.equal(published.perspective, 'published');
    assert.equal(published.apiVersion, '2024-01-01');
    assert.equal(authenticated.getPublishedReadClient().config().useCdn, false);
    assert.equal(authenticated.getSanityClient(false).config().useCdn, true);
    const preview = authenticated.getSanityClient(true).config();
    assert.equal(preview.useCdn, false);
    assert.equal(preview.perspective, 'drafts');
    assert.equal(preview.stega.enabled, true);
  } finally {
    if (original === undefined) delete process.env.SANITY_API_READ_TOKEN;
    else process.env.SANITY_API_READ_TOKEN = original;
  }
});

test('actual shell plus article CTA resolve the survey once, regardless of render order, IT/EN', async () => {
  for (const language of ['it', 'en']) for (const ctaFirst of [true, false]) {
    seedNavigation();
    const html = (await harness.render(language, {}, ctaFirst)).join('');
    assert.equal(state.reads.length, 1);
    assert.equal(state.reads[0].transport, 'cdn');
    assert.equal(state.reads[0].params.language, language);
    assert.match(html, /Critical page content/);
    assert.equal((html.match(/href="[^"]*community\/surveys\/community-survey-2026\/"/g) || []).length, 4);
    assert.match(html, /article-survey-cta/);
  }
});

test('concurrent consumers share a promise only within one request and language', async () => {
  seedNavigation();
  const locals = {};
  const results = await Promise.all(Array.from({ length: 4 }, () => harness.navigation.getNavigationSurvey(locals, 'it')));
  assert.equal(state.reads.length, 1);
  assert.ok(results.every(result => result === results[0]));
  await harness.navigation.getNavigationSurvey(locals, 'en');
  await harness.navigation.getNavigationSurvey({}, 'it');
  assert.equal(state.reads.length, 3);
});

test('failed optional survey still renders real shell/content with fallback and no repeated attempts', async () => {
  seedNavigation(); state.failSanity = true;
  const html = (await harness.render()).join('');
  assert.match(html, /Critical page content/);
  assert.match(html, /href="\/community\/"/);
  assert.doesNotMatch(html, /class="article-survey-cta"/);
  assert.equal(state.reads.length, 1);
  assert.deepEqual(state.logs, ['navigation.survey']);
});

test('both article routes use the tested preview-aware client without a fresh override', async () => {
  for (const file of ['src/pages/[category]/[slug].astro', 'src/pages/en/[category]/[slug].astro']) {
    const text = await source(file);
    assert.match(text, /const sanityClient = getSanityClient\(isPreview\)/);
    assert.match(text, /const articleDetailClient = sanityClient;/);
    assert.match(text, /await articleDetailClient\.fetch\(/);
    assert.doesNotMatch(text, /publicFreshClient/);
  }
});

test('quiz detail uses CDN while start/answer/next runtime reads remain direct', async () => {
  reset();
  await harness.quiz.getPublishedQuizBySlug('test', 'it');
  await harness.quiz.getPublishedQuizRuntimeBySlug('test', 'it');
  await harness.quiz.getPublishedQuizRuntimeById('test');
  assert.deepEqual(state.reads.map(r => r.transport), ['cdn', 'direct', 'direct']);
});

test('survey GET uses CDN but stays private; submit validation and admin stay direct', async () => {
  reset();
  const cookies = cookieJar();
  const response = await api.get({ params: { surveyKey: HOME_SURVEY_KEY }, url: new URL('https://example.test/?language=it'), cookies });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(state.reads.map(r => r.transport), ['cdn']);
  await api.engine.submitCommunitySurveyResponse({ surveyKey: HOME_SURVEY_KEY, language: 'it', cookies, answers: [] });
  await api.engine.getCommunitySurveyAdminList();
  assert.deepEqual(state.reads.map(r => r.transport), ['cdn', 'direct', 'direct']);
});

test('public survey failures still propagate outside optional navigation', async () => {
  reset(); state.failSanity = true;
  const response = await api.get({ params: { surveyKey: HOME_SURVEY_KEY }, url: new URL('https://example.test/?language=it'), cookies: cookieJar() });
  assert.equal(response.status, 500);
  await assert.rejects(api.engine.getPublishedCommunitySurveyBySlug('test', 'it'), /Isolated Sanity outage/);
});
