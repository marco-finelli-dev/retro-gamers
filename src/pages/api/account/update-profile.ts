import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';
import { touchUserActivity } from '../../../lib/supabase/user-activity';

type UpdateProfilePayload = {
  displayName?: string;
  badgeKey?: string;
  bio?: string;
  bioEn?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  let payload: UpdateProfilePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const displayName = payload.displayName?.trim() ?? '';
  const badgeKey = payload.badgeKey?.trim() ?? '';
  const hasDisplayName = typeof payload.displayName === 'string';
  const hasBadgeKey = typeof payload.badgeKey === 'string';
  const canEditDisplayName = session.profile.role === 'admin';
  const hasProfileFields = hasDisplayName || hasBadgeKey;
  const hasBio = typeof payload.bio === 'string';
  const hasBioEn = typeof payload.bioEn === 'string';
  const updatePayload: {
    display_name?: string;
    badge_key?: string;
    bio?: string | null;
    bio_en?: string | null;
  } = {};

  if (!hasProfileFields && !hasBio && !hasBioEn) {
    return json({ ok: false, error: 'Nessun dato da aggiornare.' }, 400);
  }

  if (hasProfileFields) {
    if (hasDisplayName && canEditDisplayName && (displayName.length < 2 || displayName.length > 40)) {
      return json({
        ok: false,
        error: 'Il nome visualizzato deve contenere 2-40 caratteri.',
      }, 400);
    }

    if (hasBadgeKey && !badgeKey) {
      return json({ ok: false, error: 'Scegli un badge lettore.' }, 400);
    }

    if (hasBadgeKey) {
      const { data: badge, error: badgeError } = await supabaseAdmin
        .from('user_badges')
        .select('key')
        .eq('key', badgeKey)
        .eq('is_active', true)
        .maybeSingle();

      if (badgeError) {
        logApiError('account-update-profile.badge-lookup', badgeError);
        return json({ ok: false, error: 'Badge non disponibile. Riprova più tardi.' }, 500);
      }

      if (!badge) {
        return json({ ok: false, error: 'Badge non valido.' }, 400);
      }

      updatePayload.badge_key = badgeKey;
    }

    if (hasDisplayName && canEditDisplayName) {
      updatePayload.display_name = displayName;
    }
  }

  const normalizeBio = (value: string) =>
    String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();

  if (hasBio) {
    const bio = normalizeBio(payload.bio || '');

    if (bio.length > 500) {
      return json({ ok: false, error: 'La bio non può superare 500 caratteri.' }, 400);
    }

    updatePayload.bio = bio || null;
  }

  if (hasBioEn) {
    const bioEn = normalizeBio(payload.bioEn || '');

    if (bioEn.length > 500) {
      return json({ ok: false, error: 'La bio inglese non può superare 500 caratteri.' }, 400);
    }

    updatePayload.bio_en = bioEn || null;
  }

  const selectFields = hasBio || hasBioEn
    ? `
      id,
      user_id,
      username,
      display_name,
      bio,
      bio_en,
      badge_key,
      role,
      status,
      user_badges (
        key,
        label_it,
        label_en,
        image_path
      )
    `
    : `
      id,
      user_id,
      username,
      display_name,
      badge_key,
      role,
      status,
      user_badges (
        key,
        label_it,
        label_en,
        image_path
      )
    `;

  if (Object.keys(updatePayload).length === 0) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(selectFields)
      .eq('user_id', session.user.id)
      .single();

    if (profileError) {
      logApiError('account-update-profile.noop-profile', profileError);
      return json({ ok: false, error: 'Profilo non aggiornato. Riprova più tardi.' }, 500);
    }

    return json({
      ok: true,
      message: 'Nessun dato aggiornato.',
      profile,
    });
  }

  const { data: profile, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('user_id', session.user.id)
    .select(selectFields)
    .single();

  if (updateError) {
    logApiError('account-update-profile.update', updateError);
    return json({ ok: false, error: 'Profilo non aggiornato. Riprova più tardi.' }, 500);
  }

  await touchUserActivity(session.user.id, 'account-update-profile');

  return json({
    ok: true,
    message: (hasBio || hasBioEn) && !hasProfileFields ? 'Bio aggiornata.' : 'Profilo aggiornato.',
    profile,
  });
};
