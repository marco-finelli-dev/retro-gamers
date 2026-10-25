import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compile the actual pages and their complete component tree. Only CSS is
// omitted from server rendering; auth is an in-memory, counted test adapter.
export async function loadErrorShellHarness() {
  await mkdir('node_modules/.cache', { recursive: true });
  const directory = await mkdtemp(resolve('node_modules/.cache/error-shell-'));
  const common = { bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' };
  try {
    const result = await build({ ...common, entryPoints: ['src/pages/404.astro', 'src/pages/500.astro'], outdir: directory, outExtension: { '.js': '.mjs' }, metafile: true, plugins: [{ name: 'actual-error-pages', setup(b) {
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      b.onLoad({ filter: /\.astro$/ }, async args => ({ contents: (await transform(await readFile(args.path, 'utf8'), { filename: args.path, internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: dirname(args.path) }));
    } }] });
    await build({ ...common, entryPoints: ['src/middleware.ts'], outfile: join(directory, 'middleware.mjs'), plugins: [{ name: 'offline-auth', setup(b) {
      b.onResolve({ filter: /^astro:middleware$/ }, () => ({ path: 'middleware', namespace: 'fixture' }));
      b.onResolve({ filter: /\/supabase\/auth$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'middleware' ? 'export const defineMiddleware = fn => fn;' : `export async function getUserSessionFromCookies() { return globalThis.__errorShellAuth(); }` }));
    } }] });
    const load = file => import(pathToFileURL(join(directory, file + '.mjs')));
    const components = { 404: (await load('404')).default, 500: (await load('500')).default };
    const { onRequest } = await load('middleware');
    const { experimental_AstroContainer } = await import('astro/container');
    const container = await experimental_AstroContainer.create({ manifest: { middleware: async () => ({ onRequest }) } });
    return {
      onRequest,
      dependencies: Object.keys(result.metafile.inputs),
      render: status => container.renderToResponse(components[status], { request: new Request(`https://example.test/${status}/`, { headers: { accept: 'text/html' } }), partial: false, props: { error: new Error('PRIVATE STACK SENTINEL') } }),
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally { teardown(); }
}
