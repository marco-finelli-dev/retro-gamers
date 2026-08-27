import OpenAI from 'openai';
import type { ResponsesModel } from 'openai/resources/shared';
import { logApiError } from './api-errors';
import {
  getCommunitySurveyAdminResults,
  normalizeCommunitySurveyLanguage,
  normalizeTechnicalId,
  type CommunitySurveyAdminResults,
  type CommunitySurveyLanguage,
  type CommunitySurveyTextAnswerResult,
} from './community-surveys';
import { supabaseAdmin } from './supabase/server';

export const COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_MIN_SIGNIFICANT_ANSWERS = 10;
export const COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_PROMPT_VERSION = 'community-survey-open-answers-v2';
export const COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_LANGUAGE: CommunitySurveyLanguage = 'it';

const DEFAULT_OPENAI_SURVEY_SUMMARY_MODEL = 'gpt-5.4-mini';
const MAX_SINGLE_OPEN_ANSWER_CHARS = 1500;
const MAX_TOTAL_OPEN_ANSWER_CHARS = 30000;
const MAX_SUMMARY_LIST_ITEMS = 5;

class OpenAiSummaryOutputError extends Error {}

export type CommunitySurveyOpenAnswerSummaryTheme = {
  title: string;
  summary: string;
};

export type CommunitySurveyOpenAnswerSummary = {
  overview: string;
  recurringThemes: CommunitySurveyOpenAnswerSummaryTheme[];
  appreciatedAspects: string[];
  requestsAndSuggestions: string[];
  criticismsOrFriction: string[];
  editorialOpportunities: string[];
  notableSignals: string[];
  caveats: string[];
};

export type CommunitySurveyOpenAnswerSummaryRecord = {
  surveyKey: string;
  summaryLanguage: CommunitySurveyLanguage;
  summary: CommunitySurveyOpenAnswerSummary;
  generatedAt: string | null;
  sourceTextAnswerCount: number;
  sourceLatestResponseAt: string | null;
  model: string;
  promptVersion: string | null;
};

export type CommunitySurveyOpenAnswerSummaryState = {
  isConfigured: boolean;
  minSignificantTextAnswerCount: number;
  significantTextAnswerCount: number;
  sourceLatestResponseAt: string | null;
  isThresholdMet: boolean;
  summary: CommunitySurveyOpenAnswerSummaryRecord | null;
  isStale: boolean;
  storageError: string | null;
};

type CommunitySurveySummaryRow = {
  survey_key: string;
  summary_language: string;
  summary: unknown;
  generated_at: string | null;
  source_text_answer_count: number | null;
  source_latest_response_at: string | null;
  model: string | null;
  prompt_version: string | null;
};

type MinimizedOpenAnswer = {
  question: string;
  language: CommunitySurveyLanguage;
  answer: string;
};

type SignificantOpenAnswer = {
  questionId: string;
  questionText: string;
  answer: CommunitySurveyTextAnswerResult;
  timestamp: string | null;
};

const isOpenAiConfigured = () => Boolean(process.env.OPENAI_API_KEY);

const getOpenAiSummaryModel = () =>
  (String(process.env.OPENAI_SURVEY_SUMMARY_MODEL || '').trim() ||
    DEFAULT_OPENAI_SURVEY_SUMMARY_MODEL) as ResponsesModel;

const truncateUnicode = (value: string, maxLength: number) => {
  const chars = Array.from(value);

  if (chars.length <= maxLength) return value;

  return `${chars.slice(0, maxLength).join('').trimEnd()}…`;
};

const redactOpenAnswerText = (value: string) => {
  const text = value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email rimossa]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link rimosso]');

  return text.replace(/(^|[^\w])(\+?\d[\d\s().-]{6,}\d)(?=$|[^\w])/g, (match, prefix, phone) => {
    const digitCount = String(phone).replace(/\D/g, '').length;

    return digitCount >= 7 ? `${prefix}[numero rimosso]` : match;
  });
};

const normalizeOpenAnswerText = (value: unknown) =>
  String(value || '').trim();

const isSignificantOpenAnswerText = (value: unknown) => {
  const text = normalizeOpenAnswerText(value);

  if (!text) return false;

  return text.replace(/[\p{P}\p{S}\s]/gu, '').length > 0;
};

