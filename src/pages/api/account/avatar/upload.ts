import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  avatarMimeExtensions,
  getAvatarPublicUrl,
  isMissingAvatarColumnError,
} from '../../../../lib/supabase/avatars';
import { getUserProfileFromToken } from '../../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../../lib/supabase/server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const file = formData.get('avatar');

  if (!(file instanceof File)) {
    return json({ ok: false, error: 'File non valido. Usa JPG, PNG o WebP.' }, 400);
  }

  const extension = avatarMimeExtensions[file.type];

  if (!extension) {
    return json({ ok: false, error: 'File non valido. Usa JPG, PNG o WebP.' }, 400);
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return json({ ok: false, error: 'Il file è troppo grande. Dimensione massima: 2 MB.' }, 400);
  }

  const previousAvatarPath = session.profile.avatar_path || null;
  const avatarPath = `${session.user.id}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .upload(avatarPath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    logApiError('account-avatar-upload.storage', uploadError);
    return json({ ok: false, error: 'Avatar non caricato. Riprova più tardi.' }, 500);
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ avatar_path: avatarPath })
    .eq('user_id', session.user.id);

  if (updateError) {
    await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    logApiError('account-avatar-upload.profile', updateError);

    const error = isMissingAvatarColumnError(updateError)
      ? 'Avatar non disponibile. Esegui lo SQL profile-avatar.sql in Supabase.'
      : 'Avatar non aggiornato. Riprova più tardi.';

    return json({ ok: false, error }, isMissingAvatarColumnError(updateError) ? 409 : 500);
  }

  if (previousAvatarPath && previousAvatarPath !== avatarPath) {
    const { error: removeError } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .remove([previousAvatarPath]);

    if (removeError) {
      logApiError('account-avatar-upload.remove-previous', removeError);
    }
  }

  return json({
    ok: true,
    message: 'Avatar aggiornato.',
    avatarPath,
    avatarUrl: getAvatarPublicUrl(avatarPath),
  });
};
