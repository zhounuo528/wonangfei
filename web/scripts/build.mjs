import { readdir, mkdir, rm, copyFile,readFile,writeFile } from 'node:fs/promises';
import { createHash }from'node:crypto';
import { execFileSync }from'node:child_process';
import {fileURLToPath}from'node:url';
import {releaseNotes}from'../src/release-notes.mjs';
const files = await readdir(new URL('../src/', import.meta.url));
const allowed = new Set(['.mjs', '.html', '.css', '.png', '.svg', '.webp']);
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/', import.meta.url));
for (const file of files) {
  if (!allowed.has(file.slice(file.lastIndexOf('.')))) throw Error(`Unexpected deploy file: ${file}`);
  await copyFile(new URL(`../src/${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const digest=createHash('sha256').update(pkg.version);
for(const file of [...files].sort())digest.update(file).update(await readFile(new URL('../src/'+file,import.meta.url)));
digest.update(await readFile(new URL('../vercel.json',import.meta.url))).update(await readFile(new URL('../package.json',import.meta.url))).update(await readFile(new URL('./build.mjs',import.meta.url)));
let sourceCommit=null,development=true;
try{const cwd=fileURLToPath(new URL('../../',import.meta.url));development=execFileSync('git',['status','--porcelain','--','web/src','web/scripts/build.mjs','web/package.json','web/vercel.json'],{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()!=='';if(!development)sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
const info={stream:'web',version:pkg.version,channel:'preview',revision:digest.digest('hex'),sourceCommit,development,changes:releaseNotes('web')};
await writeFile(new URL('../dist/build-info.mjs',import.meta.url),`// Generated from package.json by npm run build.\nexport const BUILD_INFO=Object.freeze(${JSON.stringify(info)});\n`);
await writeFile(new URL('../dist/version.json',import.meta.url),JSON.stringify(info,null,2)+'\n');
console.log(`Built ${files.length+2} public assets; web v${info.version}, ${development?'development source':sourceCommit}. No user data, tests, or desktop files included.`);
