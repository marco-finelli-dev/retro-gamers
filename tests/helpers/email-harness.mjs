import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// All sender and storage dependencies are replaced BEFORE evaluating any module.
// No .env loading, real credentials, network, delivery or database writes.
export async function emailFixtures({ baseline = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'rg-email-fixtures-'));
  const sources = ['account-emails', 'newsletter-emails', 'newsletter-campaign-emails', 'comment-emails', 'community-survey-emails'];
  await build({stdin:{contents:sources.map((name,i)=>`export * as e${i} from './src/lib/supabase/${name}.ts';`).join('\n'),resolveDir:process.cwd()}, outfile:join(directory,'emails.mjs'), bundle:true, platform:'node', format:'esm',
    define:{'import.meta.env':JSON.stringify({RESEND_API_KEY:'fixture-only',COMMENTS_NOTIFY_EMAIL:'admin@example.invalid',COMMENTS_FROM_EMAIL:'Retro-Gamers <noreply@example.invalid>',PUBLIC_SITE_URL:'https://www.retro-gamers.it'})},
    plugins:[{name:'offline-email-fixtures',setup(b){
      b.onResolve({filter:/^(resend|\.\/server|\.\/newsletter)$/},()=>({path:'offline',namespace:'email-fixture'}));
      b.onLoad({filter:/.*/,namespace:'email-fixture'},()=>({contents:`
        export class Resend { emails={send:async payload=>{globalThis.__emailFixtures.push(payload);return {data:{id:'fixture'}};}}; }
        export const supabaseAdmin={from:()=>({select:()=>({eq:()=>({eq:async()=>({data:[]})})}),insert:async()=>({})})};
        export async function logNewsletterDelivery() {}
      `}));
      if(baseline)b.onLoad({filter:/src\/lib\/(email-template|supabase\/.*-emails)\.ts$/},args=>({contents:execFileSync('git',['show',`HEAD:${args.path.slice(process.cwd().length+1)}`],{encoding:'utf8'}),loader:'ts'}));
    }}],logLevel:'silent'});
  globalThis.__emailFixtures=[];
  const {e0:account,e1:confirmation,e2:newsletter,e3:comments,e4:survey}=await import(pathToFileURL(join(directory,'emails.mjs')));
  const fixtures={};
  async function capture(name,run){await run();fixtures[name]=globalThis.__emailFixtures.pop();if(!fixtures[name])throw Error(`Missing fixture: ${name}`);}
  await capture('new-user',()=>account.sendNewReaderRegistrationAdminEmail({userId:'fixture',email:'reader.with.a.long.address@example.invalid',username:'retro_reader',displayName:'Lettore <di prova> & amici',createdAt:'2026-09-23T12:00:00Z'}));
  await capture('survey-admin',()=>survey.sendCommunitySurveyResponseAdminEmail({surveyKey:'fixture-survey',surveyTitle:'Sondaggio di prova',surveyLanguage:'en',submittedAt:'2026-09-23T12:00:00Z'}));
  await capture('comment-admin',()=>comments.sendNewCommentAdminEmail({articleTitle:'Articolo di prova',articleUrl:'/speciali/prova/',authorName:'Lettore <di prova>',body:'Un ricordo di prova.\nSecondo paragrafo.',language:'it'}));
  for(const lang of ['it','en']){
    const subscriber={id:'fixture',email:'reader@example.invalid',language:lang,confirmation_token:'preview-confirm-not-valid',unsubscribe_token:'preview-unsubscribe-not-valid'};
    await capture(`confirmation-${lang}`,()=>confirmation.sendNewsletterConfirmationEmail(subscriber));
    const campaign={language:lang,subject:lang==='it'?'Storie dal mondo del retrogaming':'Stories from the world of retro gaming',preheader:'Retro-Gamers — local preview',intro:lang==='it'?'Articoli, recensioni e speciali selezionati per te.':'Articles, reviews and features selected for you.',content_text:'Una selezione di prova, senza invii reali.\n\nBuona lettura!',cta_label:lang==='it'?'Leggi su Retro-Gamers':'Read Retro-Gamers',cta_url:'https://www.retro-gamers.it/',items:[{type:'feature',title:'Amiga: storie e ricordi',description:'Una storia di giochi, persone e computer che hanno segnato un’epoca.',url:'https://www.retro-gamers.it/speciali/prova/',image_url:'https://cdn.sanity.io/images/y88ky0mu/production/6be0866dea5a18979ffca55ebf225039f4acbf11-1200x900.webp'},{type:'text',title:'Il prossimo appuntamento',description:'Altre storie e approfondimenti nella prossima uscita.'}]};
    await capture(`newsletter-${lang}`,()=>newsletter.sendNewsletterCampaignEmail({campaign,subscriber,to:subscriber.email}));
    await capture(`newsletter-test-${lang}`,()=>newsletter.sendNewsletterCampaignEmail({campaign,subscriber:null,to:'admin@example.invalid',isTest:true}));
    const comment={to:subscriber.email,userId:'fixture',commentId:'fixture',articleTitle:'Articolo <di prova> & ricordi',articleUrl:'/speciali/prova/#comment-fixture',language:lang,unsubscribeUrl:'https://www.retro-gamers.it/unsubscribe/?token=preview-not-valid'};
    await capture(`comment-approved-${lang}`,()=>comments.sendCommentApprovedEmail(comment));
    await capture(`comment-reply-${lang}`,()=>comments.sendReplyApprovedEmail(comment));
  }
  return fixtures;
}
