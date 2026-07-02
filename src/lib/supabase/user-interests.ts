import { logApiError } from '../api-errors';
import { supabaseAdmin } from './server';

export const userInterestTypes = ['platform', 'creator', 'company'] as const;
export const userInterestsLimit = 15;

export type UserInterestType = typeof userInterestTypes[number];

export type UserInterestRow = {
  id: string;
  user_id?: string;
  target_type: UserInterestType;
  target_id: string;
  target_slug: string;
  target_name: string;
  target_extra: string | null;
  created_at: string;
};

export type InterestOption = {
  targetType: UserInterestType;
  targetId: string;
  targetSlug: string;
  targetName: string;
  targetExtra?: string | null;
};

export type InterestOptions = {
  platforms: InterestOption[];
  creators: InterestOption[];
  companies: InterestOption[];
};

export const isValidUserInterestType = (value: unknown): value is UserInterestType =>
  typeof value === 'string' && userInterestTypes.includes(value as UserInterestType);

export const isUserInterestsUnavailableError = (
  error: { code?: string; message?: string; details?: string } | null | undefined
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    message.includes('user_interests') &&
    (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.code === 'PGRST204' ||
      message.includes('schema cache') ||
      message.includes('does not exist')
    )
  );
};

export const getUserInterestsForUser = async (userId: string, context = 'user-interests') => {
  const { data, error } = await supabaseAdmin
    .from('user_interests')
    .select('id, target_type, target_id, target_slug, target_name, target_extra, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!error) {
    return {
      interests: (data ?? []) as UserInterestRow[],
      unavailable: false,
    };
  }

  if (!isUserInterestsUnavailableError(error)) {
    logApiError(context, error);
  }

  return {
    interests: [] as UserInterestRow[],
    unavailable: true,
  };
};