const getAnswerTimestamp = (answer: CommunitySurveyTextAnswerResult) =>
  answer.submittedAt || answer.createdAt || null;

const getLatestTimestamp = (answers: SignificantOpenAnswer[]) => {
  let latestTime = 0;
  let latestTimestamp: string | null = null;

  answers.forEach(({ timestamp }) => {
    const time = Date.parse(timestamp || '');

    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time;
      latestTimestamp = timestamp;
    }
  });

  return latestTimestamp;
};

const getSignificantOpenAnswers = (
  results: CommunitySurveyAdminResults
): SignificantOpenAnswer[] =>
  results.questions.flatMap((question) => {
    if (question.type !== 'text') return [];

    return question.textAnswers
      .filter((answer) => isSignificantOpenAnswerText(answer.text))
      .map((answer) => ({
        questionId: question.questionId,
        questionText: question.text,
        answer,
        timestamp: getAnswerTimestamp(answer),
      }));
  });

const buildSourceSnapshot = (results: CommunitySurveyAdminResults) => {
  const answers = getSignificantOpenAnswers(results);

  return {
    answers,
    significantTextAnswerCount: answers.length,
    sourceLatestResponseAt: getLatestTimestamp(answers),
  };
};

const normalizeString = (value: unknown, maxLength = 700) =>
  truncateUnicode(String(value || '').trim(), maxLength);

const normalizeStringList = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeString(item, 320))
    .filter(Boolean)
    .slice(0, MAX_SUMMARY_LIST_ITEMS);
};

const normalizeThemeList = (value: unknown): CommunitySurveyOpenAnswerSummaryTheme[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const theme = item as Partial<CommunitySurveyOpenAnswerSummaryTheme> | null;
      const title = normalizeString(theme?.title, 120);
      const summary = normalizeString(theme?.summary, 500);

      if (!title || !summary) return null;

      return { title, summary };
    })
    .filter(Boolean)
    .slice(0, MAX_SUMMARY_LIST_ITEMS) as CommunitySurveyOpenAnswerSummaryTheme[];
};

export const normalizeCommunitySurveyOpenAnswerSummary = (
  value: unknown
): CommunitySurveyOpenAnswerSummary | null => {
  const summary = value as Partial<CommunitySurveyOpenAnswerSummary> | null;
  const overview = normalizeString(summary?.overview, 900);

  if (!overview) return null;

  return {
    overview,
    recurringThemes: normalizeThemeList(summary?.recurringThemes),
    appreciatedAspects: normalizeStringList(summary?.appreciatedAspects),
    requestsAndSuggestions: normalizeStringList(summary?.requestsAndSuggestions),
    criticismsOrFriction: normalizeStringList(summary?.criticismsOrFriction),
    editorialOpportunities: normalizeStringList(summary?.editorialOpportunities),
    notableSignals: normalizeStringList(summary?.notableSignals),
    caveats: normalizeStringList(summary?.caveats),
  };
};

const normalizeSummaryRow = (
  row: CommunitySurveySummaryRow | null
): CommunitySurveyOpenAnswerSummaryRecord | null => {
  if (!row) return null;

  const surveyKey = normalizeTechnicalId(row.survey_key);
  const summaryLanguage = normalizeCommunitySurveyLanguage(row.summary_language);
  const summary = normalizeCommunitySurveyOpenAnswerSummary(row.summary);
  const sourceTextAnswerCount = Number(row.source_text_answer_count);
  const model = String(row.model || '').trim();
  const promptVersion = String(row.prompt_version || '').trim();

  if (
    !surveyKey ||
    !summaryLanguage ||
    !summary ||
    !Number.isInteger(sourceTextAnswerCount) ||
    sourceTextAnswerCount < 0 ||
    !model
  ) {
    return null;
  }

  return {
    surveyKey,
    summaryLanguage,
    summary,
    generatedAt: row.generated_at || null,
    sourceTextAnswerCount,
    sourceLatestResponseAt: row.source_latest_response_at || null,
    model,
    promptVersion: promptVersion || null,
  };
};

