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

type CurrentUserStatus =
  | 'anonymous'
  | 'eligible'
  | 'staff_excluded'
  | 'no_official_result';

type LeaderboardRpcRow = {
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
  is_current_user?: boolean | null;
  total_eligible?: number | string | null;
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

const normalizeLeaderboardRow = (row: LeaderboardRpcRow) => ({
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
  isCurrentUser: row.is_current_user === true,
});

export const GET: APIRoute = async ({ cookies, url }) => {
  const slug = normalizeSlug(url.searchParams.get('slug'));
  const language = normalizeLanguage(url.searchParams.get('language'));
  const limit = normalizeLimit(url.searchParams.get('limit'));

  if (!slug || !language || limit === null) {
    return jsonNoStore({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const quiz = await getPublishedQuizBySlug(slug, language);

    if (!quiz || !isTechnicalId(quiz.quizKey)) {
      return jsonNoStore({ ok: false, error: 'quiz_not_found' }, 404);
    }

    const session = await getUserSessionFromCookies(cookies);
    const authenticatedUserId = session.user?.id && session.profile
      ? session.user.id
      : null;
    const isStaff = Boolean(session.profile && isStaffProfile(session.profile));
    const rpcUserId = authenticatedUserId && !isStaff
      ? authenticatedUserId
      : null;

    const { data, error } = await supabaseAdmin.rpc(
      'get_quiz_leaderboard',
      {
        p_quiz_key: quiz.quizKey,
        p_limit: limit,
        p_user_id: rpcUserId,
      }
    );

    if (error) {
      console.error('Quiz leaderboard RPC failed:', {
        quizKey: quiz.quizKey,
        quizId: quiz._id,
        code: error.code,
        message: error.message,
      });

      return jsonNoStore({ ok: false, error: 'leaderboard_unavailable' }, 500);
    }

    const rows = Array.isArray(data)
      ? (data as LeaderboardRpcRow[])
      : [];
    const normalizedRows = rows.map(normalizeLeaderboardRow);
    const totalEligible = rows.length > 0
      ? toInteger(rows[0]?.total_eligible)
      : 0;
    const leaderboard = normalizedRows.filter((row) => row.rank <= limit);
    const currentUser = rpcUserId
      ? normalizedRows.find((row) => row.isCurrentUser) || null
      : null;

    let currentUserStatus: CurrentUserStatus = 'anonymous';

    if (authenticatedUserId && isStaff) {
      currentUserStatus = 'staff_excluded';
    } else if (authenticatedUserId && currentUser) {
      currentUserStatus = 'eligible';
    } else if (authenticatedUserId) {
      currentUserStatus = 'no_official_result';
    }

    return jsonNoStore({
      ok: true,
      quizKey: quiz.quizKey,
      totalEligible,
      leaderboard,
      currentUser,
      currentUserStatus,
    });
  } catch (error) {
    console.error('Quiz leaderboard endpoint failed:', {
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonNoStore({ ok: false, error: 'leaderboard_unavailable' }, 500);
  }
};

export const POST: APIRoute = async () =>
  jsonNoStore({ ok: false, error: 'invalid_request' }, 405);
