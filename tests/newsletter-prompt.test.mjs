import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';
const {code}=await transform(await readFile('src/scripts/newsletter-prompt.ts','utf8'),{loader:'ts',format:'cjs'});
const shownKey='retroGamersNewsletterPromptShown',dismissedKey='retroGamersNewsletterPromptDismissedAt';
function setup({shown=false,recent=false,expired=false,storageFails=false}={}){
 const callbacks={},buttons=[{},{}],cta={},session=new Map(),local=new Map();
 if(shown)session.set(shownKey,'1');
 if(recent||expired)local.set(dismissedKey,String(Date.now()-(expired?8:1)*86400000));
 class Element {dataset={};hidden=true;isConnected=true;attrs=new Map();addEventListener(k,f){this[k]=f;}getBoundingClientRect(){return {top:650,bottom:950,left:500,right:940};}contains(e){return buttons.includes(e)||e===cta;}hasAttribute(k){return this.attrs.has(k);}setAttribute(k,v){this.attrs.set(k,v);}removeAttribute(k){this.attrs.delete(k);}focus(){document.activeElement=this;}}
 const prompt=new Element(),main=new Element();for(const e of [...buttons,cta])e.addEventListener=(k,f)=>{e[k]=f;};
 prompt.querySelectorAll=()=>buttons;prompt.querySelector=()=>cta;
 const state={blocked:false,menu:false,footer:false,poll:false};
 const document={visibilityState:'visible',body:{append(){}},activeElement:null,documentElement:{matches:()=>state.menu},
 querySelector:s=>s==='[data-newsletter-prompt]'?prompt:s==='main'?main:s.includes('cookie-consent')?(state.blocked?{}:null):s.includes('footer')?{getBoundingClientRect:()=>({top:state.footer?800:5000,bottom:6000})}:s==='[data-home-survey]'?(state.poll?{getBoundingClientRect:()=>({top:700,bottom:900,left:600,right:900})}:null):null,
 querySelectorAll:()=>[],addEventListener:(k,f)=>callbacks[k]=f,removeEventListener(){}};
 document.activeElement=document.body;
 const storage=m=>({getItem:k=>{if(storageFails)throw Error('disabled');return m.get(k)||null;},setItem:(k,v)=>{if(storageFails)throw Error('disabled');m.set(k,v);}});
 let timer;
 const window={localStorage:storage(local),sessionStorage:storage(session),setTimeout:(f,ms)=>{timer={f,ms};return 1;},clearTimeout(){},addEventListener:(k,f)=>callbacks[k]=f,removeEventListener(){}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,document,window,innerHeight:1000,HTMLElement:Element,MutationObserver:class{observe(){}disconnect(){}},Date});
 module.exports.initNewsletterPrompt();
 return {prompt,state,session,local,buttons,cta,callbacks,document,main,timer};
}
test('delayed non-modal appearance only once per session',()=>{const h=setup();assert.equal(h.prompt.hidden,true);assert.equal(h.timer.ms,55000);h.timer.f();assert.equal(h.prompt.hidden,false);assert.equal(h.session.get(shownKey),'1');assert.equal(h.document.activeElement,h.document.body);assert.equal(setup({shown:true}).timer,undefined);});
test('seven-day cooldown expires, recent dismissal suppresses',()=>{assert.equal(setup({recent:true}).timer,undefined);assert.ok(setup({expired:true}).timer);});
test('close and Not now store identical dismissal',()=>{for(const i of [0,1]){const h=setup();h.timer.f();h.buttons[i].click();assert.equal(h.prompt.hidden,true);assert.ok(h.local.get(dismissedKey));h.callbacks.scroll();assert.equal(h.prompt.hidden,true);}});
test('Escape restores focus without trapping or stealing it on open',()=>{const h=setup();h.timer.f();h.document.activeElement=h.buttons[0];h.callbacks.keydown({key:'Escape'});assert.equal(h.prompt.hidden,true);assert.equal(h.document.activeElement,h.main);assert.equal(h.main.hasAttribute('tabindex'),false);});
test('footer, poll controls and other overlays suppress and resume the prompt',()=>{for(const key of ['blocked','footer','menu','poll']){const h=setup();h.state[key]=true;h.timer.f();assert.equal(h.prompt.hidden,true,key);assert.equal(h.session.has(shownKey),false);h.state[key]=false;h.callbacks.scroll();assert.equal(h.prompt.hidden,false,key);h.state[key]=true;h.callbacks.scroll();assert.equal(h.prompt.hidden,true,key);}});
test('CTA remembers invitation without inventing subscribed state',()=>{const h=setup();h.timer.f();h.cta.click();assert.equal(h.prompt.hidden,true);assert.deepEqual([...h.local.keys()],[dismissedKey]);});
test('storage failure leaves a usable dismissible prompt',()=>{const h=setup({storageFails:true});h.timer.f();assert.equal(h.prompt.hidden,false);h.buttons[0].click();assert.equal(h.prompt.hidden,true);});
test('Escape consumed by search or menu does not dismiss the invitation',()=>{const h=setup();h.timer.f();h.callbacks.keydown({key:'Escape',defaultPrevented:true});assert.equal(h.prompt.hidden,false);assert.equal(h.local.has(dismissedKey),false);});