const isSummaryStale = ({
  summary,
  significantTextAnswerCount,
  sourceLatestResponseAt,
}: {
  summary: CommunitySurveyOpenAnswerSummaryRecord | null;
  significantTextAnswerCount: number;
  sourceLatestResponseAt: string | null;
}) => {
  if (!summary) return false;
  if (summary.promptVersion !== COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_PROMPT_VERSION) return true;
  if (summary.sourceTextAnswerCount !== significantTextAnswerCount) return true;

  const currentLatest = Date.parse(sourceLatestResponseAt || '');
  const savedLatest = Date.parse(summary.sourceLatestResponseAt || '');

  if (!Number.isFinite(currentLatest)) return false;
  if (!Number.isFinite(savedLatest)) return true;

  return savedLatest < currentLatest;
};

const getSavedOpenAnswerSummary = async (surveyKey: string) => {
  const { data, error } = await supabaseAdmin
    .from('community_survey_summaries')
    .select('survey_key, summary_language, summary, generated_at, source_text_answer_count, source_latest_response_at, model, prompt_version')
    .eq('survey_key', surveyKey)
    .eq('summary_language', COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_LANGUAGE)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeSummaryRow((data || null) as CommunitySurveySummaryRow | null);
};

export async function getCommunitySurveyOpenAnswerSummaryState(
  results: CommunitySurveyAdminResults
): Promise<CommunitySurveyOpenAnswerSummaryState> {
  const source = buildSourceSnapshot(results);
  const baseState = {
    isConfigured: isOpenAiConfigured(),
    minSignificantTextAnswerCount: COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_MIN_SIGNIFICANT_ANSWERS,
    significantTextAnswerCount: source.significantTextAnswerCount,
    sourceLatestResponseAt: source.sourceLatestResponseAt,
    isThresholdMet:
      source.significantTextAnswerCount >= COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_MIN_SIGNIFICANT_ANSWERS,
  };

  if (!baseState.isConfigured) {
    return {
      ...baseState,
      summary: null,
      isStale: false,
      storageError: null,
    };
  }

  try {
    const summary = await getSavedOpenAnswerSummary(results.survey.surveyKey);

    return {
      ...baseState,
      summary,
      isStale: isSummaryStale({
        summary,
        significantTextAnswerCount: source.significantTextAnswerCount,
        sourceLatestResponseAt: source.sourceLatestResponseAt,
      }),
      storageError: null,
    };
  } catch (error) {
    logApiError('community-survey-open-answer-summaries.read', error);

    return {
      ...baseState,
      summary: null,
      isStale: false,
      storageError: 'summary_storage_unavailable',
    };
  }
}

const createMinimizedDataset = (answers: SignificantOpenAnswer[]) => {
  const minimized: MinimizedOpenAnswer[] = [];
  let totalLength = 0;

  for (const item of answers) {
    const remainingAnswers = Math.max(answers.length - minimized.length, 1);
    const remainingBudget = Math.max(MAX_TOTAL_OPEN_ANSWER_CHARS - totalLength, 0);
    const answerCharLimit = Math.max(
      1,
      Math.min(
        MAX_SINGLE_OPEN_ANSWER_CHARS,
        Math.floor(remainingBudget / remainingAnswers)
      )
    );
    const redactedAnswer = truncateUnicode(
      redactOpenAnswerText(normalizeOpenAnswerText(item.answer.text)),
      answerCharLimit
    );

    if (!redactedAnswer) continue;

    minimized.push({
      question: item.questionText,
      language: item.answer.language,
      answer: redactedAnswer,
    });
    totalLength += Array.from(minimized[minimized.length - 1].answer).length;
  }

  return minimized;
};

const openAnswerSummaryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overview',
    'recurringThemes',
    'appreciatedAspects',
    'requestsAndSuggestions',
    'criticismsOrFriction',
    'editorialOpportunities',
    'notableSignals',
    'caveats',
  ],
  properties: {
    overview: { type: 'string' },
    recurringThemes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary'],
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    },
    appreciatedAspects: {
      type: 'array',
      items: { type: 'string' },
    },
    requestsAndSuggestions: {
      type: 'array',
      items: { type: 'string' },
    },
    criticismsOrFriction: {
      type: 'array',
      items: { type: 'string' },
    },
    editorialOpportunities: {
      type: 'array',
      items: { type: 'string' },
    },
    notableSignals: {
      type: 'array',
      items: { type: 'string' },
    },
    caveats: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

