import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, runs, loadPublicRoutes, sharedCache } from './helpers/public-cache-harness.mjs';
const before = await loadPublicRoutes({baseline:true}), current = await loadPublicRoutes();
after(async () => { await before.cleanup(); await current.cleanup(); });
const request = (route, headers = {}, query = '') => new Request(`https://www.retro-gamers.it/${route==='search'?'api/search':'sitemap.xml'}${query}`, {headers});
const context = req => ({request:req, get cookies(){throw Error('Endpoint read cookies');}, get locals(){throw Error('Endpoint read identity');}, get url(){throw Error('Endpoint changed language/parameter contract');}});
const invoke = (h, route, s, req=request(route)) => runs.run(s, () => h[route](context(req)));
for (const route of ['search','sitemap']) {
  test(`${route}: byte-identical payload and GROQ, guest and two identities/languages`, async () => {
    const a=fixture(),b=fixture();
    const expected=await (await invoke(before,route,a)).text();
    assert.equal(await (await invoke(current,route,b)).text(),expected);
    assert.deepEqual(b.queries,a.queries);
    for(const headers of [{Cookie:'rg_access_token=alice; rg_refresh_token=a'}, {Cookie:'rg_access_token=bob; rg_lang=en'}, {Authorization:'Bearer dummy'}, {'Accept-Language':'en'}, {'Cookie':'preferences=light'}]) {
      const response=await invoke(current,route,fixture(),request(route,headers));
      assert.equal(await response.text(),expected);assert.equal(response.headers.has('set-cookie'),false);
      assert.doesNotMatch(expected,/alice|bob|Bearer|rg_access_token|private diagnostic/);
      assert.equal(response.headers.get('cache-control'),headers.Cookie||headers.Authorization?'private, no-store, max-age=0':`public, max-age=0, s-maxage=${route==='search'?60:300}, must-revalidate`);
    }
  });
  test(`${route}: full URL keys, all params retained, no language/filter crossover`, async () => {
    const s=fixture(),edge=sharedCache(r=>invoke(current,route,s,r));
    const variants=['?lang=it&q=Amiga&type=review&page=1','?lang=en&q=Amiga&type=review&page=1','?lang=it&q=Capcom&type=news&page=2'];
    const outputs=[];
    for(const q of variants) {outputs.push(await (await edge.get(request(route,{},q))).text());await edge.get(request(route,{},q));}
    assert.equal(edge.misses,3);assert.equal(s.queries.length,route==='search'?3:21);
    assert.equal(new Set(outputs).size,1); // Existing endpoint returns the full bilingual index/XML; UI selects language.
  });
  test(`${route}: bounded expiry exposes publication/update/withdrawal; no permanent stale`, async () => {
    const s=fixture(),edge=sharedCache(r=>invoke(current,route,s,r));
    const initial=await (await edge.get(request(route))).text();
    s.articles[0].slug='updated-article';s.articles[0].lastUpdated='2026-10-25';s.articles[1].isPublic=false;
    s.articles.push({title:'New article',slug:'new-article',type:'news',language:'en',publishedAt:'2026-10-25'});
    assert.equal(await (await edge.get(request(route, {Cookie:'rg_access_token=bob'}))).text(), initial); // Cached PUBLIC data is safe for every reader.
    edge.advance(route==='search'?60:300);
    const refreshed=await (await edge.get(request(route))).text();
    assert.match(refreshed,/updated-article/);assert.match(refreshed,/new-article/);assert.doesNotMatch(refreshed,/final-fight-en/);
    assert.equal(edge.misses,2);
  });
  test(`${route}: Sanity errors are 503/no-store, no partial success or secret; next request recovers`, async () => {
    const s=fixture(),edge=sharedCache(r=>invoke(current,route,s,r));
    await edge.get(request(route));edge.advance(301);s.failure='all';
    const response=await edge.get(request(route));assert.equal(response.status,503);assert.match(response.headers.get('cache-control'),/private, no-store/);
    assert.equal(response.headers.get('retry-after'),'60');assert.doesNotMatch(await response.text(),/diagnostic|token|urlset/);
    s.failure=null;assert.equal((await edge.get(request(route))).status,200);assert.equal(edge.misses,3);
  });
  test(`${route}: concurrent users never share personal state; authorization and cookie misses not stored`, async () => {
    const edge=sharedCache(r=>invoke(current,route,fixture(),r));
    const responses=await Promise.all(['alice','bob'].map(user=>edge.get(request(route,{Cookie:`rg_access_token=${user}`}))));
    assert.equal(await responses[0].text(),await responses[1].text());assert.equal(edge.misses,2);
    await edge.get(request(route,{Authorization:'Bearer dummy'}));await edge.get(request(route,{Authorization:'Bearer dummy'}));assert.equal(edge.misses,4);
  });
}
test('sitemap: seven sources overlap, unchanged deterministic XML, canonical IT/EN URLs and escaping', async () => {
  const s=fixture({delays:{articles:5,creators:5,authors:5,platforms:5,companies:5,classics:5,tools:5}});
  const xml=await (await invoke(current,'sitemap',s)).text();
  assert.equal(s.queries.length,7);assert.deepEqual(s.queries.map(q=>q.kind).sort(),['articles','authors','classics','companies','creators','platforms','tools']);assert.equal(s.events.slice(0,7).every(e=>e.phase==='start'),true);
  assert.match(xml,/<\?xml version="1.0" encoding="UTF-8"\?>/);assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  for(const path of ['/recensioni/final-fight/','/en/reviews/final-fight-en/','/piattaforme/computer/sharp/sharp-x68000/','/en/platforms/computers/sharp/sharp-x68000/'])assert.ok(xml.includes('https://www.retro-gamers.it'+path));
  const locs=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);assert.equal(locs.length,new Set(locs).size);assert.equal(locs.every(url=>url.startsWith('https://www.retro-gamers.it/')),true);
  s.articles[0].slug='escaped&value';assert.match(await (await invoke(current,'sitemap',s)).text(),/escaped&amp;value/);
});
for(const source of ['articles','creators','authors','platforms','companies','classics','tools'])test(`sitemap: ${source} failure never caches partial XML`,async()=>{assert.equal((await invoke(current,'sitemap',fixture({failure:source}))).status,503);});
test('published filters and CDN client remain explicit, preview is never selected',async()=>{
  const s=fixture({articles:[...fixture().articles,{_id:'drafts.secret',slug:'draft-secret',title:'Draft'},{slug:'withdrawn',isPublic:false}]});
  const text=await (await invoke(current,'search',s)).text();assert.doesNotMatch(text,/draft-secret|withdrawn/);
  assert.match(s.queries[0].query,/coalesce\(isPublic, true\) == true/);assert.match(s.queries[0].query,/drafts\.\*\*/);
  const sanity=await readFile('src/lib/sanity.js','utf8');assert.match(sanity,/publicClient = createClient\(\{[\s\S]*?useCdn: true,[\s\S]*?perspective: 'published'/);assert.match(sanity,/export const client = publicClient/);
});
test('middleware: search skips session; sitemap XML skips session; HTML+auth preserves refresh but stays private', async()=>{
  for(const [route,accept] of [['search','text/html'],['sitemap','application/xml'],['sitemap','text/html']]) {
    const req=request(route,{Accept:accept,Cookie:'rg_access_token=expired; rg_refresh_token=dummy'}),writes=[];
    const response=await runs.run(fixture(),()=>current.onRequest({request:req,url:new URL(req.url),routePattern:route==='search'?'/api/search':'/sitemap.xml',locals:{},cookies:{set:(...args)=>writes.push(args)}},()=>current[route]({request:req})));
    assert.equal(writes.length,route==='sitemap'&&accept==='text/html'?1:0);assert.match(response.headers.get('cache-control'),/private, no-store/);
    assert.doesNotMatch(await response.text(),/fixture-user|refreshed/);
  }
});
test('empty published dataset remains valid; error 404 shell, quiz/survey/auth policies are not part of the cache',async()=>{
  const empty=fixture({articles:[],platforms:[],authors:[],creators:[],companies:[],classics:[],tools:[]});
  assert.deepEqual(await (await invoke(current,'search',empty)).json(),{articles:[],platforms:[],taxonomies:[]});
  assert.match(await (await invoke(current,'sitemap',empty)).text(),/<urlset/);
  for(const file of ['src/pages/404.astro','src/lib/quiz-server.ts','src/lib/community-surveys.ts','src/pages/api/auth/me.ts'])assert.doesNotMatch(await readFile(file,'utf8'),/publicContentResponse|s-maxage=/);
});
