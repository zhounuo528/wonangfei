import { readdir, mkdir, rm, copyFile } from 'node:fs/promises';
const files = await readdir(new URL('../src/', import.meta.url));
const allowed = new Set(['.mjs', '.html', '.css', '.png', '.svg', '.webp']);
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/', import.meta.url));
for (const file of files) {
  if (!allowed.has(file.slice(file.lastIndexOf('.')))) throw Error(`Unexpected deploy file: ${file}`);
  await copyFile(new URL(`../src/${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
console.log(`Built ${files.length} public assets. No user data, tests, or desktop files included.`);
