import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Real layout, Header, mobile menu, rails and desktop sidebar. External reads
// are counted offline; their failure must never cause a legacy catalogue read.
export async function loadLayoutShellHarness() {
  await mkdir('node_modules/.cache', { recursive: true });
  const directory = await mkdtemp(resolve('node_modules/.cache/layout-shell-'));
  const fixtures = {
    posts: `export async function getAllPosts(){globalThis.__layoutReads.catalog++;throw Error('Unexpected legacy catalogue');}`,
    navigation: `export async function getNavigationSurvey(){globalThis.__layoutReads.navigation++;return null;}`,
    editorial: `export async function getEditorialSessionForUserSession(){globalThis.__layoutReads.editorial++;return null;}`,
    surveys: `export function getCommunitySurveyUrl(survey,lang){return (lang==='en'?'/en':'')+'/community/surveys/'+survey.slug+'/';}`,
    preview: `export function isDraftMode(){return false;}`,
    visual: `export default function VisualEditing(){return null;}`,
  };
  try {
    await build({ entryPoints: ['src/layouts/BaseLayout.astro'], outfile: join(directory, 'layout.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env': '{}' }, logLevel: 'silent', plugins: [{ name: 'offline-layout', setup(b) {
      b.onResolve({ filter: /(?:lib\/posts|lib\/navigation-survey|lib\/editorial\/session.server|lib\/community-surveys|lib\/sanity-preview|common\/SanityVisualEditing)$/ }, args => ({ path: args.path.includes('navigation-survey') ? 'navigation' : args.path.includes('session.server') ? 'editorial' : args.path.includes('community-surveys') ? 'surveys' : args.path.includes('sanity-preview') ? 'preview' : args.path.includes('SanityVisualEditing') ? 'visual' : 'posts', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: fixtures[args.path] }));
      b.onResolve({ filter: /^@vercel\/(analytics|speed-insights)\/astro$/ }, () => ({ path: 'empty', namespace: 'analytics' }));
      b.onLoad({ filter: /.*/, namespace: 'analytics' }, async () => ({ contents: (await transform('---\n---', { internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: process.cwd() }));
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      b.onLoad({ filter: /\.astro$/ }, async args => ({ contents: (await transform(await readFile(args.path, 'utf8'), { filename: args.path, internalURL: 'astro/compiler-runtime', resolvePath: async x => x })).code, loader: 'ts', resolveDir: dirname(args.path) }));
    } }] });
    const component = (await import(pathToFileURL(join(directory, 'layout.mjs')))).default;
    const { experimental_AstroContainer } = await import('astro/container');
    const container = await experimental_AstroContainer.create();
    return {
      render: (props = {}, locals = {}) => container.renderToString(component, { request: new Request('https://example.test' + (props.lang === 'en' ? '/en/' : '/') + 'account/login/'), props, locals, slots: { default: '<p>Route content sentinel</p>' }, partial: false }),
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  finally { teardown(); }
}
