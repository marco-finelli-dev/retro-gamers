import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadSessionShellHarness() {
  await mkdir('node_modules/.cache', { recursive: true });
  const directory = await mkdtemp(resolve('node_modules/.cache/session-shell-'));
  try {
    await build({ stdin: { contents: `export {default as layout} from './src/layouts/BaseLayout.astro'; export {onRequest} from './src/middleware'; export * from './src/lib/supabase/auth';`, resolveDir: process.cwd() }, outfile: join(directory, 'shell.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', define: { 'import.meta.env': JSON.stringify({ PROD: false, DEV: false, PUBLIC_SUPABASE_URL: 'https://offline.invalid', PUBLIC_SUPABASE_ANON_KEY: 'dummy', SUPABASE_SERVICE_ROLE_KEY: 'dummy' }) }, plugins: [{ name: 'offline-shell-session', setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: resolve('tests/helpers/session-backend.mjs'), external: true }));
      b.onResolve({ filter: /^astro:middleware$/ }, () => ({ path: 'middleware', namespace: 'fixture' }));
      b.onResolve({ filter: /(?:lib\/navigation-survey|lib\/sanity-preview|common\/SanityVisualEditing)$/ }, args => ({ path: args.path.includes('navigation-survey') ? 'navigation' : args.path.includes('sanity-preview') ? 'preview' : 'visual', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
        middleware: 'export const defineMiddleware=fn=>fn;',
        navigation: 'export async function getNavigationSurvey(){return null;}',
        preview: 'export function isDraftMode(){return false;}',
        visual: 'export default function VisualEditing(){return null;}',
      }[args.path] }));
      b.onResolve({ filter: /^@vercel\/(analytics|speed-insights)\/astro$/ }, () => ({ path: 'empty', namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, async () => ({ contents: (await transform('<slot />', { internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: process.cwd() }));
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      b.onLoad({ filter: /\.astro$/ }, async args => ({ contents: (await transform(await readFile(args.path, 'utf8'), { filename: args.path, internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: dirname(args.path) }));
    } }] });
    const module = await import(pathToFileURL(join(directory, 'shell.mjs')));
    const { experimental_AstroContainer } = await import('astro/container');
    const container = await experimental_AstroContainer.create();
    return { ...module, render: (ctx, props = {}) => container.renderToString(module.layout, { request: ctx.request, locals: ctx.locals, props, slots: { default: '<p>Route body sentinel</p>' }, partial: false }), cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  finally { teardown(); }
}
