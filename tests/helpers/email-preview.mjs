import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { emailFixtures } from './email-harness.mjs';
const directory=resolve(process.argv[2] || '/tmp/rg-email-preview');
await mkdir(directory,{recursive:true});
const fixtures=await emailFixtures();
for(const [name,email] of Object.entries(fixtures)){
  await writeFile(resolve(directory,`${name}.html`),email.html);
  if(email.text)await writeFile(resolve(directory,`${name}.txt`),email.text);
}
console.log(`Offline previews only: ${Object.keys(fixtures).length} in ${directory}`);
