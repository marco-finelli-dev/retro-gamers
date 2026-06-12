import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { supabasePublic, supabaseAdmin } from '../../../lib/supabase/server';
import { isBlockedProfileStatus } from '../../../lib/supabase/auth';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get('rg_access_token')?.value;

  if (!token) {
    return json({ ok: false, error: 'Sessione assente.' }, 401);
  }

  const { data: userData, error: userError } = await supabasePublic.auth.getUser(token);

  if (userError || !userData.user) {
    return json({ ok: false, error: 'Sessione non valida.' }, 401);
  }

  const user = userData.user;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      user_id,
      username,
      display_name,
      badge_key,
      role,
      status,
      notify_replies_to_my_comments,
      notify_threads_i_join,
      user_badges (
        key,
        label_it,
        label_en,
        image_path
      )
    `)
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    logApiError('auth-me.profile', profileError);
    return json({ ok: false, error: 'Profilo non disponibile. Riprova più tardi.' }, 500);
  }

  if (!profile) {
    return json({ ok: false, error: 'Profilo lettore non trovato.' }, 404);
  }

  if (isBlockedProfileStatus(profile.status)) {
    return json({ ok: false, error: 'Account bloccato.' }, 403);
  }

  return json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      emailConfirmedAt: user.email_confirmed_at,
    },
    profile,
  });
};
