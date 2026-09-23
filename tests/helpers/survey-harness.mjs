import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function loadSurveyHarness() {
  const directory = await mkdtemp(join(tmpdir(), 'rg-survey-tests-'));
  const backend = resolve('tests/helpers/survey-backend.mjs');
  await build({ entryPoints: {
    get: 'src/pages/api/community/surveys/[surveyKey].ts',
    post: 'src/pages/api/community/surveys/[surveyKey]/responses.ts',
    engine: 'src/lib/community-surveys.ts',
  }, outdir: directory, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm',
    define: { 'import.meta.env.PROD': 'false' },
    plugins: [{ name: 'isolated-survey-storage', setup(build) {
      build.onResolve({ filter: /(?:\/sanity|\/supabase\/server|\/supabase\/community-survey-emails|\/api-errors)$/ }, () => ({ path: backend, external: true }));
    } }],
  });
  return { get: (await import(pathToFileURL(join(directory, 'get.mjs')))).GET,
    post: (await import(pathToFileURL(join(directory, 'post.mjs')))).POST,
    engine: await import(pathToFileURL(join(directory, 'engine.mjs'))) };
}
export function cookieJar(initial = {}) {
  const values = new Map(Object.entries(initial)); const settings = [];
  return { get: key => values.has(key) ? { value: values.get(key) } : undefined,
    set: (key, value, options) => { values.set(key,value); settings.push(options); }, values, settings };
}
