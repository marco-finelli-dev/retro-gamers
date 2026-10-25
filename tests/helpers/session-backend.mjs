// Isolated adapters only: never load project credentials or contact hosted services.
import { AsyncLocalStorage } from 'node:async_hooks';
export const requests = new AsyncLocalStorage();
export let clientsCreated = 0;
export function fixture(options = {}) {
  const state = { auth: 0, profiles: 0, editorial: 0, refresh: 0, cookieReads: 0, cookieWrites: 0, ...options };
  const values = new Map(Object.entries(options.cookies || {}));
  state.cookies = {
    get(name) { state.cookieReads++; return values.has(name) ? { value: values.get(name) } : undefined; },
    set(name, value) { state.cookieWrites++; values.set(name, value); },
    delete(name) { state.cookieWrites++; values.delete(name); },
  };
  return state;
}
export function createClient() {
  clientsCreated++;
  return {
    auth: {
      async getUser(token) {
        const s = requests.getStore(); s.auth++;
        await s.wait?.();
        if (s.authThrows) throw new Error('Auth unavailable');
        if (['malformed', 'expired', 'revoked'].includes(token) || s.revoked) return { data: {}, error: { message: 'invalid' } };
        const id = s.userId || token;
        return { data: { user: { id, email: `${id}@example.test` } }, error: null };
      },
      async refreshSession() {
        const s = requests.getStore(); s.refresh++;
        return s.refreshFails ? { data: {}, error: {} } : { data: { session: { access_token: 'renewed', refresh_token: 'rotated' } }, error: null };
      },
    },
    from(table) {
      let user;
      return {
        select() { return this; },
        eq(key, value) { if (key === 'user_id') user = value; return this; },
        async maybeSingle() {
          const s = requests.getStore();
          if (table === 'profiles') {
            s.profiles++;
            return { error: s.profileError || null, data: s.missingProfile ? null : { id: `profile-${user}`, user_id: user, username: user, role: s.role || 'reader', status: s.status || 'active' } };
          }
          if (table === 'editorial_profiles') {
            s.editorial++;
            return { error: s.editorialError || null, data: s.noEditorial ? null : { user_id: user, sanity_author_id: `author-${user}`, editorial_role: s.editorialRole || 'contributor', status: s.editorialStatus || 'active' } };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };
    },
  };
}

export async function getUnreadAccountMessageCount() { requests.getStore().accountUnreadReads = (requests.getStore().accountUnreadReads || 0) + 1; return { count: 2, error: null }; }
export async function getUnreadPrivateMessageCount() { requests.getStore().privateUnreadReads = (requests.getStore().privateUnreadReads || 0) + 1; return { count: 1, error: null }; }
export async function getUnreadAdminActivityCount() { requests.getStore().adminUnreadReads = (requests.getStore().adminUnreadReads || 0) + 1; return { count: 4, error: null }; }
