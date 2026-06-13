import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  assignReaderBadgeToUser,
  getReaderBadgeLabel,
  isBadgeAssignmentsUnavailable,
  removeReaderBadgeFromUser,
} from '../../../../../lib/badges';
import { getUserSessionFromCookies } from '../../../../../lib/supabase/auth';
import { createBadgeUnlockedAccountMessage } from '../../../../../lib/supabase/account-messages';
import { supabaseAdmin } from '../../../../../lib/supabase/server';

type BadgeUpdatePayload = {
  userId?: string;
  badgeKey?: string;
  action?: 'assign' | 'remove';
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isBadgeKey = (value: string) =>
  /^[a-z0-9_-]{2,80}$/.test(value);

const getNextAssignedBadgeKey = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from('user_badge_assignments')
    .select('badge_key, user_badges!inner (is_active)')
    .eq('user_id', userId)
    .eq('user_badges.is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      badgeKey: null,
      error,
    };
  }

  return {
    badgeKey: data?.badge_key || null,
    error: null,
  };
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (session.profile.role !== 'admin') {
    return json({ ok: false, error: 'Solo gli admin possono gestire i badge lettore.' }, 403);
  }

  let payload: BadgeUpdatePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const userId = payload.userId?.trim() ?? '';
  const badgeKey = payload.badgeKey?.trim() ?? '';
  const action = payload.action;

  if (!userId || !isUuid(userId)) {
    return json({ ok: false, error: 'Utente non valido.' }, 400);
  }

  if (!badgeKey || !isBadgeKey(badgeKey)) {
    return json({ ok: false, error: 'Badge non valido.' }, 400);
  }

  if (action !== 'assign' && action !== 'remove') {
    return json({ ok: false, error: 'Azione non valida.' }, 400);
  }

  const { data: targetProfile, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, username, display_name, badge_key')
    .eq('user_id', userId)
    .maybeSingle();

  if (targetError) {
    logApiError('admin-users-badges.target', targetError);
    return json({ ok: false, error: 'Utente non disponibile. Riprova più tardi.' }, 500);
  }

  if (!targetProfile) {
    return json({ ok: false, error: 'Profilo utente non trovato.' }, 404);
  }

  const { data: badge, error: badgeError } = await supabaseAdmin
    .from('user_badges')
    .select('key, label_it, label_en, image_path')
    .eq('key', badgeKey)
    .eq('is_active', true)
    .maybeSingle();

  if (badgeError) {
    logApiError('admin-users-badges.badge', badgeError);
    return json({ ok: false, error: 'Badge non disponibile. Riprova più tardi.' }, 500);
  }

  if (!badge) {
    return json({ ok: false, error: 'Badge non valido o non attivo.' }, 400);
  }

  if (action === 'assign') {
    const result = await assignReaderBadgeToUser({
      userId,
      badgeKey,
      assignedBy: session.user.id,
    });

    if (!result.ok) {
      const status = result.assignmentsAvailable ? 500 : 409;
      const error = result.assignmentsAvailable
        ? 'Assegnazione badge non riuscita. Riprova più tardi.'
        : 'Gestione badge non disponibile. Esegui lo SQL user-badges-admin.sql in Supabase.';

      if (result.error) {
        logApiError('admin-users-badges.assign', result.error);
      }

      return json({ ok: false, error }, status);
    }

    if (!targetProfile.badge_key) {
      const { error: currentBadgeError } = await supabaseAdmin
        .from('profiles')
        .update({ badge_key: badgeKey })
        .eq('user_id', userId);

      if (currentBadgeError) {
        logApiError('admin-users-badges.set-current', currentBadgeError);
        return json({ ok: false, error: 'Badge attivo non aggiornato. Riprova più tardi.' }, 500);
      }
    }

    if (!result.alreadyAssigned) {
      try {
        await createBadgeUnlockedAccountMessage({
          userId,
          badgeName: getReaderBadgeLabel(badge),
        });
      } catch (error) {
        console.error('Badge unlocked account message failed:', error);
      }
    }

    return json({
      ok: true,
      message: result.alreadyAssigned ? 'Badge già assegnato.' : 'Badge assegnato.',
    });
  }

  const removeResult = await removeReaderBadgeFromUser(userId, badgeKey);

  if (!removeResult.ok) {
    const status = removeResult.assignmentsAvailable ? 500 : 409;
    const error = removeResult.assignmentsAvailable
      ? 'Rimozione badge non riuscita. Riprova più tardi.'
      : 'Gestione badge non disponibile. Esegui lo SQL user-badges-admin.sql in Supabase.';

    if (removeResult.error) {
      logApiError('admin-users-badges.remove', removeResult.error);
    }

    return json({ ok: false, error }, status);
  }

  if (targetProfile.badge_key === badgeKey) {
    const nextBadge = await getNextAssignedBadgeKey(userId);

    if (nextBadge.error) {
      const error = isBadgeAssignmentsUnavailable(nextBadge.error)
        ? 'Gestione badge non disponibile. Esegui lo SQL user-badges-admin.sql in Supabase.'
        : 'Badge attivo non aggiornato. Riprova più tardi.';

      logApiError('admin-users-badges.next-current', nextBadge.error);

      return json({ ok: false, error }, 500);
    }

    const { error: currentBadgeError } = await supabaseAdmin
      .from('profiles')
      .update({ badge_key: nextBadge.badgeKey })
      .eq('user_id', userId);

    if (currentBadgeError) {
      logApiError('admin-users-badges.clear-current', currentBadgeError);
      return json({ ok: false, error: 'Badge attivo non aggiornato. Riprova più tardi.' }, 500);
    }
  }

  return json({
    ok: true,
    message: 'Badge rimosso.',
  });
};
