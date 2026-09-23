import assert from 'node:assert/strict';
import test from 'node:test';
import { emailFixtures } from './helpers/email-harness.mjs';
const before=await emailFixtures({baseline:true});
const after=await emailFixtures();
const hrefs=html=>[...html.matchAll(/href="([^"]*)"/g)].map(m=>m[1]).sort();
for(const [name,email] of Object.entries(after)) {
  test(`${name}: sender, recipient, subject, links and plain text preserved`,()=>{
    for(const key of ['from','to','subject','text'])assert.deepEqual(email[key],before[name][key]);
    assert.deepEqual(hrefs(email.html),hrefs(before[name].html));
  });
  test(`${name}: shared brand, responsive and dark fallbacks`,()=>{
    assert.match(email.html,/supported-color-schemes/);
    assert.match(email.html,/@media \(prefers-color-scheme:dark\)/);
    assert.match(email.html,/https:\/\/www.retro-gamers.it\/icon-192.png/);
    assert.match(email.html,/width="48" height="48"/);
    assert.match(email.html,/max-width:640px/);
    assert.doesNotMatch(email.html,/#(?:35d3df|19b9c4|0b7f89|0f9fab|647883|10202a)/i);
    assert.doesNotMatch(email.html,/<script|display:\s*(flex|grid)|var\(--/);
    assert.equal((email.html.match(/<h1\b/g)||[]).length,1);
  });
}
test('untrusted dynamic labels remain escaped and unsubscribe is retained',()=>{
  assert.match(after['new-user'].html,/Lettore &lt;di prova&gt; &amp; amici/);
  assert.match(after['newsletter-it'].html,/token=preview-unsubscribe-not-valid/);
  assert.match(after['newsletter-it'].text,/token=preview-unsubscribe-not-valid/);
  assert.match(after['comment-reply-en'].html,/token=preview-not-valid/);
});
