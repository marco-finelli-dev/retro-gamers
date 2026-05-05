import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';

export const prerender = false;

const sanityClient = createClient({
  projectId: import.meta.env.SANITY_PROJECT_ID,
  dataset: import.meta.env.SANITY_DATASET || 'production',
  apiVersion: import.meta.env.SANITY_API_VERSION || '2025-01-01',
  token: import.meta.env.SANITY_WRITE_TOKEN,
  useCdn: false
});

type Reaction = 'like' | 'dislike' | '';

function isReaction(value: unknown): value is Reaction {
  return value === 'like' || value === 'dislike' || value === '';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!import.meta.env.SANITY_WRITE_TOKEN) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing token' }),
        { status: 500 }
      );
    }

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

    await sanityClient
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