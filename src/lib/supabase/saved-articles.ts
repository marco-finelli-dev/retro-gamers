import { logApiError } from '../api-errors';
import { supabaseAdmin } from './server';

export type SavedArticleRow = {
  id: string;
  article_id: string;
  article_title: string;
  article_category: string | null;
  article_url: string;
  article_language: string;
  saved_at: string;
};

export const isSavedArticlesUnavailableError = (
  error: { code?: string; message?: string; details?: string } | null | undefined
) => {
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

export const getSavedArticlesForUser = async (userId: string, context = 'saved-articles') => {
  const { data, error } = await supabaseAdmin
    .from('saved_articles')
    .select('id, article_id, article_title, article_category, article_url, article_language, saved_at')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });

  if (!error) {
    return {
      articles: (data ?? []) as SavedArticleRow[],
      unavailable: false,
    };
  }

  if (!isSavedArticlesUnavailableError(error)) {
    logApiError(context, error);
  }

  return {
    articles: [] as SavedArticleRow[],
    unavailable: true,
  };
};
