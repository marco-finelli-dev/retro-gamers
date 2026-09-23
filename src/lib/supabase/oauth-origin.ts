/** Keep PKCE's host-only verifier cookie and its callback on the same origin.
 * Production (and unknown hosted environments) retain the configured site URL.
 * Preview detection comes from Vercel, never from a client-supplied header.
 */
export const getOAuthCallbackOrigin = (
  requestUrl: URL,
  siteUrl: string,
  deploymentEnvironment?: string,
) => {
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname);

  if (isLoopback || deploymentEnvironment === 'preview') {
    return requestUrl.origin;
  }

  return new URL(siteUrl).origin;
};
