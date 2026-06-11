import { randomBytes } from 'node:crypto';

const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

export function createUnsubscribeToken() {
  return randomBytes(32).toString('base64url');
}

export function isValidUnsubscribeToken(token: string) {
  return /^[A-Za-z0-9_-]{32,120}$/.test(token);
}

export function buildUnsubscribeUrl(token: string) {
  return `${siteUrl}/comments/unsubscribe/?token=${encodeURIComponent(token)}`;
}
