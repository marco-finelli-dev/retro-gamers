import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEditorHarness,editorFixture,textBlock} from './helpers/editor-harness.mjs';
const {normalize,render}=await loadEditorHarness();
test('Portable Text save/load retains italic, bold, both and a keyed divider',()=>{
  const saved=normalize(JSON.parse(JSON.stringify(editorFixture)));
  assert.deepEqual(saved,editorFixture);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(saved))),saved);
});
test('public production renderer outputs semantic emphasis and a single divider',async()=>{
  const html=await render(normalize(editorFixture));
  assert.match(html,/<em>Frase corsiva<\/em>/);
  assert.match(html,/<strong>Frase grassetto<\/strong>/);
  assert.match(html,/<em><strong>Frase combinata<\/strong><\/em>/);
  assert.equal((html.match(/<hr class="article-divider"/g)||[]).length,1);
  assert.ok(html.indexOf('article-divider')<html.indexOf('Secondo paragrafo'));
});
test('divider remains minimal and unknown data cannot pass through',()=>{
  assert.deepEqual(normalize([{_type:'divider',_key:'d',html:'<script>',style:'unexpected'}]),[{_type:'divider',_key:'d'}]);
  assert.throws(()=>normalize([{_type:'arbitrary',_key:'x'}]),/unsupported_content_block/);
});
test('partial spans and strong remain intact when only italic is removed',()=>{
  const b=textBlock('partial','prima ');b.children.push({_key:'middle',_type:'span',text:'parte',marks:['strong']},{_key:'end',_type:'span',text:' dopo',marks:['em']});
  assert.deepEqual(normalize([b]),[b]);
});
test('headings, lists and link annotations survive normalization and public render',async()=>{
  const b=textBlock('link','Link',['em','url']);b.markDefs=[{_type:'link',_key:'url',href:'https://example.com'}];
  const heading={...textBlock('heading','Heading'),style:'h2'};
  const list={...textBlock('list','Item',['strong']),listItem:'bullet',level:1};
  const saved=normalize([heading,list,b]);const html=await render(saved);
  assert.match(html,/<h2/);assert.match(html,/<ul/);assert.match(html,/https:\/\/example.com/);assert.match(html,/<em>/);
});
