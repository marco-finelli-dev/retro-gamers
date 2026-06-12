import { supabaseAdmin } from './server';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const avatarMimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function getAvatarPublicUrl(avatarPath?: string | null) {
  const value = avatarPath?.trim();

  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const normalizedPath = value.replace(/^\/+/, '');
  const { data } = supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(normalizedPath);

  return data.publicUrl || '';
}

export function isMissingAvatarColumnError(
  error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined
) {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (message.includes('avatar_path') &&
      (message.includes('column') || message.includes('schema cache')))
  );
}
