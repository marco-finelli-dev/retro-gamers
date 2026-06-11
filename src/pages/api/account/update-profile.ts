import type { APIRoute } from 'astro';
import { getUserProfileFromToken } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type UpdateProfilePayload = {
  displayName?: string;
  badgeKey?: string;
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

  const { data: profile, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      display_name: displayName,
      badge_key: badgeKey,
    })
    .eq('user_id', session.user.id)
    .select(`
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
    `)
    .single();

  if (updateError) {
    return json({ ok: false, error: updateError.message }, 500);
  }

  return json({
    ok: true,
    message: 'Profilo aggiornato.',
    profile,
  });
};
