import { Buffer } from 'node:buffer';
import type { APIRoute } from 'astro';
import ExcelJS from 'exceljs';
import { logApiError } from '../../../../../lib/api-errors';
import {
  buildCommunitySurveyRawExportRows,
  sanitizeCommunitySurveyExportFilenamePart,
} from '../../../../../lib/community-survey-admin-export';
import {
  buildCommunitySurveyEditorialSummary,
  getCommunitySurveyAdminExportData,
  getCommunitySurveyAdminResults,
  normalizeTechnicalId,
  type CommunitySurveyAdminResults,
  type CommunitySurveyLanguage,
  type CommunitySurveyQuestionResult,
  type CommunitySurveyStatus,
} from '../../../../../lib/community-surveys';
import { getCommunitySurveyOpenAnswerSummaryReadOnlyState } from '../../../../../lib/community-survey-open-answer-summaries.server';
import { getUserSessionFromCookies } from '../../../../../lib/supabase/auth';

type Worksheet = ExcelJS.Worksheet;
type CellValue = string | number | Date | null;
type MetadataFormat = 'date' | 'integer' | 'percent' | 'text';
type MetadataRow = [string, CellValue, MetadataFormat?];

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PERCENT_FORMAT = '0.0%';
const DATE_FORMAT = 'dd/mm/yyyy hh:mm';
const INTEGER_FORMAT = '0';
const REPORT_TIME_ZONE = 'Europe/Rome';
const reportDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
});

const statusLabels: Record<CommunitySurveyLanguage, Record<CommunitySurveyStatus, string>> = {
  it: {
    draft: 'Bozza',
    open: 'Aperto',
    closed: 'Chiuso',
  },
  en: {
    draft: 'Draft',
    open: 'Open',
    closed: 'Closed',
  },
};

const typeLabels: Record<CommunitySurveyLanguage, Record<CommunitySurveyQuestionResult['type'], string>> = {
  it: {
    single: 'Scelta singola',
    multiple: 'Scelta multipla',
    text: 'Risposta testuale',
  },
  en: {
    single: 'Single choice',
    multiple: 'Multiple choice',
    text: 'Open response',
  },
};

const labels = {
  it: {
    surveyTitle: 'Titolo survey',
    surveyKey: 'Survey key',
    status: 'Stato',
    totalParticipants: 'Partecipanti totali',
    itParticipants: 'Partecipanti IT',
    enParticipants: 'Partecipanti EN',
    firstResponse: 'Prima partecipazione',
    latestResponse: 'Ultima partecipazione',
    exportDate: 'Data export',
    quantitativeSummary: 'Sintesi quantitativa',
    multipleNote:
      'Per le domande multiple, le percentuali rappresentano il peso di ciascuna preferenza sul totale delle selezioni espresse.',
    tie: 'Pari merito',
    otherPreferences: 'Altre preferenze',
    smallSample: 'Campione ancora ridotto rispetto alla soglia della sintesi editoriale.',
    updated: 'Aggiornato',
    stale: 'Da aggiornare',
    missing: 'Non generato',
    notConfigured: 'AI non configurata',
    storageUnavailable: 'Storage non disponibile',
    noSummary: 'Nessun resoconto AI ancora generato.',
    noItems: 'Nessun elemento rilevato.',
    overview: 'Quadro generale',
    recurringThemes: 'Temi ricorrenti',
    appreciatedAspects: 'Cosa viene apprezzato',
    requests: 'Richieste e suggerimenti',
    criticisms: 'Criticità',
    opportunities: 'Opportunità editoriali',
    signals: 'Segnali interessanti',
    caveats: 'Limiti della lettura',
  },
  en: {
    surveyTitle: 'Survey title',
    surveyKey: 'Survey key',
    status: 'Status',
    totalParticipants: 'Total participants',
    itParticipants: 'IT participants',
    enParticipants: 'EN participants',
    firstResponse: 'First participation',
    latestResponse: 'Latest participation',
    exportDate: 'Export date',
    quantitativeSummary: 'Quantitative summary',
    multipleNote:
      'For multiple-choice questions, percentages show each preference’s share of all selections made.',
    tie: 'Tie',
    otherPreferences: 'Other preferences',
    smallSample: 'Sample still below the editorial summary threshold.',
    updated: 'Updated',
    stale: 'Needs update',
    missing: 'Not generated',
    notConfigured: 'AI not configured',
    storageUnavailable: 'Storage unavailable',
    noSummary: 'No AI report generated yet.',
    noItems: 'No relevant item detected.',
    overview: 'Overview',
    recurringThemes: 'Recurring themes',
    appreciatedAspects: 'What is appreciated',
    requests: 'Requests and suggestions',
    criticisms: 'Friction points',
    opportunities: 'Editorial opportunities',
    signals: 'Notable signals',
    caveats: 'Reading limits',
  },
} as const;

