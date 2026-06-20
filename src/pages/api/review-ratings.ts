import type { APIRoute } from 'astro';
import { logApiError } from '../../lib/api-errors';
import {
  cleanReviewRatingPostId,
  isValidReviewRatingScore,
  roundReviewRatingScore,
} from '../../lib/review-ratings';
import { getUserSessionFromCookies } from '../../lib/supabase/auth';
import { supabaseAdmin } from '../../lib/supabase/server';

type RatingRow = {
  score: number | string;
};

type RatingPayload = {
  postId?: string;
  score?: number;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

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

  if (userId) {
    const { data: myRating, error: myRatingError } = await supabaseAdmin
      .from('review_ratings')
      .select('score')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (myRatingError) {
      throw myRatingError;
    }

    myScore = myRating?.score === undefined || myRating?.score === null
      ? null
      : Number(myRating.score);
  }

  return {
    averageScore,
    totalVotes,
    myScore,
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

  if (!postId) {
    return json({ ok: false, error: 'Recensione non valida.' }, 400);
  }

  if (!isValidReviewRatingScore(score)) {
    return json({ ok: false, error: 'Voto non valido.' }, 400);
  }

  try {
    const { error } = await supabaseAdmin
      .from('review_ratings')
      .upsert({
        post_id: postId,
        user_id: session.user.id,
        score,
      }, {
        onConflict: 'post_id,user_id',
      });

    if (error) {
      throw error;
    }

    const summary = await getRatingSummary(postId, session.user.id);

    return json({
      averageScore: summary.averageScore,
      totalVotes: summary.totalVotes,
      myScore: summary.myScore ?? score,
      isAuthenticated: true,
    });
  } catch (error) {
    logApiError('review-ratings.upsert', error);
    return json({ ok: false, error: 'Voto non aggiornato. Riprova più tardi.' }, 500);
  }
};
