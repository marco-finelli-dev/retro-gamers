import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { isMissingCommentModerationColumnError } from '../../../../lib/supabase/comment-moderation';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const allowedStatuses = new Set(['all', 'pending', 'pending_review', 'approved', 'rejected', 'spam', 'deleted']);
const allowedLanguages = new Set(['all', 'it', 'en']);

const normalizeSearch = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const statusParam = url.searchParams.get('status') || 'all';
  const languageParam = url.searchParams.get('language') || 'all';
  const requestedStatus = allowedStatuses.has(statusParam) ? statusParam : 'all';
  const status = requestedStatus === 'pending_review' ? 'pending' : requestedStatus;
  const language = allowedLanguages.has(languageParam) ? languageParam : 'all';
  const search = normalizeSearch(url.searchParams.get('q') || '');

  const selectFields = (includeModeration: boolean) => `
      id,
      article_slug,
      article_language,
      article_title,
      article_url,
      parent_id,
      body,
      status,
      ${includeModeration ? 'moderation_reason, moderated_at,' : ''}
      deleted_at,
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
    `;

  const buildQuery = (includeModeration: boolean) => {
    let query = supabaseAdmin
      .from('comments')
      .select(selectFields(includeModeration))
      .order('created_at', { ascending: false })
      .limit(120);

    if (status === 'deleted') {
      query = query.not('deleted_at', 'is', null);
    } else if (status !== 'all') {
      query = query.eq('status', status).is('deleted_at', null);
    }

    if (language !== 'all') {
      query = query.eq('article_language', language);
    }

    return query;
  };

  let { data, error } = await buildQuery(true);

  if (isMissingCommentModerationColumnError(error)) {
    const fallbackResult = await buildQuery(false);
    data = fallbackResult.data?.map((comment) => ({
      ...comment,
      moderation_reason: null,
      moderated_at: null,
    })) ?? null;
    error = fallbackResult.error;
  }

  if (error) {
    logApiError('admin-comments-pending.comments', error);
    return json({ ok: false, error: 'Commenti non disponibili. Riprova più tardi.' }, 500);
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
      logApiError('admin-comments-pending.parents', parentsError);
      return json({ ok: false, error: 'Contesto risposta non disponibile.' }, 500);
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
      status: requestedStatus,
      language,
      q: search,
    },
    comments,
  });
};
