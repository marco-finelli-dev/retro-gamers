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

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const allowedStatuses = new Set(['all', 'pending', 'pending_review', 'approved', 'rejected', 'deleted']);
const allowedLanguages = new Set(['all', 'it', 'en']);

const normalizeSearch = (value: string) =>
  value.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);

const normalizePositiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const escapeIlikeValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const statusParam = url.searchParams.get('status') || 'pending';
  const languageParam = url.searchParams.get('lang') || url.searchParams.get('language') || 'all';
  const requestedStatus = allowedStatuses.has(statusParam) ? statusParam : 'pending';
  const status = requestedStatus === 'pending_review' ? 'pending' : requestedStatus;
  const language = allowedLanguages.has(languageParam) ? languageParam : 'all';
  const search = normalizeSearch(url.searchParams.get('q') || '');
  const page = normalizePositiveInteger(url.searchParams.get('page'), 1);
  const pageSize = Math.min(normalizePositiveInteger(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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

  const matchingProfileIds = search
    ? await (async () => {
        const searchPattern = `%${escapeIlikeValue(search)}%`;
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .or(`username.ilike.${searchPattern},display_name.ilike.${searchPattern}`)
          .limit(500);

        if (profilesError) {
          logApiError('admin-comments-pending.profile-search', profilesError);
          return [];
        }

        return (profiles ?? [])
          .map((profile) => profile.id)
          .filter((id): id is string => Boolean(id));
      })()
    : [];

  const buildQuery = (includeModeration: boolean) => {
    let query = supabaseAdmin
      .from('comments')
      .select(selectFields(includeModeration), { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status === 'deleted') {
      query = query.not('deleted_at', 'is', null);
    } else if (status !== 'all') {
      query = query.eq('status', status).is('deleted_at', null);
    }

    if (language !== 'all') {
      query = query.eq('article_language', language);
    }

    if (search) {
      const searchPattern = `%${escapeIlikeValue(search)}%`;
      const searchFilters = [
        `body.ilike.${searchPattern}`,
        `article_title.ilike.${searchPattern}`,
        `article_slug.ilike.${searchPattern}`,
      ];

      if (matchingProfileIds.length > 0) {
        searchFilters.push(`profile_id.in.(${matchingProfileIds.join(',')})`);
      }

      query = query.or(searchFilters.join(','));
    }

    return query;
  };

  let { data, error, count } = await buildQuery(true);

  if (isMissingCommentModerationColumnError(error)) {
    const fallbackResult = await buildQuery(false);
    data = fallbackResult.data?.map((comment) => ({
      ...comment,
      moderation_reason: null,
      moderated_at: null,
    })) ?? null;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (error) {
    logApiError('admin-comments-pending.comments', error);
    return json({ ok: false, error: 'Commenti non disponibili. Riprova più tardi.' }, 500);
  }

  let comments = data ?? [];

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
      lang: language,
      q: search,
      page,
      pageSize,
    },
    pagination: {
      page,
      pageSize,
      total: count ?? comments.length,
      totalPages: Math.max(1, Math.ceil((count ?? comments.length) / pageSize)),
      hasPrev: page > 1,
      hasNext: page < Math.max(1, Math.ceil((count ?? comments.length) / pageSize)),
    },
    comments,
  });
};
