import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../../lib/supabase/server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const allowedStatuses = new Set(['open', 'resolved', 'archived', 'all']);

const isCommentReportsUnavailable = (error: unknown) => {
  const apiError = error as { code?: string; message?: string } | null;
  const message = apiError?.message || '';

  return apiError?.code === '42P01'
    || apiError?.code === 'PGRST205'
    || message.includes('comment_reports');
};

const stripHash = (url: string) => url.split('#')[0] || url;

const buildCommentUrl = (comment: { article_url?: string | null } | null, commentId: string) => {
  const articleUrl = String(comment?.article_url || '').trim();

  if (!articleUrl) {
    return '';
  }

  return `${stripHash(articleUrl)}#comment-${commentId}`;
};

const buildArticleUrl = (comment: { article_url?: string | null } | null) => {
  const articleUrl = String(comment?.article_url || '').trim();

  return articleUrl ? stripHash(articleUrl) : '';
};

const buildAdminCommentUrl = (comment: { status?: string | null; deleted_at?: string | null } | null) => {
  const status = comment?.deleted_at
    ? 'deleted'
    : String(comment?.status || 'all').trim() || 'all';

  return `/admin/comments/?status=${encodeURIComponent(status)}`;
};

const getRelatedComment = (value: unknown): Record<string, any> | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return (value as Record<string, any> | null) ?? null;
};

const getProfilesByUserId = async (userIds: string[]) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueUserIds.length === 0) {
    return new Map<string, unknown>();
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id, username, display_name, role, status')
    .in('user_id', uniqueUserIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((profile) => [profile.user_id, profile]));
};

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const statusParam = String(url.searchParams.get('status') || 'open');
  const status = allowedStatuses.has(statusParam) ? statusParam : 'open';

  let query = supabaseAdmin
    .from('comment_reports')
    .select(`
      id,
      comment_id,
      reporter_id,
      reported_user_id,
      reason,
      status,
      admin_note,
      created_at,
      updated_at,
      resolved_at,
      comments:comment_id (
        id,
        article_slug,
        article_language,
        article_title,
        article_url,
        parent_id,
        body,
        status,
        deleted_at,
        user_id,
        created_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    logApiError('admin-comment-reports.list', error);
    return json({
      ok: false,
      error: isCommentReportsUnavailable(error)
        ? 'Segnalazioni commenti non disponibili. Esegui lo SQL comment-reports.sql in Supabase.'
        : 'Segnalazioni commenti non disponibili.',
    }, isCommentReportsUnavailable(error) ? 503 : 500);
  }

  try {
    const userIds = (data ?? []).flatMap((report) => [
      report.reporter_id,
      report.reported_user_id,
      getRelatedComment(report.comments)?.user_id,
    ]);
    const profiles = await getProfilesByUserId(userIds);
    const reports = (data ?? []).map((report) => {
      const comment = getRelatedComment(report.comments);
      const reportedUserId = report.reported_user_id || comment?.user_id || '';

      return {
        id: report.id,
        commentId: report.comment_id,
        reason: report.reason,
        status: report.status,
        adminNote: report.admin_note,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        resolvedAt: report.resolved_at,
        articleUrl: buildArticleUrl(comment),
        commentUrl: buildCommentUrl(comment, report.comment_id),
        adminCommentUrl: buildAdminCommentUrl(comment),
        comment,
        reporter: profiles.get(report.reporter_id) ?? null,
        reportedUser: reportedUserId ? profiles.get(reportedUserId) ?? null : null,
      };
    });

    return json({ ok: true, reports, filters: { status } });
  } catch (profilesError) {
    logApiError('admin-comment-reports.profiles', profilesError);
    return json({ ok: false, error: 'Profili segnalazioni non disponibili.' }, 500);
  }
};
