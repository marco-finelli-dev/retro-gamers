import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { supabasePublic, supabaseAdmin } from '../../../lib/supabase/server';
import { isBlockedProfileStatus } from '../../../lib/supabase/auth';

type CreateCommentPayload = {
  articleSlug?: string;
  articleLanguage?: 'it' | 'en';
  articleTitle?: string;
  articleUrl?: string;
  body?: string;
  parentId?: string | null;
  notifyReplies?: boolean;
  notifyThread?: boolean;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const notifyEmail = String(import.meta.env.COMMENTS_NOTIFY_EMAIL || '').trim();
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return `${url.pathname}${url.search}`;
  } catch {
    return trimmed;
  }
};

const absoluteArticleUrl = (articleUrl: string) => {
  if (articleUrl.startsWith('http://') || articleUrl.startsWith('https://')) {
    return articleUrl;
  }

  return `${siteUrl}${articleUrl.startsWith('/') ? articleUrl : `/${articleUrl}`}`;
};

async function sendNewCommentAdminEmail({
  articleTitle,
  articleUrl,
  authorName,
  body,
  language,
}: {
  articleTitle: string;
  articleUrl: string;
  authorName: string;
  body: string;
  language: 'it' | 'en';
}) {
  if (!resend || !notifyEmail) {
    return;
  }

  const preview = body.length > 700 ? `${body.slice(0, 700)}...` : body;

  await resend.emails.send({
    from: 'Retro-Gamers <noreply@retro-gamers.it>',
    to: notifyEmail,
    subject: `Nuovo commento in attesa su ${articleTitle || 'Retro-Gamers.it'}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2>Nuovo commento in attesa</h2>
        <p>
          È arrivato un nuovo commento su
          <strong>${escapeHtml(articleTitle || 'un articolo Retro-Gamers')}</strong>.
        </p>
        <p>
          <strong>Autore:</strong> ${escapeHtml(authorName)}<br>
          <strong>Lingua:</strong> ${escapeHtml(language.toUpperCase())}
        </p>
        <blockquote style="margin: 20px 0; padding: 14px 18px; border-left: 4px solid #22c8ff; background: #f4f7fb;">
          ${escapeHtml(preview).replace(/\n/g, '<br>')}
        </blockquote>
        <p>
          <a href="${escapeHtml(absoluteArticleUrl(articleUrl))}" style="color: #0070f3;">Apri l’articolo</a>
        </p>
        <p style="font-size: 13px; color: #666;">
          Apri il pannello commenti per approvare o rifiutare il messaggio.
        </p>
      </div>
    `,
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('rg_access_token')?.value;

  if (!token) {
    return json({ ok: false, error: 'Devi effettuare il login per commentare.' }, 401);
  }

  const { data: userData, error: userError } = await supabasePublic.auth.getUser(token);

  if (userError || !userData.user) {
    return json({ ok: false, error: 'Sessione non valida. Effettua di nuovo il login.' }, 401);
  }

  const user = userData.user;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, username, display_name, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    return json({ ok: false, error: profileError.message }, 500);
  }

  if (!profile) {
    return json({ ok: false, error: 'Profilo lettore non trovato.' }, 404);
  }

  if (isBlockedProfileStatus(profile.status)) {
    return json({ ok: false, error: 'Account bloccato.' }, 403);
  }

  let payload: CreateCommentPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const articleSlug = payload.articleSlug?.trim() ?? '';
  const articleLanguage = payload.articleLanguage === 'en' ? 'en' : 'it';
  const articleTitle = payload.articleTitle?.trim() ?? '';
  const articleUrl = normalizeUrl(payload.articleUrl?.trim() ?? '');
  const body = payload.body?.trim() ?? '';
  const parentId = payload.parentId?.trim() || null;
  const notifyReplies = payload.notifyReplies !== false;
  const notifyThread = payload.notifyThread === true;

  if (!articleSlug || articleSlug.length > 180) {
    return json({ ok: false, error: 'Articolo non valido.' }, 400);
  }

  if (!articleTitle || articleTitle.length > 220) {
    return json({ ok: false, error: 'Titolo articolo non valido.' }, 400);
  }

  if (!articleUrl || articleUrl.length > 300) {
    return json({ ok: false, error: 'URL articolo non valido.' }, 400);
  }

  if (body.length < 3) {
    return json({ ok: false, error: 'Il commento è troppo breve.' }, 400);
  }

  if (body.length > 3000) {
    return json({ ok: false, error: 'Il commento è troppo lungo. Massimo 3000 caratteri.' }, 400);
  }

  if (parentId) {
    const { data: parentComment, error: parentError } = await supabaseAdmin
      .from('comments')
      .select('id, parent_id, article_slug, article_language, status')
      .eq('id', parentId)
      .maybeSingle();

    if (parentError) {
      return json({ ok: false, error: parentError.message }, 500);
    }

    if (!parentComment || parentComment.status !== 'approved') {
      return json({ ok: false, error: 'Il commento a cui vuoi rispondere non è disponibile.' }, 400);
    }

    if (parentComment.parent_id) {
      return json({ ok: false, error: 'Le risposte sono consentite solo al primo livello.' }, 400);
    }

    if (
      parentComment.article_slug !== articleSlug ||
      parentComment.article_language !== articleLanguage
    ) {
      return json({ ok: false, error: 'Risposta non coerente con l’articolo.' }, 400);
    }
  }

  const { data: comment, error: insertError } = await supabaseAdmin
    .from('comments')
    .insert({
      article_slug: articleSlug,
      article_language: articleLanguage,
      article_title: articleTitle,
      article_url: articleUrl,
      user_id: user.id,
      profile_id: profile.id,
      parent_id: parentId,
      body,
      status: 'pending',
    })
    .select('id, status, created_at')
    .single();

  if (insertError) {
    return json({ ok: false, error: insertError.message }, 500);
  }

  const subscriptionsToCreate = [];

  if (notifyReplies) {
    subscriptionsToCreate.push({
      user_id: user.id,
      article_slug: articleSlug,
      article_language: articleLanguage,
      comment_id: comment.id,
      type: 'replies_to_comment',
      is_active: true,
    });
  }

  if (notifyThread) {
    subscriptionsToCreate.push({
      user_id: user.id,
      article_slug: articleSlug,
      article_language: articleLanguage,
      comment_id: null,
      type: 'article_thread',
      is_active: true,
    });
  }

  if (subscriptionsToCreate.length > 0) {
    const { error: subscriptionError } = await supabaseAdmin
      .from('comment_subscriptions')
      .upsert(subscriptionsToCreate, {
        onConflict: 'user_id,article_slug,article_language,comment_id,type',
      });

    if (subscriptionError) {
      return json({
        ok: true,
        warning: subscriptionError.message,
        message: 'Commento inviato, ma non è stato possibile salvare le preferenze di notifica.',
        comment,
      });
    }
  }

  try {
    await sendNewCommentAdminEmail({
      articleTitle,
      articleUrl,
      authorName: profile.display_name || profile.username || 'Lettore',
      body,
      language: articleLanguage,
    });
  } catch {
    return json({
      ok: true,
      warning: 'Commento inviato, ma la notifica email alla redazione non è partita.',
      message: 'Commento inviato. Sarà visibile dopo l’approvazione della redazione.',
      comment,
    });
  }

  return json({
    ok: true,
    message: 'Commento inviato. Sarà visibile dopo l’approvazione della redazione.',
    comment,
  });
};
