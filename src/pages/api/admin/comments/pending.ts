import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserProfileFromToken, isStaffProfile } from '../../../../lib/supabase/auth';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const { data, error } = await supabaseAdmin
    .from('comments')
    .select(`
      id,
      article_slug,
      article_language,
      article_title,
      article_url,
      parent_id,
      body,
      status,
      created_at,
      profiles:profile_id (
        id,
        username,
        display_name,
        badge_key,
        role,
        user_badges (
          key,
          label_it,
          label_en,
          image_path
        )
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  return json({
    ok: true,
    comments: data ?? [],
  });
};
