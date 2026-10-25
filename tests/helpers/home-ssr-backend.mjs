// Deterministic, isolated transports; no production credentials or network.
import { AsyncLocalStorage } from 'node:async_hooks';
export const runs = new AsyncLocalStorage();
const image = { asset: { url: 'https://cdn.sanity.io/images/y88ky0mu/production/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1200x800.webp' }, alt: 'Fixture image' };
export function fixture(options = {}) {
  const posts = ['it', 'en'].flatMap(language => Array.from({ length: 60 }, (_, i) => ({
    _id: `${language}-${i}`, slug: `${language}-post-${i}`, language,
    title: `${language.toUpperCase()} story ${i}`, excerpt: `Excerpt ${i}`, subtitle: `Subtitle ${i}`,
    type: ['review', 'news', 'feature', 'interview', 'guide', 'hardware'][i % 6],
    featuredImage: i === 59 ? null : image, publishedAt: new Date(Date.UTC(2026, 8, 20, 0, -i)).toISOString(),
    categories: [{ name: 'Storia', nameEn: 'History', slug: 'storia' }],
    rating: { overall: 8.5 }, monetization: { isAffiliate: i % 6 === 5, productType: 'hardware' },
    platforms: [{ name: 'Amiga 500', slug: 'amiga-500' }], developers: [{ name: 'Fixture Studio', slug: 'fixture-studio' }],
  })));
  const data = Object.fromEntries(['it', 'en'].map(language => [language, {
    classics: [{ _id: `classic-${language}`, slug: `classic-${language}`, title: `Classic ${language}`, language, coverImage: image, platforms: [{ name: 'Amiga 500' }] }],
    tools: [{ _id: `tool-${language}`, slug: `tool-${language}`, title: `Tool ${language}`, language, logo: image, toolType: 'emulator' }],
    quizzes: [{ _id: `quiz-${language}`, slug: `quiz-${language}`, title: `Quiz ${language}`, language, coverImage: image, questionCount: 20, publishedAt: '2026-09-01' }],
    survey: [{ _id: `survey-${language}`, slug: `survey-${language}`, title: `Survey ${language}`, language, surveyKey: 'community-fixture', status: 'open', questions: [{ questionId: 'q', text: 'Question', type: 'single', options: [{ optionId: 'a', label: 'A' }, { optionId: 'b', label: 'B' }] }] }],
  }]));
  return { origin: performance.now(), events: [], queries: [], posts, data, delays: {}, failures: {}, ...options };
}
export function mark(name, phase = 'mark', extra = {}) {
  const s = runs.getStore(); s.events.push({ name, phase, ms: performance.now() - s.origin, ...extra });
}
async function operation(name, result, extra = {}) {
  const s = runs.getStore(); mark(name, 'start', extra);
  try {
    await s.gates?.[name]?.();
    const delay = s.delays[name] || 0;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (s.failures[name]) throw Object.assign(new Error(`Offline ${name} failure`), { statusCode: s.failures[name] });
    return result();
  } finally { mark(name, 'end', extra); }
}
export function createSanityClient(config) {
  return {
    config: () => config,
    fetch(query, params = {}) {
      const s = runs.getStore();
      const type = query.match(/_type == "(\w+)"/)?.[1];
      const name = ({ article: 'posts', playableClassic: 'classics', emulatorTool: 'tools', quiz: 'quizzes', communitySurvey: 'survey' })[type];
      if (!name) throw new Error(`Unexpected GROQ type ${type}`);
      const lang = params.lang || params.language;
      s.queries.push({ name, query, params, cdn: config.useCdn, perspective: config.perspective });
      return operation(name, () => structuredClone(s.empty || s.missing === name ? null : name === 'posts' ? s.posts : s.data[lang][name]), { lang, cdn: config.useCdn });
    },
  };
}
export function createSupabaseClient() {
  return {
    auth: {
      getUser: token => operation('auth', () => ({ data: { user: { id: token, email: `${token}@example.test` } }, error: null })),
      refreshSession: () => { throw new Error('Unexpected refresh'); },
    },
    from(table) {
      const filters = {};
      const execute = () => {
        const s = runs.getStore();
        const name = ({ profiles: 'profile', editorial_profiles: 'editorial', comments: 'comments', newsletter_subscribers: 'newsletter' })[table];
        if (!name) throw new Error(`Unexpected table ${table}`);
        return operation(name, () => {
          if (s.databaseError === name) return { data: null, error: { code: 'offline', message: 'Offline service unavailable' } };
          const data = table === 'profiles' ? { user_id: filters.user_id, username: filters.user_id, role: 'reader', status: 'active' }
            : table === 'editorial_profiles' ? null
            : table === 'newsletter_subscribers' ? { id: 'newsletter-fixture', user_id: filters.user_id, status: s.subscription || 'none', language: 'it' }
            : filters.article_slug.map(article_slug => ({ article_slug, article_language: filters.article_language }));
          return { data, error: null };
        }, { filters });
      };
      return {
        select() { return this; }, eq(k, v) { filters[k] = v; return this; }, is(k, v) { filters[k] = v; return this; }, in(k, v) { filters[k] = v; return this; },
        maybeSingle: execute, then: (ok, fail) => execute().then(ok, fail),
      };
    },
  };
}
