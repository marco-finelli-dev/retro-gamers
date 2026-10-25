import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadSurveyPageHarness() {
  await mkdir('node_modules/.cache', { recursive: true });
  const directory = await mkdtemp(resolve('node_modules/.cache/survey-pages-'));
  const backend = resolve('tests/helpers/survey-backend.mjs');
  try {
    await build({
      entryPoints: { it: 'src/pages/community/surveys/[slug].astro', en: 'src/pages/en/community/surveys/[slug].astro' },
      outdir: directory, outExtension: { '.js': '.mjs' }, bundle: true,
      platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
      define: { 'import.meta.env.PROD': 'false' },
      plugins: [{ name: 'offline-survey-pages', setup(b) {
        b.onResolve({ filter: /(?:\/sanity|\/supabase\/server|\/supabase\/community-survey-emails|\/api-errors)$/ }, () => ({ path: backend, external: true }));
        b.onResolve({ filter: /\/image$/ }, () => ({ path: 'image', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const urlFor = () => { throw Error('Unexpected image fixture'); };` }));
        b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
        b.onLoad({ filter: /\.astro$/ }, async args => {
          // Exercise real routes, page, form and error shell; exclude unrelated
          // global navigation/session fetches from this route-level fixture.
          const source = args.path.endsWith('/BaseLayout.astro')
            ? `---\nconst {title,lang,canonical,alternateLanguages}=Astro.props;\n---\n<!doctype html><html lang={lang}><head><title>{title}</title><link rel="canonical" href={canonical}/>{alternateLanguages.map(a=><link rel="alternate" hreflang={a.lang} href={a.url}/>)}</head><body><slot/></body></html>`
            : await readFile(args.path, 'utf8');
          return { contents: (await transform(source, { filename: args.path, internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: dirname(args.path) };
        });
      } }],
    });
    const components = {};
    for (const language of ['it','en']) components[language] = (await import(pathToFileURL(join(directory, language + '.mjs')))).default;
    const { experimental_AstroContainer } = await import('astro/container');
    const container = await experimental_AstroContainer.create();
    return {
      render: (language, slug, cookie = '') => container.renderToResponse(components[language], {
        partial: false, params: { slug }, request: new Request(`https://example.test/${language === 'en' ? 'en/' : ''}community/surveys/${slug}/`, { headers: { cookie } }),
      }),
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  finally { teardown(); }
}