const getStatusForExportError = (error: string) => {
  if (error === 'invalid_survey_key') return 400;
  if (error === 'survey_not_found') return 404;

  return 500;
};

const getReportDateTimeParts = (date: Date) =>
  Object.fromEntries(
    reportDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  ) as Record<Intl.DateTimeFormatPartTypes, string>;

const toReportExcelDate = (value: string | Date | null | undefined) => {
  const timestamp = value instanceof Date
    ? value.getTime()
    : Date.parse(value || '');

  if (!Number.isFinite(timestamp)) return null;

  const parts = getReportDateTimeParts(new Date(timestamp));

  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  ));
};

const getReportExportDate = () => {
  const parts = getReportDateTimeParts(new Date());

  return `${parts.year}-${parts.month}-${parts.day}`;
};

const toPercentCell = (percentage: number | null | undefined) =>
  Number.isFinite(percentage) ? Number(percentage) / 100 : null;

const getPreferencePercentage = (count: number, totalSelections: number) =>
  totalSelections > 0 ? count / totalSelections : null;

const applyHeaderStyle = (row: ExcelJS.Row) => {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFECEFF3' },
  };
  row.border = {
    bottom: { style: 'thin', color: { argb: 'FFD7DEE8' } },
  };
};

const styleWorksheet = (worksheet: Worksheet) => {
  worksheet.properties.defaultRowHeight = 18;
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: 'top',
        wrapText: true,
      };
    });
  });
};

const applyCellFormat = (cell: ExcelJS.Cell, format: MetadataFormat | undefined) => {
  if (cell.value == null || cell.value === '') return;

  if (format === 'date') {
    cell.numFmt = DATE_FORMAT;
  } else if (format === 'integer') {
    cell.numFmt = INTEGER_FORMAT;
  } else if (format === 'percent') {
    cell.numFmt = PERCENT_FORMAT;
  }
};

const mergeRow = (worksheet: Worksheet, rowNumber: number, fromColumn: number, toColumn: number) => {
  if (toColumn > fromColumn) {
    worksheet.mergeCells(rowNumber, fromColumn, rowNumber, toColumn);
  }
};

const addTitle = (worksheet: Worksheet, title: string, columns = 1) => {
  const row = worksheet.addRow([title]);

  mergeRow(worksheet, row.number, 1, columns);
  row.font = { bold: true, size: 15 };
  worksheet.addRow([]);

  return row;
};

const addSection = (worksheet: Worksheet, title: string, columns = 1) => {
  worksheet.addRow([]);
  const row = worksheet.addRow([title]);

  mergeRow(worksheet, row.number, 1, columns);
  row.font = { bold: true, size: 13 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5F7FA' },
  };
  worksheet.addRow([]);

  return row;
};