const buildOpenAiInstructions = () => `
Stai analizzando un piccolo Community Survey editoriale di Retro-Gamers.it.

Obiettivo: produrre un resoconto editoriale utile allo staff, in italiano.

Regole fondamentali:
- basati esclusivamente sulle risposte fornite;
- non inventare informazioni;
- non inferire età, sesso, provenienza, identità o altre caratteristiche personali;
- non fare analisi demografiche;
- non riprodurre dati personali eventualmente presenti;
- non riportare citazioni testuali lunghe;
- preferisci parafrasi;
- distingui temi ricorrenti da osservazioni isolate;
- non chiamare "maggioranza" qualcosa che non è chiaramente supportato;
- non trasformare pochi commenti in conclusioni statistiche;
- evidenzia sia segnali positivi sia criticità reali;
- individua richieste editorialmente utili;
- segnala eventuali idee interessanti anche se isolate, qualificandole come tali;
- scrivi il resoconto finale in italiano anche quando alcune risposte originali sono EN;
- usa un tono asciutto, editoriale, concreto;
- niente frasi promozionali, metafore o conclusioni artificialmente ottimistiche.

Regole sulle sezioni:
- "criticismsOrFriction" deve contenere solo problemi concreti del sito, problemi UX, insoddisfazioni esplicite, critiche chiare, problemi del questionario o ostacoli percepiti dagli utenti.
- Esempi validi per "criticismsOrFriction": navigazione difficile, layout poco adattabile, assenza di opzioni adeguate nel survey, difficoltà a trovare gli articoli, contenuti mancanti esplicitamente richiesti.
- Non inserire in "criticismsOrFriction": utenti che non ricordano un articolo, utenti nuovi, persone che non conoscono bene il sito, risposte generiche, campione piccolo o informazioni insufficienti per trarre conclusioni.
- "notableSignals" deve raccogliere osservazioni utili che non sono necessariamente criticità e non sono abbastanza ricorrenti da diventare temi principali.
- Esempi validi per "notableSignals": una richiesta isolata ma interessante, difficoltà spontanea a ricordare articoli specifici, interesse per un contenuto nuovo o inatteso, utenti arrivati al survey senza conoscere ancora il sito, segnali deboli che meritano attenzione editoriale.
- Quando appropriato, qualifica i "notableSignals" come segnali limitati o osservazioni isolate.
- "caveats" deve descrivere limiti del dataset e dell'interpretazione: campione piccolo, risposte eterogenee, molte risposte generiche, utenti che dichiarano di conoscere poco il sito, poche risposte significative su alcune domande, impossibilità di trasformare il testo aperto in conclusioni statistiche robuste.
- Non inserire criticità del sito in "caveats".
- La stessa osservazione non deve essere ripetuta in più sezioni salvo che sia indispensabile.
- Priorità di classificazione: problema concreto -> "criticismsOrFriction"; tema ricorrente -> "recurringThemes"; richiesta -> "requestsAndSuggestions"; segnale debole/interessante -> "notableSignals"; limite del campione o del dataset -> "caveats".
`.trim();

const buildOpenAiInput = (answers: MinimizedOpenAnswer[]) =>
  JSON.stringify({ answers }, null, 2);

