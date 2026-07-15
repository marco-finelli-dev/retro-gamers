import type { APIRoute } from 'astro';
import { validatePreviewUrl } from '@sanity/preview-url-secret';
import { urlSearchParamPreviewSecret } from '@sanity/preview-url-secret/constants';
import { getPreviewClient } from '../../../lib/sanity';
import {
  getSafeRedirectPath,
  hasPreviewCookieSecret,
  setDraftModeCookie
} from '../../../lib/sanity-preview';

export const GET: APIRoute = async ({ cookies, request, url }) => {
  if (!process.env.SANITY_API_READ_TOKEN || !hasPreviewCookieSecret()) {
    return new Response('Preview mode is not configured.', {
      status: 500,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }

  if (!url.searchParams.get(urlSearchParamPreviewSecret)) {
    return new Response('Invalid preview URL.', {
      status: 401,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }

  let validation;

  try {
    validation = await validatePreviewUrl(getPreviewClient(), request.url);
  } catch {
    return new Response('Invalid preview URL.', {
      status: 401,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }

  if (!validation.isValid) {
    return new Response('Invalid preview URL.', {
      status: 401,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }

  const redirectPath = getSafeRedirectPath(validation.redirectTo);
  const previewPerspective = validation.studioPreviewPerspective || 'drafts';

  if (previewPerspective !== 'drafts') {
    return new Response('Invalid preview URL.', {
      status: 401,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }

  setDraftModeCookie(cookies);

  return new Response(null, {
    status: 307,
    headers: {
      'Cache-Control': 'no-store',
      Location: redirectPath
    }
  });
};

export const ALL: APIRoute = () =>
  new Response('Method not allowed.', {
    status: 405,
    headers: {
      Allow: 'GET',
      'Cache-Control': 'no-store'
    }
  });
