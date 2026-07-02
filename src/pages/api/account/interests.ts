import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import {
  getUserInterestsForUser,
  isUserInterestsUnavailableError,
  isValidUserInterestType,
  userInterestsLimit,
  type UserInterestRow,
} from '../../../lib/supabase/user-interests';
import { supabaseAdmin } from '../../../lib/supabase/server';
import { touchUserActivity } from '../../../lib/supabase/user-activity';

type InterestPayload = {
  id?: string;
  targetType?: string;
  targetId?: string;
  targetSlug?: string;
  targetName?: string;
  targetExtra?: string | null;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const cleanText = (value: unknown, maxLength: number) =>
  String(value || '').trim().slice(0, maxLength);

const normalizeInterestRow = (row: any): UserInterestRow => ({
  id: row.id,
  target_type: row.target_type,
  target_id: row.target_id,
  target_slug: row.target_slug,
  target_name: row.target_name,
  target_extra: row.target_extra || null,
  created_at: row.created_at,
});

export const GET: APIRoute = async ({ cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({
      ok: false,
      isAuthenticated: false,
      error: session.error || 'Sessione non valida.',
    }, session.status || 401);
  }

  const result = await getUserInterestsForUser(session.user.id, 'account-interests.list');

  if (result.unavailable) {
    return json({
      ok: false,
      isAuthenticated: true,
      error: 'Interessi non disponibili.',
      interests: [],
    }, 500);
  }

  return json({
    ok: true,
    isAuthenticated: true,
    interests: result.interests,
    limit: userInterestsLimit,
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({
      ok: false,
      error: session.error || 'Devi effettuare il login per aggiungere interessi.',
    }, session.status || 401);
  }

  let payload: InterestPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const targetType = cleanText(payload.targetType, 24);
  const targetId = cleanText(payload.targetId, 220);
  const targetSlug = cleanText(payload.targetSlug, 220);
  const targetName = cleanText(payload.targetName, 180);
  const targetExtra = cleanText(payload.targetExtra, 160) || null;

  if (!isValidUserInterestType(targetType) || !targetId || !targetSlug || !targetName) {
    return json({ ok: false, error: 'Interesse non valido.' }, 400);
  }

  try {
    const { data: existingInterest, error: existingError } = await supabaseAdmin
      .from('user_interests')
      .select('id, target_type, target_id, target_slug, target_name, target_extra, created_at')
      .eq('user_id', session.user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingInterest?.id) {
      return json({
        ok: true,
        alreadyExists: true,
        item: normalizeInterestRow(existingInterest),
        limit: userInterestsLimit,
      });
    }

    const { count, error: countError } = await supabaseAdmin
      .from('user_interests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) >= userInterestsLimit) {
      return json({ ok: false, error: 'Hai raggiunto il limite di 15 interessi.', code: 'limit_reached' }, 409);
    }

    const { data: insertedInterest, error: insertError } = await supabaseAdmin
      .from('user_interests')
      .insert({
        user_id: session.user.id,
        target_type: targetType,
        target_id: targetId,
        target_slug: targetSlug,
        target_name: targetName,
        target_extra: targetExtra,
      })
      .select('id, target_type, target_id, target_slug, target_name, target_extra, created_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return json({
          ok: true,
          alreadyExists: true,
          item: {
            id: '',
            target_type: targetType,
            target_id: targetId,
            target_slug: targetSlug,
            target_name: targetName,
            target_extra: targetExtra,
            created_at: new Date().toISOString(),
          },
          limit: userInterestsLimit,
        });
      }

      throw insertError;
    }

    await touchUserActivity(session.user.id, 'user-interest-add');

    return json({
      ok: true,
      alreadyExists: false,
      item: normalizeInterestRow(insertedInterest),
      limit: userInterestsLimit,
    });
  } catch (error) {
    if (!isUserInterestsUnavailableError(error as { code?: string; message?: string; details?: string })) {
      logApiError('account-interests.add', error);
    }

    return json({ ok: false, error: 'Interesse non aggiunto. Riprova più tardi.' }, 500);
  }
};

export const DELETE: APIRoute = async ({ url, request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({
      ok: false,
      error: session.error || 'Devi effettuare il login per rimuovere interessi.',
    }, session.status || 401);
  }

  let id = cleanText(url.searchParams.get('id'), 220);
  let targetType = cleanText(url.searchParams.get('targetType'), 24);
  let targetId = cleanText(url.searchParams.get('targetId'), 220);

  if (!id && (!targetType || !targetId)) {
    try {
      const payload = await request.json();
      id = cleanText(payload?.id, 220);
      targetType = cleanText(payload?.targetType, 24);
      targetId = cleanText(payload?.targetId, 220);
    } catch {
      id = '';
    }
  }

  if (!id && (!isValidUserInterestType(targetType) || !targetId)) {
    return json({ ok: false, error: 'Interesse non valido.' }, 400);
  }

  try {
    let deleteQuery = supabaseAdmin
      .from('user_interests')
      .delete()
      .eq('user_id', session.user.id);

    if (id) {
      deleteQuery = deleteQuery.eq('id', id);
    } else {
      deleteQuery = deleteQuery
        .eq('target_type', targetType)
        .eq('target_id', targetId);
    }

    const { error } = await deleteQuery;

    if (error) {
      throw error;
    }

    await touchUserActivity(session.user.id, 'user-interest-remove');

    return json({ ok: true });
  } catch (error) {
    if (!isUserInterestsUnavailableError(error as { code?: string; message?: string; details?: string })) {
      logApiError('account-interests.remove', error);
    }

    return json({ ok: false, error: 'Interesse non rimosso. Riprova più tardi.' }, 500);
  }
};
