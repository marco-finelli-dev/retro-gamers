import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runs, mark } from './home-ssr-backend.mjs';

export async function loadHomeSSR({ sources = {} } = {}) {
  await mkdir('node_modules/.cache', { recursive: true });
  const directory = await mkdtemp(resolve('node_modules/.cache/home-ssr-'));
  const backend = resolve('tests/helpers/home-ssr-backend.mjs');
  try {
    const built = await build({ stdin: { contents: `export {default as it} from './src/pages/index.astro'; export {default as en} from './src/pages/en/index.astro'; export {default as error} from './src/pages/500.astro'; export {onRequest} from './src/middleware'; export {getNavigationSurvey} from './src/lib/navigation-survey'; export {default as renderer} from './node_modules/@astrojs/react/dist/server.js';`, resolveDir: process.cwd() }, outfile: join(directory, 'home.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', metafile: true, jsx: 'automatic', logLevel: 'silent', define: { 'import.meta.env': JSON.stringify({ PROD: true, DEV: false, PUBLIC_SUPABASE_URL: 'https://offline.invalid', PUBLIC_SUPABASE_ANON_KEY: 'dummy', SUPABASE_SERVICE_ROLE_KEY: 'dummy' }) }, plugins: [{ name: 'isolated-home', setup(b) {
      b.onResolve({ filter: /^@sanity\/client$/ }, () => ({ path: 'sanity', namespace: 'transport' }));
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'supabase', namespace: 'transport' }));
      b.onLoad({ filter: /.*/, namespace: 'transport' }, args => ({ contents: `export { ${args.path === 'sanity' ? 'createSanityClient' : 'createSupabaseClient'} as createClient } from ${JSON.stringify(backend)};` }));
      b.onResolve({ filter: new RegExp(backend.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }, () => ({ path: backend, external: true }));
      b.onResolve({ filter: /^astro:react:opts$/ }, () => ({ path: 'react-options', namespace: 'fixture' }));
      b.onResolve({ filter: /^astro:middleware$/ }, () => ({ path: 'middleware', namespace: 'fixture' }));
      b.onResolve({ filter: /(?:lib\/sanity-preview|common\/SanityVisualEditing)$/ }, args => ({ path: args.path.includes('sanity-preview') ? 'preview' : 'visual', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: ({ 'react-options': 'export default {};', middleware: 'export const defineMiddleware=fn=>fn;', preview: 'export function isDraftMode(){return false;}', visual: 'export default function VisualEditing(){return null;}' })[args.path] }));
      b.onResolve({ filter: /^@vercel\/(analytics|speed-insights)\/astro$/ }, () => ({ path: 'empty', namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, async () => ({ contents: (await transform('<slot />', { internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: process.cwd() }));
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      b.onLoad({ filter: /\.astro$/ }, async args => {
        let source = sources[args.path] ?? await readFile(args.path, 'utf8');
        if (args.path === resolve('src/pages/index.astro') || args.path === resolve('src/pages/en/index.astro')) {
          const end = source.indexOf('\n---', 3);
          source = source.slice(0, end) + `\nimport { mark as markHomeDataReady } from ${JSON.stringify(backend)};\nmarkHomeDataReady('data-ready');\n` + source.slice(end);
        }
        return { contents: (await transform(source, { filename: args.path, internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: dirname(args.path) };
      });
    } }] });
    const modules = await import(pathToFileURL(join(directory, 'home.mjs')));
    const { experimental_AstroContainer } = await import('astro/container');
    const container = await experimental_AstroContainer.create();
    const renderer = modules.renderer;
    container.addServerRenderer({ name: '@astrojs/react', renderer });
    container.addClientRenderer({ name: '@astrojs/react', entrypoint: '@astrojs/react/client.js' });
    return {
      graph: built.metafile.inputs,
      async render(lang, state) {
        const request = new Request(`https://www.retro-gamers.it/${lang === 'en' ? 'en/' : ''}`, { headers: { accept: 'text/html', ...(state.authenticated ? { cookie: 'rg_access_token=fixture-reader' } : {}) } });
        const ctx = { request, url: new URL(request.url), routePattern: lang === 'en' ? '/en' : '/', locals: {}, cookies: { get: name => state.authenticated && name === 'rg_access_token' ? { value: 'fixture-reader' } : undefined } };
        return runs.run(state, async () => {
          mark('request', 'start');
          await modules.onRequest(ctx, async () => {});
          const html = await container.renderToString(modules[lang], { request, locals: ctx.locals, partial: false });
          mark('request', 'end');
          return { html, locals: ctx.locals, state };
        });
      },
      async renderError(state) { return runs.run(state, () => container.renderToString(modules.error, { partial: false, request: new Request('https://www.retro-gamers.it/500/') })); },
      navigation: modules.getNavigationSurvey,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  finally { teardown(); }
}
