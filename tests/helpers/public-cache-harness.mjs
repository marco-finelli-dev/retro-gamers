import { AsyncLocalStorage } from 'node:async_hooks';
import { build } from 'esbuild';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const runs = new AsyncLocalStorage();
export function fixture(options = {}) {
  return {
    queries: [], events: [], delays: {}, failure: null,
    articles: [
      { title: 'Final Fight', slug: 'final-fight', type: 'review', language: 'it', publishedAt: '2026-01-01', categories: [{ slug: 'arcade' }] },
      { title: 'Final Fight EN', slug: 'final-fight-en', type: 'review', language: 'en', publishedAt: '2026-01-01', categories: [{ slug: 'arcade' }] },
    ],
    creators: [{ name: 'Creator & Co', slug: 'creator' }],
    authors: [{ name: 'Author', slug: 'author', _updatedAt: '2026-01-02' }],
    platforms: [{ name: 'Sharp X68000', slug: 'sharp-x68000', platformType: 'computer', manufacturer: { name: 'Sharp', slug: 'sharp' } }],
    companies: [{ name: 'Capcom', slug: 'capcom' }],
    classics: [{ title: 'Classic', slug: 'classic', language: 'it' }],
    tools: [{ title: 'Tool', slug: 'tool', language: 'en' }],
    ...options,
  };
}
function queryKind(query) {
  if (query.includes('"articles":')) return 'search';
  return [ ['article','articles'], ['creator','creators'], ['author','authors'], ['platform','platforms'], ['taxonomy','companies'], ['playableClassic','classics'], ['emulatorTool','tools'] ].find(([type]) => query.match(/_type == "([^"]+)"/)?.[1] === type)?.[1];
}
export const client = { async fetch(query, params) {
  const state = runs.getStore();
  if (!state) throw Error('No isolated public-cache fixture');
  const kind = queryKind(query);
  if (!kind) throw Error('Unexpected query');
  state.queries.push({ kind, query, params });
  state.events.push({ kind, phase: 'start', time: performance.now() });
  if (state.delays[kind]) await new Promise(r => setTimeout(r, state.delays[kind]));
  state.events.push({ kind, phase: 'end', time: performance.now() });
  if (state.failure === kind || state.failure === 'all') throw Error('Synthetic Sanity outage; private diagnostic must not escape');
  // The fixture represents the published projection returned by the unchanged GROQ.
  const articles = state.articles.filter(x => x.isPublic !== false && !x._id?.startsWith('drafts.'));
  return structuredClone(kind === 'search' ? { articles, platforms: state.platforms, taxonomies: state.companies } : kind === 'articles' ? articles : state[kind]);
} };

export async function loadPublicRoutes({ baseline = false } = {}) {
  await mkdir(resolve('node_modules/.cache'), { recursive: true });
  const dir = await mkdtemp(resolve('node_modules/.cache/public-cache-'));
  const sources = {};
  if (baseline) {
    // Reconstruct only the pre-fix response wrappers and seven serial awaits.
    let search = await readFile('src/pages/api/search.js', 'utf8');
    search = search.replace(/import \{ publicContentResponse[^\n]+\n/, '').replace('async function getSearchIndex()', 'export async function GET()');
    search = search.slice(0, search.indexOf('  return JSON.stringify(data);')) + "  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });\n}\n";
    sources[resolve('src/pages/api/search.js')] = search;
    let sitemap = await readFile('src/pages/sitemap.xml.ts', 'utf8');
    sitemap = sitemap.replace(/import \{ publicContentResponse[^\n]+\n/, '').replace('async function buildSitemap()', 'export async function GET()');
    sitemap = sitemap.replace(/  const \[posts, creators, authors, platforms, companies, playableClassics, emulatorTools\] = await Promise\.all\(\[[\s\S]*?\n  \]\);/, '  const posts = await getAllPosts();\n  const creators = await getAllCreators();\n  const authors = await getSitemapAuthors();\n  const platforms = await getAllPlatforms();\n  const companies = await getAllCompanies();\n  const playableClassics = await getPlayableClassicRoutes();\n  const emulatorTools = await getEmulatorToolSlugs();');
    sitemap = sitemap.slice(0, sitemap.indexOf('  return body;')) + "  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });\n}\n";
    sources[resolve('src/pages/sitemap.xml.ts')] = sitemap;
  }
  await build({ stdin: { contents: `export {GET as search} from './src/pages/api/search.js';export {GET as sitemap} from './src/pages/sitemap.xml.ts';export {onRequest} from './src/middleware.ts';`, resolveDir: process.cwd() }, outfile: join(dir, 'routes.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'isolated-public-data', setup(b) {
    b.onResolve({ filter: /(?:^|\/)sanity$/ }, () => ({ path: 'sanity', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export {client} from ${JSON.stringify(fileURLToPath(import.meta.url))};` }));
    b.onResolve({ filter: /^astro:middleware$/ }, () => ({ path: 'middleware', namespace: 'middleware-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'middleware-fixture' }, () => ({ contents: 'export const defineMiddleware = x => x;' }));
    b.onResolve({ filter: /supabase\/auth$/ }, () => ({ path: 'auth', namespace: 'auth-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'auth-fixture' }, () => ({ contents: 'export async function getUserSessionFromCookies(cookies, locals) { cookies.set("refreshed", "dummy"); return {user:{id:"fixture-user"}}; }' }));
    b.onResolve({ filter: /public-cache-harness\.mjs$/ }, args => ({ path: args.path, external: true }));
    b.onLoad({ filter: /\.(js|ts)$/ }, args => sources[args.path] ? { contents: sources[args.path], loader: 'ts' } : undefined);
  } }] });
  return { ...(await import(pathToFileURL(join(dir, 'routes.mjs')))), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

// Deterministic HTTP shared-cache model for policy tests, NOT application code
// or a claim about hosted Vercel hits. Clock and origin are fully controlled.
export function sharedCache(origin) {
  const entries = new Map();
  let now = 0, misses = 0;
  return {
    advance(seconds) { now += seconds; },
    get misses() { return misses; },
    async get(request) {
      const key = request.url;
      const entry = entries.get(key);
      if (!request.headers.has('authorization') && entry?.until > now) return entry.response.clone();
      misses++;
      const response = await origin(request);
      const cc = response.headers.get('cache-control') || '';
      const ttl = Number(/s-maxage=(\d+)/.exec(cc)?.[1] || 0);
      if (response.status === 200 && ttl && !response.headers.has('set-cookie') && !/private|no-store/.test(cc) && !request.headers.has('authorization')) entries.set(key, { until: now + ttl, response: response.clone() });
      return response;
    },
  };
}
