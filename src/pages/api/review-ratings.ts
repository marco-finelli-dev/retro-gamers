import type { APIRoute } from 'astro';
import { logApiError } from '../../lib/api-errors';
import {
  cleanReviewRatingPostId,
  isValidReviewRatingScore,
  roundReviewRatingScore,
} from '../../lib/review-ratings';
import { getUserSessionFromCookies } from '../../lib/supabase/auth';
import { supabaseAdmin } from '../../lib/supabase/server';
import { touchUserActivity } from '../../lib/supabase/user-activity';

type RatingRow = {
  score: number | string;
};

type RatingPayload = {
  postId?: string;
  score?: number;
  lang?: string;
};

const RATING_EDIT_WINDOW_MS = 5 * 60 * 1000;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUserRatingEditable = (createdAt?: string | null) => {
  if (!createdAt) {
    return false;
  }

  const createdAtMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return Date.now() - createdAtMs <= RATING_EDIT_WINDOW_MS;
};

const getEditWindowExpiresAt = (createdAt?: string | null) => {
  if (!createdAt) {
    return null;
  }

  const createdAtMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs + RATING_EDIT_WINDOW_MS).toISOString();
};

const lockedRatingMessage = (lang?: string | null) =>
  lang === 'en'
    ? 'Your rating can no longer be changed.'
    : 'Il voto non è più modificabile.';

const getRatingSummary = async (postId: string, userId?: string | null) => {
  const { data, error } = await supabaseAdmin
    .from('review_ratings')
    .select('score')
    .eq('post_id', postId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as RatingRow[];
  const totalVotes = rows.length;
  const totalScore = rows.reduce((sum, row) => sum + Number(row.score || 0), 0);
  const averageScore = totalVotes > 0
    ? roundReviewRatingScore(totalScore / totalVotes)
    : null;

  let myScore: number | null = null;
  let userRatingCreatedAt: string | null = null;
  let editWindowExpiresAt: string | null = null;
  let canEditUserRating = true;

  if (userId) {
    const { data: myRating, error: myRatingError } = await supabaseAdmin
      .from('review_ratings')
      .select('id, score, created_at')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (myRatingError) {
      throw myRatingError;
    }

    if (myRating) {
      myScore = myRating.score === undefined || myRating.score === null
        ? null
        : Number(myRating.score);
      userRatingCreatedAt = myRating.created_at ?? null;
      editWindowExpiresAt = getEditWindowExpiresAt(userRatingCreatedAt);
      canEditUserRating = isUserRatingEditable(userRatingCreatedAt);
    }
  }

  return {
    averageScore,
    totalVotes,
    myScore,
    userRatingCreatedAt,
    editWindowExpiresAt,
    canEditUserRating,
  };
};

export const GET: APIRoute = async ({ url, cookies }) => {
  const postId = cleanReviewRatingPostId(url.searchParams.get('postId'));

  if (!postId) {
    return json({ ok: false, error: 'Parametro postId mancante.' }, 400);
  }

  const session = await getUserSessionFromCookies(cookies);
  const isAuthenticated = Boolean(!session.error && session.user && session.profile);
  const userId = isAuthenticated ? session.user?.id ?? null : null;

  try {
    const summary = await getRatingSummary(postId, userId);

    return json({
      ...summary,
      isAuthenticated,
    });
  } catch (error) {
    logApiError('review-ratings.summary', error);
    return json({ ok: false, error: 'Voti lettori non disponibili.' }, 500);
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({
      ok: false,
      error: session.error || 'Devi effettuare il login per votare.',
    }, session.status || 401);
  }

  let payload: RatingPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const postId = cleanReviewRatingPostId(payload.postId);
  const score = Number(payload.score);
  const lang = payload.lang === 'en' ? 'en' : 'it';

  if (!postId) {
    return json({ ok: false, error: 'Recensione non valida.' }, 400);
  }

  if (!isValidReviewRatingScore(score)) {
    return json({ ok: false, error: 'Voto non valido.' }, 400);
  }

  try {
    const { data: existingRating, error: existingRatingError } = await supabaseAdmin
      .from('review_ratings')
      .select('id, score, created_at')
      .eq('post_id', postId)
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (existingRatingError) {
      throw existingRatingError;
    }

    if (existingRating && !isUserRatingEditable(existingRating.created_at)) {
      const summary = await getRatingSummary(postId, session.user.id);

      return json({
        ok: false,
        code: 'rating_edit_expired',
        error: lockedRatingMessage(lang),
        averageScore: summary.averageScore,
        totalVotes: summary.totalVotes,
        myScore: summary.myScore,
        userRatingCreatedAt: summary.userRatingCreatedAt,
        editWindowExpiresAt: summary.editWindowExpiresAt,
        canEditUserRating: false,
        isAuthenticated: true,
      }, 409);
    }

    if (existingRating) {
      const { error } = await supabaseAdmin
        .from('review_ratings')
        .update({ score })
        .eq('id', existingRating.id)
        .eq('user_id', session.user.id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabaseAdmin
        .from('review_ratings')
        .insert({
          post_id: postId,
          user_id: session.user.id,
          score,
        });

      if (error) {
        throw error;
      }
    }

    const summary = await getRatingSummary(postId, session.user.id);
    await touchUserActivity(session.user.id, 'review-rating-save');

    return json({
      averageScore: summary.averageScore,
      totalVotes: summary.totalVotes,
      myScore: summary.myScore ?? score,
      userRatingCreatedAt: summary.userRatingCreatedAt,
      editWindowExpiresAt: summary.editWindowExpiresAt,
      canEditUserRating: summary.canEditUserRating,
      isAuthenticated: true,
    });
  } catch (error) {
    logApiError('review-ratings.upsert', error);
    return json({ ok: false, error: 'Voto non aggiornato. Riprova più tardi.' }, 500);
  }
};
