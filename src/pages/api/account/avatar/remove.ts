import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  AVATAR_BUCKET,
  isMissingAvatarColumnError,
} from '../../../../lib/supabase/avatars';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { touchUserActivity } from '../../../../lib/supabase/user-activity';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  const previousAvatarPath = session.profile.avatar_path || null;

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ avatar_path: null })
    .eq('user_id', session.user.id);

  if (updateError) {
    logApiError('account-avatar-remove.profile', updateError);

    const error = isMissingAvatarColumnError(updateError)
      ? 'Avatar non disponibile. Esegui lo SQL profile-avatar.sql in Supabase.'
      : 'Avatar non rimosso. Riprova più tardi.';

    return json({ ok: false, error }, isMissingAvatarColumnError(updateError) ? 409 : 500);
  }

  if (previousAvatarPath) {
    const { error: removeError } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .remove([previousAvatarPath]);

    if (removeError) {
      logApiError('account-avatar-remove.storage', removeError);
    }
  }

  await touchUserActivity(session.user.id, 'account-avatar-remove');

  return json({
    ok: true,
    message: 'Avatar rimosso.',
  });
};
