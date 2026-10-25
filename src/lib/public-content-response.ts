/** Only for the audited, identity-independent search index and sitemap.
 * Do not use for SSR HTML, preview, votes or other personalized responses.
 * Browsers revalidate; shared caches get a short TTL, without stale extensions.
 */
export function publicContentResponse(
  request: Request,
  body: string,
  contentType: string,
  sharedMaxAge: 60 | 300,
) {
  // Sitemap can traverse page middleware when Accept includes text/html.
  // Keep any origin response that could refresh auth cookies uncacheable.
  const credentialed = request.headers.has('cookie') || request.headers.has('authorization');
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': credentialed
        ? 'private, no-store, max-age=0'
        : `public, max-age=0, s-maxage=${sharedMaxAge}, must-revalidate`,
    },
  });
}

export function publicContentUnavailable() {
  // A non-JSON failure also preserves the existing search clients' catch path:
  // never let them retain an error object as an empty successful index.
  return new Response('Public content temporarily unavailable.', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'Retry-After': '60',
    },
  });
}
