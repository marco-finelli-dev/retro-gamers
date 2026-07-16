import { supabaseAdmin } from './server';
import {
  getCommunityAccessFromBans,
  type CommunityAccessState,
  type CommunityBanStatus,
  type CommunityBanSubject,
} from '../community-moderation';

type CommunityBanRow = {
  id: string;
  subject_type: CommunityBanSubject;
  status: CommunityBanStatus;
  reason: string;
  expires_at: string | null;
  created_at: string;
};

type CommunityAccess = {
  state: CommunityAccessState;
  bans: CommunityBanRow[];
};

const missingSchemaCodes = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);

export const isMissingCommunityBanSchemaError = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return missingSchemaCodes.has(error.code || '') || (
    (
      message.includes('community_bans') ||
      message.includes('community_ban_events')
    ) &&
    (
      message.includes('does not exist') ||
      message.includes('schema cache') ||
      message.includes('column') ||
      message.includes('relationship')
    )
  );
};

const getSubjectColumn = (subjectType: CommunityBanSubject) => {
  if (subjectType === 'account') return 'user_id';
  if (subjectType === 'guest') return 'guest_identity_id';
  return 'ip_hmac';
};

export async function getActiveCommunityBans(
  subjectType: CommunityBanSubject,
  subjectValue: string,
  now = new Date()
) {
  if (!subjectValue) return [] as CommunityBanRow[];

  const subjectColumn = getSubjectColumn(subjectType);
  const { data, error } = await supabaseAdmin
    .from('community_bans')
    .select('id, subject_type, status, reason, expires_at, created_at')
    .eq('subject_type', subjectType)
    .eq(subjectColumn, subjectValue)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
    .order('created_at', { ascending: false });

  if (isMissingCommunityBanSchemaError(error)) {
    return [] as CommunityBanRow[];
  }

  if (error) throw error;

  return (data ?? []) as CommunityBanRow[];
}

export async function getCommunityAccess({
  subjectType,
  subjectValue,
  fallbackState = 'active',
  now = new Date(),
}: {
  subjectType: CommunityBanSubject;
  subjectValue: string;
  fallbackState?: CommunityAccess['state'];
  now?: Date;
}): Promise<CommunityAccess> {
  const bans = await getActiveCommunityBans(subjectType, subjectValue, now);

  return {
    state: getCommunityAccessFromBans(bans, fallbackState),
    bans,
  };
}

export async function getGuestCommunityAccess({
  identityId,
  identityStatus,
  now = new Date(),
}: {
  identityId: string;
  identityStatus: string;
  now?: Date;
}): Promise<CommunityAccess> {
  const activeBans = await getActiveCommunityBans('guest', identityId, now);

  if (activeBans.length > 0) {
    return {
      state: getCommunityAccessFromBans(activeBans),
      bans: activeBans,
    };
  }

  if (identityStatus !== 'restricted' && identityStatus !== 'blocked') {
    return { state: 'active', bans: [] };
  }

  const { data: latestBan, error } = await supabaseAdmin
    .from('community_bans')
    .select('id, revoked_at, expires_at')
    .eq('subject_type', 'guest')
    .eq('guest_identity_id', identityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingCommunityBanSchemaError(error) || !latestBan) {
    return {
      state: identityStatus === 'blocked' ? 'blocked' : 'restricted',
      bans: [],
    };
  }

  if (error) throw error;

  const latestBanExpired =
    Boolean(latestBan.revoked_at) ||
    Boolean(latestBan.expires_at && Date.parse(latestBan.expires_at) <= now.getTime());

  if (latestBanExpired) {
    const { error: updateError } = await supabaseAdmin
      .from('guest_identities')
      .update({ status: 'active' })
      .eq('id', identityId)
      .in('status', ['restricted', 'blocked']);

    if (updateError) throw updateError;

    return { state: 'active', bans: [] };
  }

  return {
    state: identityStatus === 'blocked' ? 'blocked' : 'restricted',
    bans: [],
  };
}

export async function getIpBanEvasionSignals({
  ipHmac,
  currentIdentityId,
  since,
}: {
  ipHmac: string | null;
  currentIdentityId?: string | null;
  since: string;
}) {
  if (!ipHmac) {
    return {
      activeIpState: 'active' as const,
      linkedToBlockedIdentity: false,
    };
  }

  const [ipAccess, eventsResult] = await Promise.all([
    getCommunityAccess({
      subjectType: 'ip',
      subjectValue: ipHmac,
    }),
    supabaseAdmin
      .from('guest_comment_events')
      .select('guest_identity_id')
      .eq('ip_hmac', ipHmac)
      .gte('created_at', since)
      .limit(200),
  ]);

  if (eventsResult.error) throw eventsResult.error;

  const identityIds = [
    ...new Set(
      (eventsResult.data ?? [])
        .map((event) => String(event.guest_identity_id || ''))
        .filter((identityId) => identityId && identityId !== currentIdentityId)
    ),
  ];

  if (identityIds.length === 0) {
    return {
      activeIpState: ipAccess.state,
      linkedToBlockedIdentity: false,
    };
  }

  const [{ data: identities, error: identityError }, { data: bans, error: banError }] = await Promise.all([
    supabaseAdmin
      .from('guest_identities')
      .select('id, status')
      .in('id', identityIds),
    supabaseAdmin
      .from('community_bans')
      .select('guest_identity_id, status, expires_at')
      .eq('subject_type', 'guest')
      .in('guest_identity_id', identityIds)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  if (identityError) throw identityError;
  if (banError && !isMissingCommunityBanSchemaError(banError)) throw banError;

  const linkedToBlockedIdentity =
    (identities ?? []).some((identity) => identity.status === 'blocked') ||
    (bans ?? []).some((ban) => ban.status === 'blocked' || ban.status === 'banned');

  return {
    activeIpState: ipAccess.state,
    linkedToBlockedIdentity,
  };
}
