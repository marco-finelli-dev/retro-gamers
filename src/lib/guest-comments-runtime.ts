import { getSecret } from 'astro:env/server';

export const getGuestIdentitySecret = () =>
  String(getSecret('GUEST_IDENTITY_SECRET') || '').trim();
