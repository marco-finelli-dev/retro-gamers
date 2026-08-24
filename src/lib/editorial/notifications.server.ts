import {
  createAccountMessage,
  type AccountMessageType,
} from '../supabase/account-messages';
import { normalizeUuid } from '../uuid';
import { buildEditorialNotificationAction } from './notification-links.server';
import { normalizeSanityRootDocumentId } from './types';

type EditorialNotificationLanguage = 'it' | 'en';

type EditorialCommentNotificationBase = {
  actorUserId?: string | null;
  sanityDocumentId?: string | null;
  editorialCommentId?: string | null;
  parentCommentId?: string | null;
  articleTitle?: string | null;
  articleLanguage?: string | null;
};

type EditorialCommentCreatedNotification = EditorialCommentNotificationBase & {
  ownerUserId?: string | null;
};

type EditorialCommentReplyNotification = EditorialCommentNotificationBase & {
  parentCommentAuthorUserId?: string | null;
};

type EditorialCommentResolvedNotification = EditorialCommentNotificationBase & {
  commentAuthorUserId?: string | null;
};

type EditorialCommentNotificationConfig = {
  type: AccountMessageType;
  recipientUserId?: string | null;
  actorUserId?: string | null;
  sanityDocumentId?: string | null;
  editorialCommentId?: string | null;
  parentCommentId?: string | null;
  articleTitle?: string | null;
  articleLanguage?: string | null;
  getCopy: (language: EditorialNotificationLanguage, articleTitle: string) => {
    title: string;
    body: string;
    actionLabel: string;
  };
};

function normalizeLanguage(value: unknown): EditorialNotificationLanguage {
  return value === 'en' ? 'en' : 'it';
}

function normalizeOptionalText(value: unknown) {
  return String(value || '').trim();
}

function getArticleFallbackTitle(language: EditorialNotificationLanguage) {
  return language === 'en' ? 'this article' : 'questo articolo';
}

async function createEditorialCommentNotification({
  type,
  recipientUserId,
  actorUserId,
  sanityDocumentId,
  editorialCommentId,
  parentCommentId = null,
  articleTitle,
  articleLanguage,
  getCopy,
}: EditorialCommentNotificationConfig) {
  const recipient = normalizeUuid(recipientUserId);
  const actor = normalizeUuid(actorUserId);

  if (!recipient) {
    return { ok: false, skipped: true, error: 'Missing recipient.' };
  }

  if (actor && recipient === actor) {
    return { ok: false, skipped: true, error: 'Actor is recipient.' };
  }

  const rootDocumentId = normalizeSanityRootDocumentId(sanityDocumentId);
  const commentId = normalizeUuid(editorialCommentId);

  if (!rootDocumentId || !commentId) {
    return { ok: false, skipped: true, error: 'Missing editorial notification reference.' };
  }

  const normalizedParentCommentId = parentCommentId ? normalizeUuid(parentCommentId) : '';
  const language = normalizeLanguage(articleLanguage);
  const normalizedArticleTitle = normalizeOptionalText(articleTitle) || getArticleFallbackTitle(language);
  const copy = getCopy(language, normalizedArticleTitle);
  const action = await buildEditorialNotificationAction({
    sanityDocumentId: rootDocumentId,
    commentId,
    recipientUserId: recipient,
    articleLanguage: language,
    actionType: type,
  });

  return createAccountMessage({
    userId: recipient,
    type,
    title: copy.title,
    body: copy.body,
    actionLabel: action.actionLabel || copy.actionLabel,
    actionUrl: action.actionUrl,
    dedupe: false,
    metadata: {
      domain: 'editorial',
      sanityDocumentId: rootDocumentId,
      editorialCommentId: commentId,
      parentCommentId: normalizedParentCommentId || null,
      articleTitle: normalizedArticleTitle,
      articleLanguage: language,
    },
  });
}

export async function notifyEditorialCommentCreated(input: EditorialCommentCreatedNotification) {
  return createEditorialCommentNotification({
    ...input,
    type: 'editorial_comment_created',
    recipientUserId: input.ownerUserId,
    getCopy: (language, articleTitle) => language === 'en'
      ? {
          title: 'New editorial comment',
          body: `An editorial comment was added to “${articleTitle}”.`,
          actionLabel: 'Open editor',
        }
      : {
          title: 'Nuovo commento redazionale',
          body: `È stato aggiunto un commento redazionale su “${articleTitle}”.`,
          actionLabel: 'Apri editor',
        },
  });
}

export async function notifyEditorialCommentReply(input: EditorialCommentReplyNotification) {
  return createEditorialCommentNotification({
    ...input,
    type: 'editorial_comment_reply',
    recipientUserId: input.parentCommentAuthorUserId,
    getCopy: (language, articleTitle) => language === 'en'
      ? {
          title: 'New editorial reply',
          body: `Someone replied to an editorial comment on “${articleTitle}”.`,
          actionLabel: 'Open editor',
        }
      : {
          title: 'Nuova risposta redazionale',
          body: `Qualcuno ha risposto a un commento redazionale su “${articleTitle}”.`,
          actionLabel: 'Apri editor',
        },
  });
}

export async function notifyEditorialCommentResolved(input: EditorialCommentResolvedNotification) {
  return createEditorialCommentNotification({
    ...input,
    type: 'editorial_comment_resolved',
    recipientUserId: input.commentAuthorUserId,
    getCopy: (language, articleTitle) => language === 'en'
      ? {
          title: 'Editorial comment resolved',
          body: `An editorial comment on “${articleTitle}” was marked as resolved.`,
          actionLabel: 'Open editor',
        }
      : {
          title: 'Commento redazionale risolto',
          body: `Un commento redazionale su “${articleTitle}” è stato segnato come risolto.`,
          actionLabel: 'Apri editor',
        },
  });
}
