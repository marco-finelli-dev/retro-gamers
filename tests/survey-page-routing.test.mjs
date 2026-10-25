import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { loadSurveyPageHarness } from './helpers/survey-page-harness.mjs';
import { reset, state, supabaseAdmin } from './helpers/survey-backend.mjs';

const harness = await loadSurveyPageHarness();
after(harness.cleanup);
const seed = () => {
  reset();
  for (const doc of state.documents) {
    doc.slug = doc.language === 'it' ? 'community-survey-2026' : 'community-survey-2026-en';
    doc.translatedVersion = { _id: 'translation', title: 'Translation', slug: doc.language === 'it' ? 'community-survey-2026-en' : 'community-survey-2026', language: doc.language === 'it' ? 'en' : 'it' };
  }
};
const render = async (lang, slug) => {
  const before = JSON.stringify([state.responses, state.answers]);
  const response = await harness.render(lang, slug);
  const html = await response.text();
  assert.equal(response.headers.get('location'), null);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(JSON.stringify([state.responses, state.answers]), before);
  assert.deepEqual(state.reads.map(r => r.transport), ['cdn']);
  assert.match(state.reads[0].query, /language == \$language/);
  assert.match(state.reads[0].query, /!\(_id in path\("drafts\.\*\*"\)\)/);
  assert.match(html, new RegExp(`<html lang="${lang}"`));
  return { response, html };
};
for (const lang of ['it','en']) {
  const validSlug = lang === 'it' ? 'community-survey-2026' : 'community-survey-2026-en';
  test(`${lang}: valid published route renders actual form and localized metadata once`, async () => {
    seed();const {response,html}=await render(lang,validSlug);
    assert.equal(response.status,200);assert.match(html, /<form/);
    assert.ok(html.includes(`https://www.retro-gamers.it/${lang==='en'?'en/':''}community/surveys/${validSlug}/`));
    assert.match(html,/hreflang="it"/);assert.match(html,/hreflang="en"/);
  });
  for (const scenario of ['missing','wrong-language','draft-status','draft-document','withdrawn']) {
    test(`${lang}: ${scenario} returns nonempty 404 without response/session reads`, async () => {
      seed();const doc=state.documents.find(d=>d.language===lang);let slug=validSlug;
      if(scenario==='missing')slug='does-not-exist';
      if(scenario==='wrong-language')slug=lang==='it'?'community-survey-2026-en':'community-survey-2026';
      if(scenario==='draft-status')doc.status='draft';
      if(scenario==='draft-document')doc._id='drafts.'+doc._id;
      if(scenario==='withdrawn')state.documents=[];
      const original=supabaseAdmin.from;supabaseAdmin.from=()=>{throw Error('Error shell must not read Supabase');};
      try {const {response,html}=await render(lang,slug);assert.equal(response.status,404);assert.match(html,/<!doctype html>/i);assert.match(html,/error-shell/);assert.match(html,/noindex, nofollow/);assert.match(html,lang==='en'?/Page not found/:/Pagina non trovata/);assert.doesNotMatch(html,/<form/);}
      finally {supabaseAdmin.from=original;}
    });
  }
  for (const scenario of ['closed','scheduled','past-close']) {
    test(`${lang}: ${scenario} remains an informative 200`, async () => {
      seed();const doc=state.documents.find(d=>d.language===lang);
      if(scenario==='closed')doc.status='closed';
      if(scenario==='scheduled')doc.opensAt='2999-01-01T00:00:00Z';
      if(scenario==='past-close')doc.closesAt='2000-01-01T00:00:00Z';
      const {response,html}=await render(lang,validSlug);assert.equal(response.status,200);
      assert.match(html,scenario==='scheduled'?(lang==='en'?/not open yet/:/non è ancora aperto/):(lang==='en'?/survey is closed/:/sondaggio è chiuso/));
    });
  }
  for (const failure of [403,429,500,503,'timeout','quota']) {
    test(`${lang}: Sanity ${failure} produces service 503, never a false 404`,async()=>{
      seed();state.failSanity=Object.assign(new Error('PRIVATE upstream failure'),{statusCode:failure});
      const original=supabaseAdmin.from;supabaseAdmin.from=()=>{throw Error('No error-shell DB reads');};
      try {const {response,html}=await render(lang,validSlug);assert.equal(response.status,503);assert.match(html,/error-shell/);assert.doesNotMatch(html,/PRIVATE upstream failure|<form/);assert.deepEqual(state.logs,['community-survey.page']);}
      finally{supabaseAdmin.from=original;}
    });
  }
}
