import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSurveyHarness, cookieJar } from './helpers/survey-harness.mjs';
import { state, reset } from './helpers/survey-backend.mjs';
import { HOME_SURVEY_KEY, surveyPercentages } from '../src/lib/home-survey.ts';
const api = await loadSurveyHarness();
const key = HOME_SURVEY_KEY;
const get = (cookies, lang='it') => api.get({params:{surveyKey:key},url:new URL(`http://localhost/api/community/surveys/${key}?language=${lang}`),cookies});
const vote = (cookies, option='superfrog', lang='it') => api.post({ params:{surveyKey:key},cookies,
 request: new Request('http://localhost/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:lang,surveyDocumentId:`community-survey.${key}.${lang}`,answers:[{questionId:'next-review',optionId:option}]})}) });

test('shared anonymous identity, confirmed vote, IT to EN, duplicate and public DTO', async () => {
 reset(); const cookies=cookieJar(); let data=await (await get(cookies)).json();
 assert.equal(data.responseState.hasResponded,false); assert.equal(data.results,undefined);
 assert.equal(cookies.settings[0].httpOnly,true); assert.equal(cookies.settings[0].path,'/');
 assert.equal((await vote(cookies)).status,201);
 data=await (await get(cookies,'en')).json();
 assert.equal(data.responseState.hasResponded,true); assert.equal(data.results.totalParticipants,1);
 assert.deepEqual(data.results.options.map(o=>o.percentage),[0,100,0,0]);
 assert.ok(!JSON.stringify(data.results).includes('count')); assert.ok(!JSON.stringify(data.results).includes('respondent'));
 assert.equal((await vote(cookies,'kid-chaos','en')).status,409); assert.equal(state.responses.length,1);
});
test('all four stable options accepted; invalid option rejected without a response',async()=>{
 reset(); for(const option of ['chuck-rock-ii','superfrog','kid-chaos','fire-and-ice']) assert.equal((await vote(cookieJar(),option)).status,201);
 assert.equal((await vote(cookieJar(),'0')).status,422); assert.equal(state.responses.length,4);
 const result=await api.engine.getHomeCommunitySurveyResults(state.documents[0]);
 assert.deepEqual(result.options.map(o=>o.percentage),[25,25,25,25]);
});
test('simultaneous submissions use the existing unique-respondent constraint',async()=>{
 reset();const cookies=cookieJar();await get(cookies);
 const responses=await Promise.all([vote(cookies),vote(cookies)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(state.answers.length,1);
});
test('auth cookies do not change the existing anonymous survey policy',async()=>{
 reset();const cookies=cookieJar({'sb-access-token':'isolated-auth-marker'});await get(cookies);await vote(cookies);
 cookies.values.delete('sb-access-token');assert.equal((await (await get(cookies)).json()).responseState.hasResponded,true);
});
test('closed zero-result survey, scheduled/unpublished and outages',async()=>{
 reset();state.documents.forEach(d=>d.status='closed');
 let data=await (await get(cookieJar())).json();assert.equal(data.results.totalParticipants,0);assert.deepEqual(data.results.options.map(o=>o.percentage),[0,0,0,0]);
 assert.equal((await vote(cookieJar())).status,409);
 state.documents.forEach(d=>{d.status='open';d.opensAt='2099-01-01T00:00:00Z';});
 data=await (await get(cookieJar())).json();assert.equal(data.availability.state,'scheduled');assert.equal(data.results,undefined);
 state.documents.forEach(d=>d.status='draft');assert.equal((await get(cookieJar())).status,404);
 reset();state.fail=true;assert.equal((await get(cookieJar())).status,500);assert.equal((await vote(cookieJar())).status,500);
});
test('integer percentages total 100, keep order, handle zero/one/ties/fractions',()=>{
 assert.deepEqual(surveyPercentages([0,0,0,0]),[0,0,0,0]);
 assert.deepEqual(surveyPercentages([1,1,1,0]),[34,33,33,0]);
 assert.deepEqual(surveyPercentages([1,0,0,0]),[100,0,0,0]);
 for(let i=1;i<50;i++) assert.equal(surveyPercentages([i,3,7,11]).reduce((a,b)=>a+b),100);
});
test('existing admin results/export and multiple-choice participant/selection distinction',async()=>{
 reset();await vote(cookieJar());let result=await api.engine.getCommunitySurveyAdminResults(key);
 assert.equal(result.results.totalResponses,1);assert.equal(result.results.questions[0].answerCount,1);
 assert.equal((await api.engine.getCommunitySurveyAdminExportData(key)).exportData.responses.length,1);
 reset();state.documents.forEach(d=>{d.questions[0].type='multiple';d.questions[0].maxSelections=2;});
 const saved=await api.engine.submitCommunitySurveyResponse({surveyKey:key,language:'it',cookies:cookieJar(),answers:[{questionId:'next-review',optionIds:['superfrog','kid-chaos']}]});
 assert.equal(saved.ok,true);result=await api.engine.getCommunitySurveyAdminResults(key);
 assert.equal(result.results.questions[0].responseCount,1);assert.equal(result.results.questions[0].answerCount,2);
 assert.equal((await get(cookieJar())).status,503);
});
test('Home poll never takes over the general Community Survey CTA; existing surveys keep their API shape',async()=>{
 reset();const original={...structuredClone(state.documents[0]),_id:'existing-survey',surveyKey:'community-survey-2026',slug:'community-survey-2026',title:'Existing survey'};
 state.documents.push(original);
 assert.equal((await api.engine.getOpenCommunitySurveyForLanguage('it')).surveyKey,'community-survey-2026');
 const list=await api.engine.getCommunitySurveyAdminList();assert.equal(list.length,2);assert.ok(list.some(s=>s.surveyKey===key));
 const response=await api.get({params:{surveyKey:'community-survey-2026'},url:new URL('http://localhost/?language=it'),cookies:cookieJar()});
 assert.equal((await response.json()).results,undefined);
});
