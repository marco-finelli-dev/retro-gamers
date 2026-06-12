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

const allowedStatuses = new Set(['all', 'pending', 'approved', 'rejected', 'spam', 'deleted']);
const allowedLanguages = new Set(['all', 'it', 'en']);

const normalizeSearch = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);

export const GET: APIRoute = async ({ cookies, url }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const statusParam = url.searchParams.get('status') || 'all';
  const languageParam = url.searchParams.get('language') || 'all';
  const status = allowedStatuses.has(statusParam) ? statusParam : 'all';
  const language = allowedLanguages.has(languageParam) ? languageParam : 'all';
  const search = normalizeSearch(url.searchParams.get('q') || '');

  let query = supabaseAdmin
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
    .order('created_at', { ascending: false })
    .limit(120);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (language !== 'all') {
    query = query.eq('article_language', language);
  }

  const { data, error } = await query;

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  let comments = data ?? [];

  if (search) {
    comments = comments.filter((comment) => {
      const profile = comment.profiles || {};
      const haystack = [
        comment.body,
        comment.article_title,
        comment.article_slug,
        profile.display_name,
        profile.username,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }

  const parentIds = [
    ...new Set(
      comments
        .map((comment) => comment.parent_id)
        .filter((parentId): parentId is string => Boolean(parentId))
    ),
  ];

  if (parentIds.length > 0) {
    const { data: parents, error: parentsError } = await supabaseAdmin
      .from('comments')
      .select(`
        id,
        body,
        created_at,
        profiles:profile_id (
          username,
          display_name
        )
      `)
      .in('id', parentIds);

    if (parentsError) {
      return json({ ok: false, error: parentsError.message }, 500);
    }

    const parentsById = new Map((parents ?? []).map((parent) => [parent.id, parent]));

    comments = comments.map((comment) => ({
      ...comment,
      parent: comment.parent_id ? parentsById.get(comment.parent_id) ?? null : null,
    }));
  }

  return json({
    ok: true,
    filters: {
      status,
      language,
      q: search,
    },
    comments,
  });
};