const callOpenAiSummary = async ({
  answers,
}: {
  answers: MinimizedOpenAnswer[];
}) => {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const model = getOpenAiSummaryModel();
  const response = await client.responses.create({
    model,
    instructions: buildOpenAiInstructions(),
    input: buildOpenAiInput(answers),
    store: false,
    max_output_tokens: 2400,
    text: {
      format: {
        type: 'json_schema',
        name: 'community_survey_open_answer_summary',
        description: 'Structured editorial summary of open-ended Community Survey answers.',
        strict: true,
        schema: openAnswerSummaryJsonSchema,
      },
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'OpenAI response failed');
  }

  const parsed = normalizeCommunitySurveyOpenAnswerSummary(
    JSON.parse(response.output_text || '{}')
  );

  if (!parsed) {
    throw new OpenAiSummaryOutputError('Invalid OpenAI summary output');
  }

  return {
    summary: parsed,
    model,
  };
};

const saveOpenAnswerSummary = async ({
  surveyKey,
  summary,
  sourceTextAnswerCount,
  sourceLatestResponseAt,
  model,
}: {
  surveyKey: string;
  summary: CommunitySurveyOpenAnswerSummary;
  sourceTextAnswerCount: number;
  sourceLatestResponseAt: string | null;
  model: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from('community_survey_summaries')
    .upsert(
      {
        survey_key: surveyKey,
        summary_language: COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_LANGUAGE,
        summary,
        generated_at: new Date().toISOString(),
        source_text_answer_count: sourceTextAnswerCount,
        source_latest_response_at: sourceLatestResponseAt,
        model,
        prompt_version: COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_PROMPT_VERSION,
      },
      { onConflict: 'survey_key,summary_language' }
    )
    .select('survey_key, summary_language, summary, generated_at, source_text_answer_count, source_latest_response_at, model, prompt_version')
    .single();

  if (error) {
    throw error;
  }

  const normalized = normalizeSummaryRow(data as CommunitySurveySummaryRow);

  if (!normalized) {
    throw new Error('Invalid saved summary row');
  }

  return normalized;
};

export async function generateCommunitySurveyOpenAnswerSummary(
  surveyKey: string
): Promise<
  | { ok: true; state: CommunitySurveyOpenAnswerSummaryState }
  | { ok: false; error: string; status: number; message: string }
> {
  const normalizedSurveyKey = normalizeTechnicalId(surveyKey);

  if (!normalizedSurveyKey) {
    return {
      ok: false,
      error: 'invalid_survey_key',
      status: 400,
      message: 'Survey key non valido.',
    };
  }

  const resultsResponse = await getCommunitySurveyAdminResults(normalizedSurveyKey);

  if (!resultsResponse.ok) {
    return {
      ok: false,
      error: resultsResponse.error,
      status: resultsResponse.error === 'survey_not_found' ? 404 : 500,
      message: resultsResponse.details || 'Risultati sondaggio non disponibili.',
    };
  }

  if (!isOpenAiConfigured()) {
    return {
      ok: false,
      error: 'openai_not_configured',
      status: 503,
      message: 'Resoconto AI non configurato.',
    };
  }

  const { results } = resultsResponse;
  const source = buildSourceSnapshot(results);

  if (
    source.significantTextAnswerCount <
    COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_MIN_SIGNIFICANT_ANSWERS
  ) {
    return {
      ok: false,
      error: 'insufficient_open_answers',
      status: 409,
      message:
        'Campione qualitativo ancora ridotto. Il resoconto sarà disponibile da 10 risposte aperte significative.',
    };
  }

  try {
    await getSavedOpenAnswerSummary(results.survey.surveyKey);
  } catch (error) {
    logApiError('community-survey-open-answer-summaries.preflight-storage', error);

    return {
      ok: false,
      error: 'summary_storage_unavailable',
      status: 500,
      message: 'Resoconto AI non disponibile.',
    };
  }

  const minimizedAnswers = createMinimizedDataset(source.answers);

  try {
    const generated = await callOpenAiSummary({
      answers: minimizedAnswers,
    });
    const summary = await saveOpenAnswerSummary({
      surveyKey: results.survey.surveyKey,
      summary: generated.summary,
      sourceTextAnswerCount: source.significantTextAnswerCount,
      sourceLatestResponseAt: source.sourceLatestResponseAt,
      model: generated.model,
    });

    return {
      ok: true,
      state: {
        isConfigured: true,
        minSignificantTextAnswerCount: COMMUNITY_SURVEY_OPEN_ANSWER_SUMMARY_MIN_SIGNIFICANT_ANSWERS,
        significantTextAnswerCount: source.significantTextAnswerCount,
        sourceLatestResponseAt: source.sourceLatestResponseAt,
        isThresholdMet: true,
        summary,
        isStale: false,
        storageError: null,
      },
    };
  } catch (error) {
    logApiError('community-survey-open-answer-summaries.generate', error);

    return {
      ok: false,
      error: error instanceof SyntaxError || error instanceof OpenAiSummaryOutputError
        ? 'openai_output_invalid'
        : 'openai_summary_failed',
      status: 502,
      message: 'Generazione del resoconto non riuscita.',
    };
  }
}
