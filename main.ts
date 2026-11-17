// Build step for this entry: put the app and its screenshots in the output directory, then write the dossier
// that the judge reads next to them.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// With no MAKEFUN_OUTPUT_DIR set it writes to /output, which is where the grader looks.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const root = import.meta.dirname ?? process.cwd();
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// The bounty's gate, kept here so this run refuses a directory the gate would refuse anyway.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
  app_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });

for (const part of ['app', 'screenshots']) {
  cpSync(join(root, part), join(out, part), { recursive: true });
}

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(`app + screenshots copied to ${out}`);
console.log(`dossier.json: ${dossier.byteLength} bytes`);