import {build} from 'esbuild';
import {transform, teardown} from '@astrojs/compiler';
import {readFile, mkdtemp, mkdir, rm} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

// Execute production normalization/rendering with all database entry points disabled.
export async function loadEditorHarness() {
  await mkdir('node_modules/.cache', {recursive:true});
  const dir=await mkdtemp(resolve('node_modules/.cache/editor-fixture-'));
  const blocked=`export const supabaseAdmin=null; export const logApiError=()=>{};
    export const getSanityRawClient=()=>{throw Error('Network disabled in fixture')};
    export const getSanityWriteClient=getSanityRawClient;
    export const getEditorialSessionFromCookies=getSanityRawClient;`;
  await build({entryPoints:['src/lib/editorial/articles.server.ts'],outfile:join(dir,'normalizer.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'offline',setup(b){
    b.onResolve({filter:/sanity-write\.server|supabase\/server|session\.server|api-errors/},()=>({path:'offline',namespace:'offline'}));
    b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:blocked}));
  }}],logLevel:'silent'});
  await build({entryPoints:['src/components/article/ArticleContent.astro'],outfile:join(dir,'renderer.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':JSON.stringify({PUBLIC_SANITY_PROJECT_ID:'fixture',PUBLIC_SANITY_DATASET:'fixture'})},plugins:[{name:'astro',setup(b){b.onLoad({filter:/\.astro$/},async a=>({contents:(await transform(await readFile(a.path,'utf8'),{filename:a.path,internalURL:'astro/compiler-runtime',resolvePath:x=>x})).code,loader:'ts',resolveDir:dirname(a.path)}));}}],logLevel:'silent'});
  teardown();
  const normalizer=await import(pathToFileURL(join(dir,'normalizer.mjs')));
  const component=(await import(pathToFileURL(join(dir,'renderer.mjs')))).default;
  await rm(dir, {recursive: true, force: true});
  const {experimental_AstroContainer}=await import('astro/container');
  const container=await experimental_AstroContainer.create();
  return {normalize:normalizer.normalizePortableTextContent,render:content=>container.renderToString(component,{props:{content}})};
}
export const textBlock=(key,text,marks=[])=>({_key:key,_type:'block',style:'normal',markDefs:[],children:[{_key:key+'s',_type:'span',text,marks}]});
export const editorFixture=[textBlock('normal','Paragrafo normale'),textBlock('italic','Frase corsiva',['em']),textBlock('bold','Frase grassetto',['strong']),textBlock('both','Frase combinata',['strong','em']),{_key:'line',_type:'divider',style:'line'},textBlock('after','Secondo paragrafo')];
