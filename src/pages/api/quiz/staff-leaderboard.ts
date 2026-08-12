import type { APIRoute } from 'astro';
import { getPublishedQuizBySlug } from '../../../lib/quiz';
import {
  isTechnicalId,
  json,
  normalizeLanguage,
  normalizeSlug,
} from '../../../lib/quiz-server';
import {
  getUserSessionFromCookies,
  isStaffProfile,
} from '../../../lib/supabase/auth';
import { getAvatarPublicUrl } from '../../../lib/supabase/avatars';
import { supabaseAdmin } from '../../../lib/supabase/server';

type StaffLeaderboardRpcRow = {
  rank?: number | string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_path?: string | null;
  badge_key?: string | null;
  correct_count?: number | string | null;
  total_questions?: number | string | null;
  total_elapsed_ms?: number | string | null;
  quiz_language?: string | null;
  completed_at?: string | null;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const jsonNoStore = (payload: unknown, status = 200) => {
  const response = json(payload, status);

  response.headers.set('Cache-Control', 'private, no-store');

  return response;
};

const normalizeLimit = (value: string | null) => {
  if (!value) return DEFAULT_LIMIT;

  if (!/^\d+$/.test(value)) return null;

  const limit = Number(value);

  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT
    ? limit
    : null;
};

const toInteger = (value: unknown, fallback = 0) => {
  const number = Number(value);

  return Number.isInteger(number) ? number : fallback;
};

const toIsoTimestamp = (value: unknown) => {
  if (typeof value !== 'string') return null;

  const timestamp = value.trim();

  return timestamp && Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : null;
};

const normalizeStaffLeaderboardRow = (row: StaffLeaderboardRpcRow) => ({
  rank: toInteger(row.rank),
  username: String(row.username || '').trim(),
  displayName: String(row.display_name || '').trim(),
  avatarUrl: getAvatarPublicUrl(row.avatar_path),
  badgeKey: String(row.badge_key || '').trim() || null,
  correctCount: toInteger(row.correct_count),
  totalQuestions: toInteger(row.total_questions),
  totalElapsedMs: toInteger(row.total_elapsed_ms),
  quizLanguage: normalizeLanguage(row.quiz_language) || 'it',
  completedAt: toIsoTimestamp(row.completed_at),
});

export const GET: APIRoute = async ({ cookies, url }) => {
  const slug = normalizeSlug(url.searchParams.get('slug'));
  const language = normalizeLanguage(url.searchParams.get('language'));
  const limit = normalizeLimit(url.searchParams.get('limit'));

  if (!slug || !language || limit === null) {
    return jsonNoStore({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const session = await getUserSessionFromCookies(cookies);

    if (!session.user || !isStaffProfile(session.profile)) {
      return jsonNoStore({ ok: false, error: 'forbidden' }, 403);
    }

    const quiz = await getPublishedQuizBySlug(slug, language);

    if (!quiz || !isTechnicalId(quiz.quizKey)) {
      return jsonNoStore({ ok: false, error: 'quiz_not_found' }, 404);
    }

    const { data, error } = await supabaseAdmin.rpc(
      'get_quiz_staff_leaderboard',
      {
        p_quiz_key: quiz.quizKey,
        p_limit: limit,
      }
    );

    if (error) {
      console.error('Quiz staff leaderboard RPC failed:', {
        quizId: quiz._id,
        code: error.code,
        message: error.message,
      });

      return jsonNoStore({ ok: false, error: 'staff_leaderboard_unavailable' }, 500);
    }

    const leaderboard = Array.isArray(data)
      ? (data as StaffLeaderboardRpcRow[]).map(normalizeStaffLeaderboardRow)
      : [];

    return jsonNoStore({
      ok: true,
      totalStaff: leaderboard.length,
      leaderboard,
    });
  } catch (error) {
    console.error('Quiz staff leaderboard endpoint failed:', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonNoStore({ ok: false, error: 'staff_leaderboard_unavailable' }, 500);
  }
};

export const POST: APIRoute = async () =>
  jsonNoStore({ ok: false, error: 'invalid_request' }, 405);
