export type CommunityBanSubject = 'account' | 'guest' | 'ip';
export type CommunityBanStatus = 'restricted' | 'blocked' | 'banned';
export type CommunityAccessState = 'active' | 'restricted' | 'blocked' | 'banned';

export const getCommunityAccessFromBans = (
  bans: Array<{ status: CommunityBanStatus }>,
  fallbackState: CommunityAccessState = 'active'
): CommunityAccessState => {
  if (bans.some((ban) => ban.status === 'banned')) return 'banned';
  if (bans.some((ban) => ban.status === 'blocked')) return 'blocked';
  if (bans.some((ban) => ban.status === 'restricted')) return 'restricted';
  return fallbackState;
};

export const getModerationExpiry = ({
  duration,
  customExpiresAt,
  now = Date.now(),
}: {
  duration: '24h' | '7d' | '30d' | 'custom' | 'permanent';
  customExpiresAt?: string | null;
  now?: number;
}) => {
  const durations = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  } as const;

  if (duration === 'permanent') return null;

  if (duration === 'custom') {
    const customTimestamp = Date.parse(String(customExpiresAt || ''));

    if (!Number.isFinite(customTimestamp) || customTimestamp <= now) {
      throw new Error('invalid_custom_expiry');
    }

    return new Date(customTimestamp).toISOString();
  }

  return new Date(now + durations[duration]).toISOString();
};
