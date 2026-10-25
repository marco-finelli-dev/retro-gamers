import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { experimental_AstroContainer } from 'astro/container';

await mkdir(resolve('node_modules/.cache'), { recursive: true });
const temp = await mkdtemp(resolve('node_modules/.cache/layout-stability-'));
after(async () => { teardown(); await rm(temp, { recursive: true, force: true }); });
await build({ stdin: { contents: `export {default as article} from './src/components/article/ArticlePage.astro'; export {default as platform} from './src/components/platforms/PlatformDetail.astro'; export {getSanityImageSize} from './src/lib/sanity-image-size';`, resolveDir: process.cwd() }, outfile: join(temp, 'components.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'silent', define: { 'import.meta.env': JSON.stringify({ PROD: true, DEV: false, PUBLIC_SUPABASE_URL: "https://offline.invalid", PUBLIC_SUPABASE_ANON_KEY: "dummy", SUPABASE_SERVICE_ROLE_KEY: "dummy" }) }, plugins: [{ name: 'astro-components', setup(b) {
  b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'no-network', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient=()=>({from(){throw new Error("Unexpected database read in layout test")},auth:{}});' }));
  b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  b.onLoad({ filter: /\.astro$/ }, async args => ({ contents: (await transform(await readFile(args.path, 'utf8'), { filename: args.path, internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: dirname(args.path) }));
} }] });
const components = await import(pathToFileURL(join(temp, 'components.mjs')));
const container = await experimental_AstroContainer.create();
const image = (w, h) => ({ asset: { url: `https://cdn.sanity.io/images/y88ky0mu/production/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-${w}x${h}.webp` } });

for (const lang of ['it', 'en']) for (const dimensions of [[1200,900],[900,1200],null]) {
  test(`article ${lang}/${dimensions}: one early cover, body before context, no invented space when absent`, async () => {
    const post = { title: 'Layout test', slug: 'layout-test', language: lang, type: 'interview', content: [], featuredImage: dimensions ? image(...dimensions) : null };
    const html = await container.renderToString(components.article, { props: { post, disableCommunity: true, isPreview: true, hideNewsletterPromo: true } });
    const body = html.indexOf('<article class="article-page__content"');
    const sidebar = html.indexOf('<aside class="article-page__sidebar');
    assert.ok(body > 0 && sidebar > body);
    const covers = [...html.matchAll(/<figure class="article-lead-image"/g)];
    assert.equal(covers.length, dimensions ? 1 : 0);
    if (dimensions) {
      assert.ok(covers[0].index < body);
      assert.match(html.slice(covers[0].index, body), new RegExp(`width="${dimensions[0]}" height="${dimensions[1]}"`));
    }
  });
}
for (const lang of ['it', 'en']) {
  test(`platform ${lang}: header parsed before visual/specs; original images reserve their ratio`, async () => {
    const platform = { name: 'Sharp X68000 — a deliberately long complete platform name', slug:'sharp-x68000', platformType:'computer', cover:image(1600,1000), logo:image(900,200), manufacturer:{name:'Sharp',slug:'sharp',logo:image(700,200)}, specs:{year:1987,cpu:'Motorola 68000'}, history:'History', historyEn:'History' };
    const html = await container.renderToString(components.platform, {props:{platform,lang}});
    assert.ok(html.indexOf('<header class="platform-sheet__header"') < html.indexOf('<div class="platform-sheet__visual"'));
    assert.ok(html.indexOf('<div class="platform-sheet__visual"') < html.indexOf('<section class="platform-sheet__specs"'));
    assert.match(html, /width="1400" height="875"[^>]+class="platform-sheet__cover"/);
    assert.match(html, /width="700" height="200"[^>]+class="platform-sheet__manufacturer-logo/);
    assert.ok(html.includes(platform.name));
  });
}
test('Sanity dimensions: landscape, portrait, crop rectangle, max-size and unknown URL', () => {
  const get=components.getSanityImageSize, base=image(1600,1000).asset.url;
  assert.deepEqual(get(base+'?w=1400'),{width:1400,height:875});
  assert.deepEqual(get(image(900,1200).asset.url+'?w=600'),{width:600,height:800});
  assert.deepEqual(get(base+'?w=700&rect=10,20,1400,700'),{width:700,height:350});
  assert.deepEqual(get(base+'?w=2000&fit=max'),{width:1600,height:1000});
  for(const value of ['',null,'/logo.svg','https://example.test/logo-100x100.png',base+'?rect=0,0,0,0',base+'?w=100&h=100'])assert.deepEqual(get(value),{});
});
