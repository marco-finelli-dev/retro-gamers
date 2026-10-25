import { build } from 'esbuild';
import { transform, teardown } from '@astrojs/compiler';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { parseFragment } from 'parse5';

export const nodes = root => [root, ...(root.childNodes || []).flatMap(nodes)];
export const attr = (node, key) => node.attrs?.find(a => a.name === key)?.value;
export const text = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
export const hasClass = (node, name) => (attr(node, 'class') || '').split(/\s+/).includes(name);
export const dom = html => parseFragment(html);
export const post = { title: 'Final Fight', slug: 'final-fight', type: 'review', language: 'it', publishedAt: '2026-01-01', rating: {overall: 9}, platforms: [], categories: [], excerpt: 'Fixture published article' };

export async function loadSemanticHarness() {
  await mkdir('node_modules/.cache', {recursive:true});
  const dir = await mkdtemp(resolve('node_modules/.cache/semantic-'));
  const entries = {card:'src/components/cards/ReviewCard.astro', archive:'src/components/archive/ArchivePage.astro', lower:'src/components/home/LowerEditorial.astro', content:'src/components/article/ArticleContent.astro', resources:'src/pages/risorse/index.astro', resourcesEn:'src/pages/en/resources/index.astro', leaderboard:'src/components/quiz/QuizLeaderboard.astro', staff:'src/components/quiz/QuizStaffLeaderboard.astro'};
  try {
    await build({entryPoints:entries,outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',define:{'import.meta.env':JSON.stringify({PUBLIC_SANITY_PROJECT_ID:'fixture',PUBLIC_SANITY_DATASET:'fixture'})},plugins:[{name:'offline-semantic-components',setup(b){
      b.onResolve({filter:/\/sanity$/},()=>({path:'sanity',namespace:'fixture'}));
      b.onResolve({filter:/\/comment-counts$/},()=>({path:'counts',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='sanity'?"export const client={fetch(){throw Error('Network forbidden in semantic tests')}};":"export async function withApprovedCommentCounts(posts){return posts}"}));
      b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
      b.onLoad({filter:/\.astro$/},async a=>{
        const source=a.path.endsWith('/BaseLayout.astro')?'---\n---\n<main><slot /></main>':await readFile(a.path,'utf8');
        return {contents:(await transform(source,{filename:a.path,internalURL:'astro/compiler-runtime',resolvePath:async x=>x})).code,loader:'ts',resolveDir:dirname(a.path)};
      });
    }}]});
    const components={};for(const name of Object.keys(entries))components[name]=(await import(pathToFileURL(join(dir,name+'.mjs')))).default;
    const {experimental_AstroContainer}=await import('astro/container'); const container=await experimental_AstroContainer.create();
    return {render:(name,props={})=>container.renderToString(components[name],{props,request:new Request('https://example.test/')}),cleanup:()=>rm(dir,{recursive:true,force:true})};
  } catch(e){await rm(dir,{recursive:true,force:true});throw e;} finally{teardown();}
}

// Execute the actual client row renderer, then parse its generated HTML with
// the HTML parser. No source-string assertions or replica rendering logic.
export async function leaderboardRenderer(staff=false) {
  const source=await readFile(`src/components/quiz/${staff?'QuizStaffLeaderboard':'QuizLeaderboard'}.astro`,'utf8');
  const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const name=staff?'renderQuizStaffLeaderboardRow':'renderLeaderboardRow';
  return runInNewContext(script+`; ${name}`,{document:{querySelectorAll:()=>[]}});
}

// Real endpoint and real staff-role policy, with session and read transport
// isolated. A denied role must never reach the staff RPC.
export async function loadStaffPermissionHarness() {
  await mkdir('node_modules/.cache',{recursive:true});
  const dir=await mkdtemp(resolve('node_modules/.cache/semantic-staff-'));
  try {
    await build({entryPoints:['src/pages/api/quiz/staff-leaderboard.ts'],outfile:join(dir,'endpoint.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',define:{'import.meta.env':JSON.stringify({PUBLIC_SUPABASE_URL:'https://offline.invalid',PUBLIC_SUPABASE_ANON_KEY:'dummy',SUPABASE_SERVICE_ROLE_KEY:'dummy'})},plugins:[{name:'isolated-staff-reads',setup(b){
      b.onResolve({filter:/auth\.ts$/},a=>({path:a.path,namespace:'file'}));
      b.onResolve({filter:/\/supabase\/auth$/},()=>({path:'auth',namespace:'fixture'}));
      b.onResolve({filter:/\/supabase\/server$/},()=>({path:'server',namespace:'fixture'}));
      b.onResolve({filter:/\/quiz$/},()=>({path:'quiz',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:({
        auth:`export {isStaffProfile} from ${JSON.stringify(resolve('src/lib/supabase/auth.ts'))}; export async function getUserSessionFromCookies(){return globalThis.__semanticStaff.session;}`,
        server:'export const supabasePublic=null; export const supabaseAdmin={rpc:async()=>{globalThis.__semanticStaff.reads++;return {data:[{rank:1,username:"staff",correct_count:19,total_questions:20,total_elapsed_ms:20000}]}}};',
        quiz:'export const MAX_QUESTIONS_PER_ATTEMPT=20; export const getQuizQuestionsPerAttempt=()=>20;export async function getPublishedQuizBySlug(){return {_id:"quiz-fixture",quizKey:"fixture-quiz"}};',
      })[a.path]}));
    }}]});
    return {...(await import(pathToFileURL(join(dir,'endpoint.mjs')))),cleanup:()=>rm(dir,{recursive:true,force:true})};
  } catch(e){await rm(dir,{recursive:true,force:true});throw e;}
}
