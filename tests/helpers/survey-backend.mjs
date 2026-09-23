// Isolated in-memory adapters: no credentials, network calls or production writes.
import { readFileSync } from 'node:fs';
const records = readFileSync(new URL('../../docs/community-surveys/home-amiga-platformer-2026.ndjson', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
export const state = { documents: [], responses: [], answers: [], fail: false, posts: 0 };
export function reset() {
  state.documents = structuredClone(records).map(d => ({ ...d, slug: d.slug.current }));
  state.responses = []; state.answers = []; state.fail = false; state.posts = 0;
}
reset();
export function getPublishedReadClient() { return { async fetch(query, params = {}) {
  let docs = state.documents.filter(d => (!params.surveyKey || d.surveyKey === params.surveyKey)
    && (!params.language || d.language === params.language) && (!params.surveyDocumentId || d._id === params.surveyDocumentId)
    && (!params.homeSurveyKey || d.surveyKey !== params.homeSurveyKey));
  if (query.includes('status in ["open", "closed"]')) docs = docs.filter(d => ['open','closed'].includes(d.status));
  if (query.includes('status == "open"')) docs = docs.filter(d => d.status === 'open');
  return query.includes('[0]') ? docs[0] || null : docs;
} }; }
export const supabaseAdmin = { from(table) {
  const rows = table === 'community_survey_responses' ? state.responses : state.answers;
  const filters = []; let insert, remove = false, single = false, options;
  const api = {
    select(_columns, opts) { options = opts; return api; },
    eq(field, value) { filters.push(row => field === 'community_survey_responses.survey_key'
      ? state.responses.some(r => r.id === row.response_id && r.survey_key === value) : row[field] === value); return api; },
    in(field, values) { filters.push(row => values.includes(row[field])); return api; },
    order() { return api; },
    insert(value) { insert = value; return api; }, delete() { remove = true; return api; },
    maybeSingle() { single = true; return api; }, single() { single = true; return api; },
    then(resolve, reject) { return Promise.resolve().then(() => {
      if (state.fail) return { data: null, error: { message: 'Isolated simulated outage' }, count: null };
      if (insert) {
        if (table === 'community_survey_responses' && rows.some(r => r.survey_key === insert.survey_key && r.respondent_token_hash === insert.respondent_token_hash))
          return { data: null, error: { code: '23505' } };
        const inserted = (Array.isArray(insert) ? insert : [insert]).map(r => ({ id: crypto.randomUUID(), submitted_at: new Date().toISOString(), ...r }));
        rows.push(...inserted);
        return { data: single ? inserted[0] : inserted, error: null };
      }
      const found = rows.filter(r => filters.every(f => f(r)));
      if (remove) for (const row of found) rows.splice(rows.indexOf(row), 1);
      return { data: options?.head ? null : single ? found[0] || null : found, error: null, count: found.length };
    }).then(resolve, reject); },
  };
  return api;
} };
export const sendCommunitySurveyResponseAdminEmail = async () => true;
export const logApiError = () => {};
