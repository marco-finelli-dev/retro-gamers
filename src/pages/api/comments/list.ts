import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase/server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ url }) => {
  const articleSlug = url.searchParams.get('articleSlug')?.trim() ?? '';
  const articleLanguage = url.searchParams.get('articleLanguage') === 'en' ? 'en' : 'it';

  if (!articleSlug) {
    return json({ ok: false, error: 'Parametro articleSlug mancante.' }, 400);
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
    .eq('article_slug', articleSlug)
    .eq('article_language', articleLanguage)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  const comments = data ?? [];

  const roots = comments.filter((comment) => !comment.parent_id);
  const replies = comments.filter((comment) => comment.parent_id);

  const threadedComments = roots.map((comment) => ({
    ...comment,
    replies: replies.filter((reply) => reply.parent_id === comment.id),
  }));

  return json({
    ok: true,
    comments: threadedComments,
  });
};
