import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {loadSemanticHarness,leaderboardRenderer,dom,nodes,attr,text,hasClass,post} from './helpers/semantic-harness.mjs';
const h=await loadSemanticHarness();after(h.cleanup);
const headings=html=>nodes(dom(html)).filter(n=>/^h[1-6]$/.test(n.tagName));
for(const lang of ['it','en']) {
  for(const [kind,props] of [['review',{reviewListing:true}],['editorial',{editorialListing:true,desktopTitle:'News'}],['generic',{}]]) {
    test(`archive ${kind}/${lang}: actual SSR cards start at h2, valid non-colliding region`,async()=>{
      const html=await h.render('archive',{...props,title:lang==='en'?'Archive':'Archivio',posts:[{...post,language:lang}],lang,showFilters:false});
      const tree=nodes(dom(html)),titles=tree.filter(n=>hasClass(n,'rg-editorial-title'));
      assert.equal(titles.length,1);assert.equal(titles[0].tagName,'h2');assert.equal(text(titles[0]),post.title);
      assert.equal(attr(tree.find(n=>hasClass(n,'archive-grid')),'aria-label'),lang==='en'?'Archive — results':'Archivio — risultati');
      assert.ok(tree.some(n=>n.tagName==='a'&&attr(n,'href')===(lang==='en'?'/en/reviews/final-fight/':'/recensioni/final-fight/')));
    });
  }
  test(`card ${lang}: reusable subsection stays h3, explicit listing h2 preserves content/link/badge`,async()=>{
    const a=await h.render('card',{post,lang}),b=await h.render('card',{post,lang,headingLevel:2});
    assert.equal(headings(a)[0].tagName,'h3');assert.equal(headings(b)[0].tagName,'h2');
    assert.equal(a.replaceAll('h3','h2'),b);
  });
  test(`resources ${lang}: native parsed headings non-empty, exactly one AMIGA 4 EVER`,async()=>{
    const hs=headings(await h.render(lang==='en'?'resourcesEn':'resources'));
    assert.equal(hs.filter(n=>n.tagName==='h1').length,1);assert.ok(hs.every(n=>text(n).trim()));
    assert.equal(hs.filter(n=>text(n).trim()==='AMIGA 4 EVER!').length,1);
    assert.ok(hs.every((n,i)=>!i||Number(n.tagName[1])<=Number(hs[i-1].tagName[1])+1));
  });
  for(const staff of [false,true])test(`rank ${staff?'staff':'public'}/${lang}: accessible position, preserved order, podium and scores`,async()=>{
    const render=await leaderboardRenderer(staff);
    const entries=[1,2,3,4,11].map(rank=>({rank,displayName:'QA <reader>',username:'reader',correctCount:20-rank,totalQuestions:20,totalElapsedMs:10500,isCurrentUser:rank===11}));
    const rows=nodes(dom(entries.map(e=>render(e,{you:'You',score:'Score',time:'Time'},lang)).join(''))).filter(n=>hasClass(n,'quiz-leaderboard__row'));
    assert.equal(rows.length,5);
    rows.forEach((row,i)=>{
      const ns=nodes(row),rank=ns.find(n=>hasClass(n,'quiz-leaderboard__rank')),hidden=nodes(rank).find(n=>attr(n,'aria-hidden')==='true'),sr=nodes(rank).find(n=>hasClass(n,'sr-only'));
      assert.equal(attr(rank,'aria-label'),undefined);assert.equal(text(sr),`${lang==='en'?'Position':'Posizione'} ${entries[i].rank}`);
      assert.equal(text(hidden),['Ⅰ','Ⅱ','Ⅲ','4','11'][i]);assert.equal(hasClass(row,'is-podium'),i<3);
      assert.ok(text(row).includes(`${entries[i].correctCount} / 20`));assert.ok(text(row).includes('11 s'));
      assert.ok(ns.some(n=>n.tagName==='a'&&attr(n,'href')===(lang==='en'?'/en/users/reader/':'/utenti/reader/')));
      assert.equal(ns.some(n=>n.tagName==='reader'),false); // Escaping retained.
    });
    const ssr=nodes(dom(await h.render(staff?'staff':'leaderboard',{slug:'fixture',language:lang})));
    assert.equal(ssr.find(n=>attr(n,'aria-live')==='polite')?.tagName,'p');
  });
  test(`Home utility ${lang}: layout group retains named inner sections, no nested complementary`,async()=>{
    const tree=nodes(dom(await h.render('lower',{lang}))),utility=tree.find(n=>hasClass(n,'rg-lower-editorial__utility'));
    assert.equal(utility.tagName,'div');assert.equal(attr(utility,'aria-label'),undefined);
    assert.ok(nodes(utility).filter(n=>n.tagName==='section'&&attr(n,'aria-labelledby')).length>=2);
  });
}
test('article inset is an informational note, content and heading preserved',async()=>{
 const tree=nodes(dom(await h.render('content',{content:[{_type:'asideBox',tone:'info',title:'Hardware note',content:[{_type:'block',style:'normal',children:[{_type:'span',text:'Readable detail',marks:[]}],markDefs:[]}]}]})));
 const note=tree.find(n=>hasClass(n,'article-aside-box'));assert.equal(note.tagName,'div');assert.equal(attr(note,'role'),'note');
 assert.ok(text(note).includes('Readable detail'));assert.equal(nodes(note).find(n=>n.tagName==='h3')?.childNodes[0].value,'Hardware note');
});

test('staff endpoint: guest/readers/authors denied, admin/moderator only; unchanged rank and score',async()=>{
 const {loadStaffPermissionHarness}=await import('./helpers/semantic-harness.mjs');const endpoint=await loadStaffPermissionHarness();
 try {
  for(const role of [null,'user','author','admin','moderator']) {
   globalThis.__semanticStaff={session:{user:role?{id:'fixture'}:null,profile:role?{role}:null},reads:0};
   const response=await endpoint.GET({cookies:{},url:new URL('https://example.test/api/quiz/staff-leaderboard?slug=fixture&language=it&limit=10')});
   const allowed=role==='admin'||role==='moderator';assert.equal(response.status,allowed?200:403);assert.equal(globalThis.__semanticStaff.reads,allowed?1:0);
   assert.equal(response.headers.get('cache-control'),'private, no-store');const body=await response.json();
   if(allowed){assert.equal(body.leaderboard[0].rank,1);assert.equal(body.leaderboard[0].correctCount,19);}else assert.equal(body.leaderboard,undefined);
  }
 } finally{delete globalThis.__semanticStaff;await endpoint.cleanup();}
});
