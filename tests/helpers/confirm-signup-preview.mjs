import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Layout fixture expander, NOT a Go template engine or a Supabase email sender.
// Only the exact conditional used by Confirm signup is accepted.
const directory = resolve(process.argv[2] || '/tmp/rg-confirm-signup/preview');
await mkdir(directory, { recursive:true });
const source = await readFile('docs/supabase/confirm-signup-email-template.html', 'utf8');
const subject = await readFile('docs/supabase/confirm-signup-email-subject.txt', 'utf8');
const url = 'https://example.invalid/auth/v1/verify?token=PREVIEW_ONLY&type=signup&redirect_to=https%3A%2F%2Fexample.invalid%2Faccount%2Fconfirmed%2F';
const render = (text, language) => {
  const result = text.replace(/{{ if eq \.Data.language "en" }}([\s\S]*?){{ else }}([\s\S]*?){{ end }}/g,
    (_, english, italian) => language === 'en' ? english : italian)
    .replaceAll('{{ .ConfirmationURL }}', url.replaceAll('&', '&amp;'));
  assert.doesNotMatch(result, /{{|}}/, 'Unsupported/unexpanded template syntax');
  return result;
};
assert.equal((source.match(/{{ \.ConfirmationURL }}/g) || []).length, 3);
for (const language of ['it', 'en', undefined]) {
  const html = render(source, language);
  const english = language === 'en';
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/class="rg-email-button"/g) || []).length, 1);
  assert.ok(html.includes(english ? 'Hello,' : 'Ciao,'));
  assert.ok(!html.includes(english ? 'Ciao,' : 'Hello,'));
  assert.ok(html.includes(english ? 'Confirm email</a>' : 'Conferma email</a>'));
  assert.equal(render(subject, language).trim(), english ? 'Confirm your Retro-Gamers.it account' : 'Conferma il tuo account Retro-Gamers.it');
  assert.doesNotMatch(html, /display:\s*(flex|grid)|var\(--|<script|#(?:dff4f8|0f7780|f3f8fb)/i);
  await writeFile(resolve(directory, `confirm-${language || 'fallback'}.html`), html);
  await writeFile(resolve(directory, `confirm-${language || 'fallback'}-subject.txt`), render(subject, language));
}
console.log(`Offline IT/EN/fallback previews verified: ${directory}`);
