import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
import { existsSync, readFileSync } from 'node:fs';

export const prerender = false;

const sanityConfig = {
  projectId: import.meta.env.SANITY_PROJECT_ID,
  dataset: import.meta.env.SANITY_DATASET || 'production',
  apiVersion: import.meta.env.SANITY_API_VERSION || '2025-01-01',
  useCdn: false
};

let sanityWriteClient: ReturnType<typeof createClient> | undefined;

function readLocalEnvValue(name: string) {
  if (!import.meta.env.DEV) {
    return '';
  }

  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) {
      continue;
    }

    const match = readFileSync(file, 'utf8').match(
      new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm')
    );

    if (match?.[1]) {
      return match[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }

  return '';
}

function getSanityWriteToken() {
  const token =
    process.env['SANITY_WRITE_TOKEN'] ||
    readLocalEnvValue('SANITY_WRITE_TOKEN');

  if (!token || typeof token !== 'string') {
    throw new Error('Comment reaction write client is not configured.');
  }

  return token;
}

function getSanityWriteClient() {
  if (!sanityWriteClient) {
    sanityWriteClient = createClient({
      ...sanityConfig,
      token: getSanityWriteToken()
    });
  }

  return sanityWriteClient;
}

type Reaction = 'like' | 'dislike' | '';

function isReaction(value: unknown): value is Reaction {
  return value === 'like' || value === 'dislike' || value === '';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    const commentId = String(body.commentId || '').trim();
    const reaction = body.reaction || '';
    const previousReaction = body.previousReaction || '';

    if (!commentId || !isReaction(reaction) || !isReaction(previousReaction)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid payload' }),
        { status: 400 }
      );
    }

    const inc: Record<string, number> = {};

    if (previousReaction === 'like') {
      inc.likes = (inc.likes || 0) - 1;
    }

    if (previousReaction === 'dislike') {
      inc.dislikes = (inc.dislikes || 0) - 1;
    }

    if (reaction === 'like') {
      inc.likes = (inc.likes || 0) + 1;
    }

    if (reaction === 'dislike') {
      inc.dislikes = (inc.dislikes || 0) + 1;
    }

    if (Object.keys(inc).length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200
      });
    }

    await getSanityWriteClient()
      .patch(commentId)
      .setIfMissing({
        likes: 0,
        dislikes: 0
      })
      .inc(inc)
      .commit();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Comment reaction error:', error);

    return new Response(
      JSON.stringify({ ok: false, error: 'Server error' }),
      { status: 500 }
    );
  }
};
