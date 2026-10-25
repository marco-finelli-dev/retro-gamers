/** Intrinsic size of the width-only Sanity renditions used by platform details.
 * No fetch: reserve the same ratio before the browser decodes the asset.
 * Unknown URLs deliberately omit dimensions rather than guess a shape.
 */
export function getSanityImageSize(value: unknown): { width?: number; height?: number } {
  if (typeof value !== 'string') return {};
  try {
    const url = new URL(value);
    if (url.hostname !== 'cdn.sanity.io') return {};
    const match = url.pathname.match(/-(\d+)x(\d+)\.[a-z0-9]+$/i);
    if (!match) return {};
    let width = Number(match[1]), height = Number(match[2]);
    const rect = url.searchParams.get('rect');
    if (rect) {
      const parts = rect.split(',').map(Number);
      if (parts.length !== 4 || parts.some(n => !Number.isFinite(n)) || parts[0] < 0 || parts[1] < 0) return {};
      [width, height] = parts.slice(2);
    }
    if (!(width > 0 && height > 0) || url.searchParams.has('h')) return {};
    const requested = Number(url.searchParams.get('w'));
    if (requested > 0 && Number.isFinite(requested)) {
      const outputWidth = url.searchParams.get('fit') === 'max' ? Math.min(width, requested) : requested;
      height = Math.round(height * outputWidth / width);
      width = outputWidth;
    }
    return height > 0 ? { width, height } : {};
  } catch { return {}; }
}
