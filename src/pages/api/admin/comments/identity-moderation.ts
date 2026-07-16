import type { APIRoute } from 'astro';
import {
  getActiveCommunityBans,
  getCommunityAccess,
  isMissingCommunityBanSchemaError,
} from '../../../../lib/supabase/community-bans';
import {
  getModerationExpiry,
  type CommunityBanSubject,
  type CommunityBanStatus,
} from '../../../../lib/community-moderation';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../../lib/supabase/server';

type ModerationAction =
  | 'guest_restrict'
  | 'guest_block'
  | 'guest_unblock'
  | 'account_restrict'
  | 'account_ban'
  | 'account_unblock'
  | 'ip_block'
  | 'ip_revoke';

type Payload = {
  commentId?: string;
  action?: ModerationAction;
  duration?: '24h' | '7d' | '30d' | 'custom' | 'permanent';
  customExpiresAt?: string | null;
  reason?: string;
  exceptionalPermanentIp?: boolean;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const logModerationError = (context: string, error: unknown) => {
  const apiError = error as { code?: string } | null;

  console.error('Identity moderation error:', {
    context,
    code: apiError?.code || 'unknown',
  });
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const allowedActions = new Set<ModerationAction>([
  'guest_restrict',
  'guest_block',
  'guest_unblock',
  'account_restrict',
  'account_ban',
  'account_unblock',
  'ip_block',
  'ip_revoke',
]);

const isRevocationAction = (action: ModerationAction) =>
  action === 'guest_unblock' ||
  action === 'account_unblock' ||
  action === 'ip_revoke';

const getActionSubject = (action: ModerationAction): CommunityBanSubject => {
  if (action.startsWith('guest_')) return 'guest';
  if (action.startsWith('account_')) return 'account';
  return 'ip';
};

const getActionStatus = (action: ModerationAction): CommunityBanStatus => {
  if (action === 'guest_restrict' || action === 'account_restrict') return 'restricted';
  if (action === 'account_ban') return 'banned';
  return 'blocked';
};

async function revokeActiveBans({
  subjectType,
  subjectValue,
  moderatorId,
  reason,
}: {
  subjectType: CommunityBanSubject;
  subjectValue: string;
  moderatorId: string;
  reason: string;
}) {
  const activeBans = await getActiveCommunityBans(subjectType, subjectValue);
  const activeBanIds = activeBans.map((ban) => ban.id);

  if (activeBanIds.length === 0) return 0;

  return revokeBanIds({
    banIds: activeBanIds,
    moderatorId,
    reason,
  });
}

async function revokeBanIds({
  banIds,
  moderatorId,
  reason,
}: {
  banIds: string[];
  moderatorId: string;
  reason: string;
}) {
  if (banIds.length === 0) return 0;

  const { error } = await supabaseAdmin
    .from('community_bans')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: moderatorId,
      revocation_reason: reason,
    })
    .in('id', banIds)
    .is('revoked_at', null);

  if (error) throw error;
  return banIds.length;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  let payload: Payload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const commentId = String(payload.commentId || '').trim();
  const action = payload.action;
  const reason = String(payload.reason || '').replace(/\s+/g, ' ').trim();
  const duration = payload.duration || '24h';

  if (!UUID_PATTERN.test(commentId)) {
    return json({ ok: false, error: 'Commento non valido.' }, 400);
  }

  if (!action || !allowedActions.has(action)) {
    return json({ ok: false, error: 'Azione di moderazione non valida.' }, 400);
  }

  if (reason.length < 3 || reason.length > 1000) {
    return json({ ok: false, error: 'Inserisci una motivazione interna valida.' }, 400);
  }

  const { data: comment, error: commentError } = await supabaseAdmin
    .from('comments')
    .select('id, author_type, user_id, guest_identity_id')
    .eq('id', commentId)
    .maybeSingle();

  if (commentError) {
    logModerationError('identity-moderation.comment', commentError);
    return json({ ok: false, error: 'Commento non disponibile.' }, 500);
  }

  if (!comment) {
    return json({ ok: false, error: 'Commento non trovato.' }, 404);
  }

  const subjectType = getActionSubject(action);
  let subjectValue = '';

  if (subjectType === 'guest') {
    if (comment.author_type !== 'guest' || !comment.guest_identity_id) {
      return json({ ok: false, error: 'Il commento non appartiene a un’identità ospite.' }, 409);
    }
    subjectValue = comment.guest_identity_id;
  } else if (subjectType === 'account') {
    if (comment.author_type === 'guest' || !comment.user_id) {
      return json({ ok: false, error: 'Il commento non appartiene a un account registrato.' }, 409);
    }
    if (comment.user_id === session.user.id) {
      return json({ ok: false, error: 'Non puoi applicare un blocco al tuo account.' }, 403);
    }

    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', comment.user_id)
      .maybeSingle();

    if (profileError) {
      logModerationError('identity-moderation.profile', profileError);
      return json({ ok: false, error: 'Profilo non disponibile.' }, 500);
    }
    if (session.profile.role !== 'admin' && targetProfile?.role !== 'user') {
      return json({ ok: false, error: 'I moderator possono gestire solo utenti standard.' }, 403);
    }

    subjectValue = comment.user_id;
  } else {
    const { data: event, error: eventError } = await supabaseAdmin
      .from('guest_comment_events')
      .select('ip_hmac')
      .eq('comment_id', commentId)
      .not('ip_hmac', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (eventError) {
      logModerationError('identity-moderation.ip-event', eventError);
      return json({ ok: false, error: 'Segnale di rete pseudonimizzato non disponibile.' }, 500);
    }
    if (!event?.ip_hmac) {
      return json({ ok: false, error: 'Segnale di rete pseudonimizzato non disponibile.' }, 409);
    }

    subjectValue = event.ip_hmac;
  }

  let nextExpiresAt: string | null = null;

  if (!isRevocationAction(action)) {
    try {
      nextExpiresAt = getModerationExpiry({
        duration,
        customExpiresAt: payload.customExpiresAt,
      });
    } catch {
      return json({ ok: false, error: 'La data di scadenza personalizzata non è valida.' }, 400);
    }

    const isPermanentIp = subjectType === 'ip' && nextExpiresAt === null;

    if (
      isPermanentIp &&
      (session.profile.role !== 'admin' || payload.exceptionalPermanentIp !== true)
    ) {
      return json({
        ok: false,
        error: 'Un blocco IP permanente richiede un admin e una conferma eccezionale esplicita.',
      }, 403);
    }
  }

  try {
    if (isRevocationAction(action)) {
      const revokedCount = await revokeActiveBans({
        subjectType,
        subjectValue,
        moderatorId: session.user.id,
        reason,
      });

      if (subjectType === 'guest') {
        await supabaseAdmin
          .from('guest_identities')
          .update({ status: 'active' })
          .eq('id', subjectValue);
      }

      return json({
        ok: true,
        state: 'active',
        revokedCount,
      });
    }

    const expiresAt = nextExpiresAt;
    const isPermanentIp = subjectType === 'ip' && expiresAt === null;

    const status = getActionStatus(action);
    const previousActiveBans = await getActiveCommunityBans(subjectType, subjectValue);
    const insertPayload = {
      subject_type: subjectType,
      user_id: subjectType === 'account' ? subjectValue : null,
      guest_identity_id: subjectType === 'guest' ? subjectValue : null,
      ip_hmac: subjectType === 'ip' ? subjectValue : null,
      scope: 'comments_community',
      status,
      reason,
      expires_at: expiresAt,
      exceptional_permanent_ip: isPermanentIp,
      created_by: session.user.id,
    };

    const { error: insertError } = await supabaseAdmin
      .from('community_bans')
      .insert(insertPayload);

    if (insertError) throw insertError;

    await revokeBanIds({
      banIds: previousActiveBans.map((ban) => ban.id),
      moderatorId: session.user.id,
      reason: `Provvedimento sostituito: ${reason}`,
    });

    if (subjectType === 'guest') {
      await supabaseAdmin
        .from('guest_identities')
        .update({ status })
        .eq('id', subjectValue);
    }

    const access = await getCommunityAccess({
      subjectType,
      subjectValue,
    });

    return json({
      ok: true,
      state: access.state,
      expiresAt,
      activeBanCount: access.bans.length,
    });
  } catch (error) {
    if (isMissingCommunityBanSchemaError(error as { code?: string })) {
      return json({
        ok: false,
        error: 'La gestione dei blocchi non è ancora disponibile.',
      }, 409);
    }

    logModerationError('identity-moderation.action', error);
    return json({ ok: false, error: 'Azione non completata. Riprova più tardi.' }, 500);
  }
};
