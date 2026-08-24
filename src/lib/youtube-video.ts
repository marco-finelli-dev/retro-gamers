const supportedYouTubeHosts = new Set([
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
]);

function normalizeYouTubeHost(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^m\./, '');
}

function isSupportedYouTubeHost(hostname: string) {
  const host = normalizeYouTubeHost(hostname);

  return supportedYouTubeHosts.has(host) ||
    host.endsWith('.youtube.com') ||
    host.endsWith('.youtube-nocookie.com');
}

function normalizeYouTubeVideoId(value: string) {
  const videoId = value.trim().split(/[/?#&]/)[0] || '';

  return /^[a-zA-Z0-9_-]{6,}$/.test(videoId) ? videoId : '';
}

export function getYouTubeVideoId(value: unknown) {
  if (typeof value !== 'string') return '';

  try {
    const parsedUrl = new URL(value.trim());
    const hostname = normalizeYouTubeHost(parsedUrl.hostname);
    const segments = parsedUrl.pathname.split('/').filter(Boolean);

    if (!isSupportedYouTubeHost(hostname)) return '';

    if (hostname === 'youtu.be') {
      return normalizeYouTubeVideoId(segments[0] || '');
    }

    const watchId = parsedUrl.searchParams.get('v');

    if (watchId) {
      return normalizeYouTubeVideoId(watchId);
    }

    if (['embed', 'shorts', 'live', 'v'].includes(segments[0] || '')) {
      return normalizeYouTubeVideoId(segments[1] || '');
    }
  } catch {
    return '';
  }

  return '';
}

export function normalizeYouTubeVideoUrl(value: unknown) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();

  if (!trimmed) return '';

  try {
    const parsedUrl = new URL(trimmed);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';

    return getYouTubeVideoId(parsedUrl.href) ? parsedUrl.href : '';
  } catch {
    return '';
  }
}

export function getYouTubeThumbnailUrl(value: unknown) {
  const videoId = getYouTubeVideoId(value);

  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}
