import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';
import { touchUserActivity } from '../../../lib/supabase/user-activity';

type SavedArticlePayload = {
  articleId?: string;
  articleSlug?: string;
  articleTitle?: string;
  articleLanguage?: string;
  articleCategory?: string | null;
  articleUrl?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const cleanText = (value: unknown, maxLength: number) =>
  String(value || '').trim().slice(0, maxLength);

const cleanLanguage = (value: unknown) => (value === 'en' ? 'en' : 'it');

const cleanArticleUrl = (value: unknown) => {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('/')) {
    return rawValue.slice(0, 320);
  }

  try {
    const parsedUrl = new URL(rawValue);

    if (parsedUrl.hostname === 'retro-gamers.it' || parsedUrl.hostname === 'www.retro-gamers.it') {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`.slice(0, 320);
    }
  } catch {
    return '';
  }

  return '';
};

const isSavedArticlesUnavailable = (error: { code?: string; message?: string; details?: string } | null | undefined) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    message.includes('saved_articles') &&
    (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.code === 'PGRST204' ||
      message.includes('schema cache') ||
      message.includes('does not exist')
    )
  );
};

export const GET: APIRoute = async ({ url, cookies }) => {
  const articleId = cleanText(url.searchParams.get('articleId'), 240);

  if (!articleId) {
    return json({ ok: false, error: 'Articolo non valido.' }, 400);
  }

  const session = await getUserSessionFromCookies(cookies);
  const isAuthenticated = Boolean(!session.error && session.user && session.profile);

  if (!isAuthenticated || !session.user?.id) {
    return json({
      ok: true,
      isAuthenticated: false,
      isSaved: false,
    });
  }

  const { data, error } = await supabaseAdmin
    .from('saved_articles')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('article_id', articleId)
    .maybeSingle();

  if (error) {
    if (!isSavedArticlesUnavailable(error)) {
      logApiError('saved-articles.lookup', error);
    }

    return json({
      ok: false,
      error: 'Articoli salvati non disponibili.',
      isAuthenticated: true,
      isSaved: false,
    }, 500);
  }

  return json({
    ok: true,
    isAuthenticated: true,
    isSaved: Boolean(data?.id),
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({
      ok: false,
      error: session.error || 'Devi effettuare il login per salvare articoli.',
    }, session.status || 401);
  }

  let payload: SavedArticlePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const articleId = cleanText(payload.articleId, 240);
  const articleSlug = cleanText(payload.articleSlug, 220);
  const articleTitle = cleanText(payload.articleTitle, 260);
  const articleLanguage = cleanLanguage(payload.articleLanguage);
  const articleCategory = cleanText(payload.articleCategory, 120) || null;
  const articleUrl = cleanArticleUrl(payload.articleUrl);

  if (!articleId || !articleSlug || !articleTitle || !articleUrl) {
    return json({ ok: false, error: 'Articolo non valido.' }, 400);
  }

  try {
    const { data: existingSavedArticle, error: lookupError } = await supabaseAdmin
      .from('saved_articles')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('article_id', articleId)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (existingSavedArticle?.id) {
      const { error: deleteError } = await supabaseAdmin
        .from('saved_articles')
        .delete()
        .eq('user_id', session.user.id)
        .eq('article_id', articleId);

      if (deleteError) {
        throw deleteError;
      }

      await touchUserActivity(session.user.id, 'saved-article-remove');

      return json({
        ok: true,
        isSaved: false,
      });
    }

    const { error: insertError } = await supabaseAdmin
      .from('saved_articles')
      .insert({
        user_id: session.user.id,
        article_id: articleId,
        article_slug: articleSlug,
        article_title: articleTitle,
        article_language: articleLanguage,
        article_category: articleCategory,
        article_url: articleUrl,
      });

    if (insertError) {
      throw insertError;
    }

    await touchUserActivity(session.user.id, 'saved-article-add');

    return json({
      ok: true,
      isSaved: true,
    });
  } catch (error) {
    if (!isSavedArticlesUnavailable(error as { code?: string; message?: string; details?: string })) {
      logApiError('saved-articles.toggle', error);
    }

    return json({ ok: false, error: 'Articolo non aggiornato. Riprova più tardi.' }, 500);
  }
};

export const DELETE: APIRoute = async ({ url, request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({
      ok: false,
      error: session.error || 'Devi effettuare il login per rimuovere articoli salvati.',
    }, session.status || 401);
  }

  let articleId = cleanText(url.searchParams.get('articleId'), 240);

  if (!articleId) {
    try {
      const payload = await request.json();
      articleId = cleanText(payload?.articleId, 240);
    } catch {
      articleId = '';
    }
  }

  if (!articleId) {
    return json({ ok: false, error: 'Articolo non valido.' }, 400);
  }

  try {
    const { error } = await supabaseAdmin
      .from('saved_articles')
      .delete()
      .eq('user_id', session.user.id)
      .eq('article_id', articleId);

    if (error) {
      throw error;
    }

    await touchUserActivity(session.user.id, 'saved-article-remove-account');

    return json({
      ok: true,
      isSaved: false,
    });
  } catch (error) {
    if (!isSavedArticlesUnavailable(error as { code?: string; message?: string; details?: string })) {
      logApiError('saved-articles.delete', error);
    }

    return json({ ok: false, error: 'Articolo salvato non rimosso. Riprova più tardi.' }, 500);
  }
};