const addMetadataTable = (worksheet: Worksheet, rows: MetadataRow[]) => {
  const headerRow = worksheet.addRow(['Campo', 'Valore']);

  applyHeaderStyle(headerRow);

  rows.forEach(([label, value, format]) => {
    const row = worksheet.addRow([label, value]);

    row.getCell(1).font = { bold: true };
    applyCellFormat(row.getCell(2), format);
  });

  worksheet.addRow([]);
};

const addTable = (
  worksheet: Worksheet,
  headers: string[],
  rows: CellValue[][],
  options: {
    autoFilter?: boolean;
    freezeHeader?: boolean;
    percentColumns?: number[];
    dateColumns?: number[];
    integerColumns?: number[];
  } = {}
) => {
  const headerRow = worksheet.addRow(headers);

  applyHeaderStyle(headerRow);

  rows.forEach((rowValues) => {
    const row = worksheet.addRow(rowValues);

    options.percentColumns?.forEach((columnIndex) => {
      applyCellFormat(row.getCell(columnIndex), 'percent');
    });
    options.dateColumns?.forEach((columnIndex) => {
      applyCellFormat(row.getCell(columnIndex), 'date');
    });
    options.integerColumns?.forEach((columnIndex) => {
      applyCellFormat(row.getCell(columnIndex), 'integer');
    });
  });

  if (options.autoFilter) {
    worksheet.autoFilter = {
      from: {
        row: headerRow.number,
        column: 1,
      },
      to: {
        row: headerRow.number,
        column: headers.length,
      },
    };
  }

  if (options.freezeHeader) {
    worksheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  }

  return headerRow;
};

const getStatusLabel = (
  status: CommunitySurveyStatus | string | undefined,
  language: CommunitySurveyLanguage
) =>
  status && status in statusLabels[language]
    ? statusLabels[language][status as CommunitySurveyStatus]
    : String(status || '—');

const getTypeLabel = (
  type: CommunitySurveyQuestionResult['type'],
  language: CommunitySurveyLanguage
) => typeLabels[language][type] || type;

