import type { APIRoute } from 'astro';
import { readerOwnsBadge } from '../../../lib/badges';
import { getUserProfileFromToken } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type UpdateProfilePayload = {
  displayName?: string;
  badgeKey?: string;
  bio?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

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
  const hasProfileFields =
    typeof payload.displayName === 'string' || typeof payload.badgeKey === 'string';
  const hasBio = typeof payload.bio === 'string';
  const updatePayload: {
    display_name?: string;
    badge_key?: string;
    bio?: string | null;
  } = {};

  if (!hasProfileFields && !hasBio) {
    return json({ ok: false, error: 'Nessun dato da aggiornare.' }, 400);
  }

  if (hasProfileFields) {
    if (displayName.length < 2 || displayName.length > 40) {
      return json({
        ok: false,
        error: 'Il nome visualizzato deve contenere 2-40 caratteri.',
      }, 400);
    }

    if (!badgeKey) {
      return json({ ok: false, error: 'Scegli un badge lettore.' }, 400);
    }

    const { data: badge, error: badgeError } = await supabaseAdmin
      .from('user_badges')
      .select('key')
      .eq('key', badgeKey)
      .eq('is_active', true)
      .maybeSingle();

    if (badgeError) {
      return json({ ok: false, error: badgeError.message }, 500);
    }

    if (!badge) {
      return json({ ok: false, error: 'Badge non valido.' }, 400);
    }

    const ownership = await readerOwnsBadge(session.user.id, badgeKey);

    if (ownership.error && ownership.assignmentsAvailable) {
      return json({ ok: false, error: ownership.error.message }, 500);
    }

    if (ownership.assignmentsAvailable && !ownership.owns) {
      return json({
        ok: false,
        error: 'Puoi scegliere solo un badge assegnato al tuo profilo.',
      }, 403);
    }

    updatePayload.display_name = displayName;
    updatePayload.badge_key = badgeKey;
  }

  if (hasBio) {
    const bio = String(payload.bio || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();

    if (bio.length > 500) {
      return json({ ok: false, error: 'La bio non può superare 500 caratteri.' }, 400);
    }

    updatePayload.bio = bio || null;
  }

  const selectFields = hasBio
    ? `
      id,
      user_id,
      username,
      display_name,
      bio,
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

  const { data: profile, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('user_id', session.user.id)
    .select(selectFields)
    .single();

  if (updateError) {
    return json({ ok: false, error: updateError.message }, 500);
  }

  return json({
    ok: true,
    message: hasBio && !hasProfileFields ? 'Bio aggiornata.' : 'Profilo aggiornato.',
    profile,
  });
};
