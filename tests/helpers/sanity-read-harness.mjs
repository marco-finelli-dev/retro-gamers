import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadSanityReadHarness() {
  await mkdir('node_modules/.cache', { recursive: true });
  const directory = await mkdtemp(resolve('node_modules/.cache/sanity-reads-'));
  const backend = resolve('tests/helpers/survey-backend.mjs');
  const define = { 'import.meta.env': JSON.stringify({ DEV: false, PROD: false }) };
  const common = { bundle: true, platform: 'node', format: 'esm', packages: 'external', define, logLevel: 'silent' };
  const mockStorage = b => {
    b.onResolve({ filter: /(?:\/sanity|\/supabase\/server|\/supabase\/community-survey-emails|\/api-errors)$/ }, () => ({ path: backend, external: true }));
  };
  try {
    await build({ ...common, entryPoints: { config: 'src/lib/sanity.js' }, outdir: directory, outExtension: { '.js': '.mjs' } });
    await build({ ...common, entryPoints: { navigation: 'src/lib/navigation-survey.ts', quiz: 'src/lib/quiz.ts' }, outdir: directory, outExtension: { '.js': '.mjs' }, plugins: [{ name: 'offline-storage', setup: mockStorage }] });
    const kept = /(?:BaseLayout|Header|NavigationRails|MobileMenu|ArticleDesktopSidebar|ArticleSurveyCta)\.astro$/;
    await build({ ...common, entryPoints: { layout: 'src/layouts/BaseLayout.astro', cta: 'src/components/article/ArticleSurveyCta.astro' }, outdir: directory, outExtension: { '.js': '.mjs' }, plugins: [{ name: 'offline-astro', setup(b) {
      mockStorage(b);
      b.onResolve({ filter: /(?:\/editorial\/session\.server|\/posts)$/ }, () => ({ path: 'page-data', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const getEditorialSessionForUserSession=async()=>null; export const getAllPosts=async()=>[];` }));
      b.onResolve({ filter: /^(?:@vercel\/|.*\/SanityVisualEditing$)/ }, () => ({ path: resolve('tests/helpers/omitted.astro'), namespace: 'omitted' }));
      b.onLoad({ filter: /.*/, namespace: 'omitted' }, async () => ({ contents: (await transform('<slot />', { internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: resolve('.') }));
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      b.onLoad({ filter: /\.astro$/ }, async args => ({ contents: (await transform(kept.test(args.path) ? await readFile(args.path, 'utf8') : '<slot />', { filename: args.path, internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: dirname(args.path) }));
    } }] });
    const load = name => import(pathToFileURL(join(directory, name + '.mjs')));
    const configUrl = pathToFileURL(join(directory, 'config.mjs'));
    const navigation = await load('navigation');
    const quiz = await load('quiz');
    const layout = (await load('layout')).default;
    const cta = (await load('cta')).default;
    const { experimental_AstroContainer } = await import('astro/container');
    const container = await experimental_AstroContainer.create();
    return {
      navigation, quiz,
      loadConfig: marker => import(configUrl.href + '?' + marker),
      render: async (lang = 'it', locals = {}, ctaFirst = false) => {
        const options = { locals, props: { lang, reviews: [{}], news: [{}] }, request: new Request(`https://example.test/${lang === 'en' ? 'en/' : ''}`) };
        const renderCta = () => container.renderToString(cta, options);
        const renderLayout = () => container.renderToString(layout, { ...options, slots: { default: '<p>Critical page content</p>' } });
        return ctaFirst ? [await renderCta(), await renderLayout()] : [await renderLayout(), await renderCta()];
      },
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally { teardown(); }
}
