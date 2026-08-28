import type { APIRoute } from 'astro';
import {
  buildCommunitySurveyRawExportRows,
  getCommunitySurveyExportDate,
  sanitizeCommunitySurveyExportFilenamePart,
} from '../../../../../lib/community-survey-admin-export';
import {
  getCommunitySurveyAdminExportData,
  normalizeTechnicalId,
} from '../../../../../lib/community-surveys';
import { getUserSessionFromCookies } from '../../../../../lib/supabase/auth';

const escapeCsvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);

  if (!/[",\r\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
};

const createCsv = (rows: unknown[][]) =>
  `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;

const getStatusForExportError = (error: string) => {
  if (error === 'invalid_survey_key') return 400;
  if (error === 'survey_not_found') return 404;

  return 500;
};

export const GET: APIRoute = async ({ cookies, params }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return new Response('Unauthorized', {
      status: session.status || 401,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  }

  if (session.profile.role !== 'admin') {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const surveyKey = normalizeTechnicalId(params.surveyKey);
  const result = await getCommunitySurveyAdminExportData(surveyKey);

  if (!result.ok) {
    return new Response(result.details || result.error, {
      status: getStatusForExportError(result.error),
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const { survey } = result.exportData;
  const { header, rows } = buildCommunitySurveyRawExportRows(result.exportData);
  const csv = createCsv([header, ...rows]);
  const filename = `${sanitizeCommunitySurveyExportFilenamePart(survey.surveyKey)}-${getCommunitySurveyExportDate()}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
