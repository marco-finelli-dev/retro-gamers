import { logApiError } from '../api-errors';
import { supabaseAdmin } from './server';

export const isUserActivityUnavailable = (error: { code?: string; message?: string; details?: string } | null | undefined) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    message.includes('last_activity_at') ||
    message.includes('touch_user_activity') ||
    (
      (error.code === '42703' ||
        error.code === '42883' ||
        error.code === 'PGRST202' ||
        error.code === 'PGRST204') &&
      (message.includes('last_activity') || message.includes('touch_user'))
    )
  );
};

export async function touchUserActivity(userId?: string | null, context = 'unknown') {
  if (!userId) {
    return { ok: false, skipped: true, error: null };
  }

  const { error } = await supabaseAdmin.rpc('touch_user_activity', {
    p_user_id: userId,
  });

  if (!error) {
    return { ok: true, skipped: false, error: null };
  }

  if (isUserActivityUnavailable(error)) {
    return { ok: false, skipped: true, error };
  }

  logApiError(`user-activity.${context}`, error);

  return { ok: false, skipped: false, error };
}
