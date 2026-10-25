import { build } from 'esbuild';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Execute real middleware, Auth, profile resolution and editorial permission code.
// Only the Supabase transport is replaced. No real account or cookie is used.
export async function loadSessionHarness() {
  await mkdir('node_modules/.cache', { recursive: true });
  const directory = await mkdtemp(resolve('node_modules/.cache/session-'));
  const backend = resolve('tests/helpers/session-backend.mjs');
  try {
    const result = await build({ stdin: { contents: `export * from './src/lib/supabase/auth'; export * from './src/lib/editorial/session.server'; export * from './src/lib/editorial/permissions'; export {onRequest} from './src/middleware'; export {GET as me} from './src/pages/api/auth/me'; export {GET as notifications} from './src/pages/api/account/messages/unread-count'; export {POST as logout} from './src/pages/api/auth/logout';`, resolveDir: process.cwd() }, outfile: join(directory, 'session.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', metafile: true, logLevel: 'silent', define: { 'import.meta.env': JSON.stringify({ PROD: false, PUBLIC_SUPABASE_URL: 'https://offline.invalid', PUBLIC_SUPABASE_ANON_KEY: 'dummy', SUPABASE_SERVICE_ROLE_KEY: 'dummy' }) }, plugins: [{ name: 'isolated-session', setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: backend, external: true }));
      b.onResolve({ filter: /(?:\/admin\/activity\.server|\/supabase\/account-messages|\/supabase\/private-messages)$/ }, () => ({ path: backend, external: true }));
      b.onResolve({ filter: /^astro:middleware$/ }, () => ({ path: 'middleware', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const defineMiddleware = fn => fn;' }));
    } }] });
    return { ...(await import(pathToFileURL(join(directory, 'session.mjs')))), graph: result.metafile.inputs, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

// Read the actual callsite so the before/after runner exercises exactly its arguments.
export async function sourceCall(h, file, name, context, session) {
  const source = await readFile(file, 'utf8');
  const expression = source.match(new RegExp(`\\b${name}\\((?:Astro\\.cookies|viewerSession|initialSession|session)(?:, Astro\\.locals)?\\)`))?.[0];
  if (!expression) throw new Error(`Missing callsite ${file}: ${name}`);
  return new Function(name, 'Astro', 'viewerSession', 'initialSession', 'session', `return ${expression}`)(h[name], context, session, session, session);
}
