export type CommentModerationDecision = {
  status: 'approved' | 'pending' | 'rejected';
  reason: string | null;
};

const countLinks = (body: string) =>
  (body.match(/\bhttps?:\/\/|\bwww\./gi) || []).length;

const hasPattern = (body: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(body));

const getUppercaseRatio = (body: string) => {
  const letters = body.match(/\p{L}/gu) || [];

  if (letters.length === 0) {
    return 0;
  }

  const uppercaseLetters = letters.filter((letter) => letter === letter.toUpperCase());

  return uppercaseLetters.length / letters.length;
};

const severePatterns = [
  /\bammazzati\b/i,
  /\bti\s+ammazzo\b/i,
  /\bkill\s+yourself\b/i,
  /\bkys\b/i,
];

const spamPatterns = [
  /\bviagra\b/i,
  /\bcasino\b/i,
  /\bfree\s+money\b/i,
  /\bmake\s+money\s+fast\b/i,
  /\bcrypto\s+investment\b/i,
  /\bseo\s+backlinks?\b/i,
  /\bporn\b/i,
  /\bxxx\b/i,
  /\btelegram\s+channel\b/i,
  /\bwhatsapp\s+promo\b/i,
];

const ambiguousPatterns = [
  /\bidiot[ai]?\b/i,
  /\bstupid[oa]?\b/i,
  /\bschifo\b/i,
  /\bvergogna\b/i,
  /\bscandaloso\b/i,
  /\bterribile\b/i,
  /\bassurdo\b/i,
];

export const isMissingCommentModerationColumnError = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    (
      message.includes('moderation_reason') ||
      message.includes('moderated_at') ||
      message.includes('moderated_by')
    ) &&
    (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      message.includes('schema cache') ||
      message.includes('column')
    )
  );
};

export function assessCommentModeration(
  body: string,
  options: {
    hasApprovedComments?: boolean;
    hasRecentDuplicate?: boolean;
  } = {}
): CommentModerationDecision {
  const normalized = body.replace(/\s+/g, ' ').trim();
  const linkCount = countLinks(normalized);
  const uppercaseRatio = getUppercaseRatio(normalized);

  if (normalized.length < 3) {
    return {
      status: 'rejected',
      reason: 'Contenuto vuoto o troppo breve.',
    };
  }

  if (options.hasRecentDuplicate) {
    return {
      status: 'rejected',
      reason: 'Duplicato identico recente dello stesso utente.',
    };
  }

  if (linkCount > 3) {
    return {
      status: 'rejected',
      reason: 'Troppi link nel commento.',
    };
  }

  if (hasPattern(normalized, severePatterns)) {
    return {
      status: 'rejected',
      reason: 'Linguaggio vietato grave.',
    };
  }

  if (hasPattern(normalized, spamPatterns)) {
    return {
      status: 'rejected',
      reason: 'Pattern spam evidente.',
    };
  }

  if (!options.hasApprovedComments) {
    return {
      status: 'pending',
      reason: 'Primo commento dell’utente: revisione manuale.',
    };
  }

  if (linkCount > 0) {
    return {
      status: 'pending',
      reason: 'Presenza di link: revisione manuale.',
    };
  }

  if (normalized.length > 1800) {
    return {
      status: 'pending',
      reason: 'Commento molto lungo.',
    };
  }

  if ((normalized.match(/\p{L}/gu) || []).length >= 30 && uppercaseRatio > 0.75) {
    return {
      status: 'pending',
      reason: 'Testo quasi tutto in maiuscolo.',
    };
  }

  if (hasPattern(normalized, ambiguousPatterns)) {
    return {
      status: 'pending',
      reason: 'Linguaggio acceso o ambiguo.',
    };
  }

  return {
    status: 'approved',
    reason: null,
  };
}