const addSummarySheet = (
  workbook: ExcelJS.Workbook,
  results: CommunitySurveyAdminResults,
  exportRows: ReturnType<typeof buildCommunitySurveyRawExportRows>['rows'],
  language: CommunitySurveyLanguage
) => {
  const worksheet = workbook.addWorksheet('Sintesi');
  const t = labels[language];
  const summary = buildCommunitySurveyEditorialSummary(results);
  const submittedDates = exportRows
    .map((row) => String(row[0] || ''))
    .filter(Boolean);
  const firstResponseAt = submittedDates[submittedDates.length - 1] || null;
  const metadataRows: MetadataRow[] = [
    [t.surveyTitle, results.survey.title, 'text'],
    [t.surveyKey, results.survey.surveyKey, 'text'],
    [t.status, getStatusLabel(results.survey.status, language), 'text'],
    [t.totalParticipants, results.totalResponses, 'integer'],
    [t.itParticipants, results.languageCounts.it, 'integer'],
    [t.enParticipants, results.languageCounts.en, 'integer'],
    [t.firstResponse, toReportExcelDate(firstResponseAt), 'date'],
    [t.latestResponse, toReportExcelDate(results.latestResponseAt), 'date'],
    [t.exportDate, toReportExcelDate(new Date()), 'date'],
  ];

  worksheet.columns = [
    { width: 8 },
    { width: 62 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  addTitle(worksheet, results.survey.title || 'Community Survey', 6);
  addMetadataTable(worksheet, metadataRows);

  addSection(worksheet, t.quantitativeSummary, 6);

  if (!summary.isAvailable) {
    const smallSampleRow = worksheet.addRow([t.smallSample]);
    mergeRow(worksheet, smallSampleRow.number, 1, 6);
  }

  const noteRow = worksheet.addRow([t.multipleNote]);
  mergeRow(worksheet, noteRow.number, 1, 6);
  worksheet.addRow([]);

  summary.items.forEach((item) => {
    const questionIndex = results.questions.findIndex((question) => question.questionId === item.questionId) + 1;
    const questionHeader = worksheet.addRow([`${questionIndex}. ${item.text}`]);

    mergeRow(worksheet, questionHeader.number, 1, 6);
    questionHeader.font = { bold: true, size: 12 };
    questionHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5F7FA' },
    };

    const typeRow = worksheet.addRow([getTypeLabel(item.type, language)]);
    mergeRow(worksheet, typeRow.number, 1, 6);
    typeRow.font = { italic: true, color: { argb: 'FF586273' } };

    if (item.type === 'single') {
      addTable(
        worksheet,
        ['Risultato principale', 'Conteggio', 'Partecipanti', 'Nota'],
        item.topOptions.map((option) => [
          option.label,
          option.count,
          toPercentCell(option.percentage),
          item.isTie ? t.tie : null,
        ]),
        {
          integerColumns: [2],
          percentColumns: [3],
        }
      );
    } else {
      addTable(
        worksheet,
        ['Preferenza', 'Conteggio', '% preferenze'],
        [
          ...item.topOptions.map((option, index) => [
            `${index + 1}. ${option.label}`,
            option.count,
            toPercentCell(option.percentage),
          ] as CellValue[]),
          ...(item.otherOption
            ? [[
                t.otherPreferences,
                item.otherOption.count,
                toPercentCell(item.otherOption.percentage),
              ] as CellValue[]]
            : []),
        ],
        {
          integerColumns: [2],
          percentColumns: [3],
        }
      );
    }

    worksheet.addRow([]);
  });

  styleWorksheet(worksheet);

  return worksheet;
};

const addQuestionsSheet = (
  workbook: ExcelJS.Workbook,
  results: CommunitySurveyAdminResults,
  language: CommunitySurveyLanguage
) => {
  const worksheet = workbook.addWorksheet('Domande');

  worksheet.columns = [
    { width: 14 },
    { width: 28 },
    { width: 18 },
    { width: 52 },
    { width: 42 },
    { width: 14 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  addTable(
    worksheet,
    [
      'Ordine domanda',
      'Question ID',
      'Tipo',
      'Domanda',
      'Opzione',
      'Conteggio',
      'Partecipanti con risposta',
      'Totale selezioni',
      '% partecipanti',
      '% preferenze',
    ],
    results.questions.flatMap((question, questionIndex) => {
      if (question.type === 'text') {
        return [[
          questionIndex + 1,
          question.questionId,
          getTypeLabel(question.type, language),
          question.text,
          null,
          question.textAnswers.length,
          question.responseCount,
          null,
          null,
          null,
        ]];
      }

      return question.options.map((option) => [
        questionIndex + 1,
        question.questionId,
        getTypeLabel(question.type, language),
        question.text,
        option.label,
        option.count,
        question.responseCount,
        question.answerCount,
        toPercentCell(option.percentage),
        question.type === 'multiple'
          ? getPreferencePercentage(option.count, question.answerCount)
          : null,
      ]);
    }),
    {
      autoFilter: true,
      freezeHeader: true,
      percentColumns: [9, 10],
      integerColumns: [1, 6, 7, 8],
    }
  );

  styleWorksheet(worksheet);

  return worksheet;
};

const addOpenAnswerReportSection = (worksheet: Worksheet, title: string, columns = 3) => {
  worksheet.addRow([]);
  const row = worksheet.addRow([title.toUpperCase()]);

  mergeRow(worksheet, row.number, 1, columns);
  row.font = { bold: true, size: 12 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5F7FA' },
  };

  return row;
};

const addOpenAnswerParagraph = (worksheet: Worksheet, value: string, columns = 3) => {
  const row = worksheet.addRow([value]);

  mergeRow(worksheet, row.number, 1, columns);

  return row;
};

const addOpenAnswerSummaryList = (
  worksheet: Worksheet,
  title: string,
  items: string[],
  emptyLabel: string
) => {
  addOpenAnswerReportSection(worksheet, title);

  if (items.length === 0) {
    addOpenAnswerParagraph(worksheet, emptyLabel);
    return;
  }

  items.forEach((item) => {
    addOpenAnswerParagraph(worksheet, `• ${item}`);
  });
};

const addOpenAnswerReportSheet = async (
  workbook: ExcelJS.Workbook,
  results: CommunitySurveyAdminResults,
  language: CommunitySurveyLanguage
) => {
  const worksheet = workbook.addWorksheet('Resoconto aperte');
  const t = labels[language];
  const state = await getCommunitySurveyOpenAnswerSummaryReadOnlyState(results);
  const status = state.storageError
    ? t.storageUnavailable
    : state.summary
      ? state.isStale
        ? t.stale
        : t.updated
      : state.isConfigured
        ? t.missing
        : t.notConfigured;

  worksheet.columns = [
    { width: 28 },
    { width: 42 },
    { width: 90 },
  ];

  addTitle(worksheet, 'Resoconto risposte aperte', 3);
  addMetadataTable(worksheet, [
    ['Stato', status, 'text'],
    ['Data generazione', toReportExcelDate(state.summary?.generatedAt), 'date'],
    [
      'Risposte testuali analizzate',
      state.summary?.sourceTextAnswerCount ?? state.significantTextAnswerCount,
      'integer',
    ],
    ['Model', state.summary?.model || null, 'text'],
    ['Prompt version', state.summary?.promptVersion || null, 'text'],
    ['Ultima risposta significativa', toReportExcelDate(state.sourceLatestResponseAt), 'date'],
  ]);

  addSection(worksheet, 'Resoconto strutturato', 3);

  const summary = state.summary?.summary || null;

  if (!summary) {
    addOpenAnswerParagraph(
      worksheet,
      state.storageError ? t.storageUnavailable : t.noSummary
    );
    styleWorksheet(worksheet);

    return worksheet;
  }

  addOpenAnswerReportSection(worksheet, t.overview);
  addOpenAnswerParagraph(worksheet, summary.overview);

  addOpenAnswerReportSection(worksheet, t.recurringThemes);

  if (summary.recurringThemes.length === 0) {
    addOpenAnswerParagraph(worksheet, t.noItems);
  } else {
    summary.recurringThemes.forEach((theme) => {
      const titleRow = worksheet.addRow([theme.title]);
      mergeRow(worksheet, titleRow.number, 1, 3);
      titleRow.font = { bold: true };
      addOpenAnswerParagraph(worksheet, theme.summary);
    });
  }

  addOpenAnswerSummaryList(worksheet, t.appreciatedAspects, summary.appreciatedAspects, t.noItems);
  addOpenAnswerSummaryList(worksheet, t.requests, summary.requestsAndSuggestions, t.noItems);
  addOpenAnswerSummaryList(worksheet, t.criticisms, summary.criticismsOrFriction, t.noItems);
  addOpenAnswerSummaryList(worksheet, t.opportunities, summary.editorialOpportunities, t.noItems);
  addOpenAnswerSummaryList(worksheet, t.signals, summary.notableSignals, t.noItems);
  addOpenAnswerSummaryList(worksheet, t.caveats, summary.caveats, t.noItems);
  styleWorksheet(worksheet);

  return worksheet;
};

const sortTextAnswersNewestFirst = <T extends { timestamp: string }>(answers: T[]) =>
  [...answers].sort((a, b) => {
    const bTime = Date.parse(b.timestamp || '');
    const aTime = Date.parse(a.timestamp || '');

    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

const addOpenResponsesSheet = (
  workbook: ExcelJS.Workbook,
  results: CommunitySurveyAdminResults
) => {
  const worksheet = workbook.addWorksheet('Risposte aperte');

  worksheet.columns = [
    { width: 16 },
    { width: 28 },
    { width: 54 },
    { width: 12 },
    { width: 20 },
    { width: 90 },
  ];

  addTable(
    worksheet,
    ['Ordine domanda', 'Question ID', 'Domanda', 'Lingua', 'Data risposta', 'Risposta'],
    results.questions
      .filter((question) => question.type === 'text')
      .flatMap((question) => {
        const questionIndex = results.questions.findIndex((item) => item.questionId === question.questionId) + 1;
        const responses = sortTextAnswersNewestFirst(
          question.textAnswers.map((answer) => ({
            ...answer,
            timestamp: answer.submittedAt || answer.createdAt || '',
          }))
        );

        return responses.map((answer) => [
          questionIndex,
          question.questionId,
          question.text,
          answer.language,
          toReportExcelDate(answer.submittedAt || answer.createdAt),
          answer.text,
        ]);
      }),
    {
      autoFilter: true,
      freezeHeader: true,
      dateColumns: [5],
    }
  );

  styleWorksheet(worksheet);

  return worksheet;
};

const addRawResponsesSheet = (
  workbook: ExcelJS.Workbook,
  rawExport: ReturnType<typeof buildCommunitySurveyRawExportRows>
) => {
  const worksheet = workbook.addWorksheet('Risposte raw');

  worksheet.columns = rawExport.header.map((header, index) => ({
    width: index < 2 ? 20 : 34,
  }));

  const headerRow = worksheet.addRow(rawExport.header);
  applyHeaderStyle(headerRow);

  rawExport.rows.forEach((rowValues) => {
    const row = worksheet.addRow(rowValues.map((value, index) => (
      index === 0 ? toReportExcelDate(String(value || '')) : value
    )));

    applyCellFormat(row.getCell(1), 'date');
  });

  worksheet.autoFilter = {
    from: {
      row: headerRow.number,
      column: 1,
    },
    to: {
      row: headerRow.number,
      column: rawExport.header.length,
    },
  };
  worksheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  styleWorksheet(worksheet);

  return worksheet;
};

const createWorkbook = async ({
  results,
  rawExport,
}: {
  results: CommunitySurveyAdminResults;
  rawExport: ReturnType<typeof buildCommunitySurveyRawExportRows>;
}) => {
  const workbook = new ExcelJS.Workbook();
  const language = results.survey.language === 'en' ? 'en' : 'it';

  workbook.creator = 'Retro-Gamers.it';
  workbook.created = new Date();
  workbook.modified = new Date();

  addSummarySheet(workbook, results, rawExport.rows, language);
  addQuestionsSheet(workbook, results, language);
  await addOpenAnswerReportSheet(workbook, results, language);
  addOpenResponsesSheet(workbook, results);
  addRawResponsesSheet(workbook, rawExport);

  return workbook;
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

  try {
    const [resultsResponse, exportResponse] = await Promise.all([
      getCommunitySurveyAdminResults(surveyKey),
      getCommunitySurveyAdminExportData(surveyKey),
    ]);

    if (!resultsResponse.ok) {
      return new Response(resultsResponse.details || resultsResponse.error, {
        status: getStatusForExportError(resultsResponse.error),
        headers: {
          'Cache-Control': 'private, no-store',
        },
      });
    }

    if (!exportResponse.ok) {
      return new Response(exportResponse.details || exportResponse.error, {
        status: getStatusForExportError(exportResponse.error),
        headers: {
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const rawExport = buildCommunitySurveyRawExportRows(exportResponse.exportData);
    const workbook = await createWorkbook({
      results: resultsResponse.results,
      rawExport,
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const body = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer as ArrayBuffer);
    const filename = [
      sanitizeCommunitySurveyExportFilenamePart(resultsResponse.results.survey.surveyKey),
      'report',
      getReportExportDate(),
    ].join('-');

    return new Response(body, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        'Content-Type': XLSX_CONTENT_TYPE,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logApiError('community-surveys.admin-export-xlsx', error);

    return new Response('Workbook generation failed', {
      status: 500,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  }
};
