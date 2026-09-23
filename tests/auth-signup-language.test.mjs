import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the real registration handler with all side effects replaced before import.
// No environment files, live Auth calls, database writes or email delivery.
const directory = await mkdtemp(join(tmpdir(), 'rg-signup-language-'));
const output = join(directory, 'register.mjs');
await build({
  entryPoints: ['src/pages/api/auth/register.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ PUBLIC_SITE_URL: 'https://example.invalid/' }) },
  plugins: [{ name: 'offline-auth', setup(b) {
    b.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/lib\// }, () => ({ path: 'mocks', namespace: 'offline' }));
    b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: `
      export const logApiError = () => {};
      export const assignReaderBadgeToUser = async () => ({ok:true});
      export const createWelcomeAccountMessage = async () => {};
      export const sendNewReaderRegistrationAdminEmail = async () => {};
      export const supabasePublic = {auth:{signUp: async payload => {
        globalThis.__signupPayload = payload;
        return {data:{user:{id:'fixture',email:payload.email,identities:[{}]}},error:null};
      }}};
      export const supabaseAdmin = {
        auth:{admin:{listUsers:async()=>({data:{users:[]},error:null})}},
        from: table => {
          const query = {
            select:()=>query, eq:()=>query,
            maybeSingle:async()=>({data:table==='user_badges'?{key:'fixture'}:null,error:null}),
            insert:async value=>{globalThis.__profilePayload=value;return {error:null};}
          };
          return query;
        }
      };
    ` }));
  } }],
});
const { POST } = await import(pathToFileURL(output));
try {
  for (const language of ['it', 'en', undefined, 'fr', { role: 'admin' }]) {
    test(`signup metadata: ${JSON.stringify(language) ?? 'missing'}; existing profile/redirect preserved`, async () => {
      const response = await POST({ request: new Request('https://example.invalid/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email:'reader@example.invalid', password:'offline-only-pass-42', username:'qa-reader', displayName:'QA Reader', badgeKey:'fixture', language }),
      }) });
      assert.equal(response.status, 200);
      assert.deepEqual(globalThis.__signupPayload.options, {
        emailRedirectTo:'https://example.invalid/account/confirmed/',
        data:{language: language === 'en' ? 'en' : 'it'},
      });
      assert.deepEqual(globalThis.__profilePayload, {
        user_id:'fixture', username:'qa-reader', display_name:'QA Reader', badge_key:'fixture', role:'user', status:'active',
      });
      assert.equal(globalThis.__signupPayload.email, 'reader@example.invalid');
      assert.equal(globalThis.__signupPayload.password, 'offline-only-pass-42');
    });
  }
} finally {
  await rm(directory, { recursive:true, force:true });
}
