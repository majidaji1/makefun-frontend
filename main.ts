// Entry point of this entry: it hands the app in.
//
// `node main.ts` copies app/ and screenshots/ from this repository into the output directory
// (MAKEFUN_OUTPUT_DIR when it is set, /output otherwise) and writes the dossier the gate rebuilds with
// the kit's own library, so both runs of the program write the same bytes.
//
// Node 22, the standard library alone, no install step: TypeScript here is erased, not compiled.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-frontend.ts';

/** The repository this file sits in: app/, screenshots/ and vendor/ are read from it. */
const repoRoot = dirname(fileURLToPath(import.meta.url));

/** Where the entry is handed in: the grader's MAKEFUN_OUTPUT_DIR, else /output. */
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** The caps this bounty's gate gives buildDossier, word for word as the brief states them. */
const DOSSIER_OPTS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
} as const;

/** Copies one directory of the repository into the output directory, byte for byte, and reports what it held. */
function handIn(name: string): { path: string; files: number; bytes: number } | null {
  const from = join(repoRoot, name);
  const to = join(outDir, name);
  if (!existsSync(from)) return null;
  if (!statSync(from).isDirectory()) throw new Error(`main.ts: ${name} is not a directory`);

  // A stale copy of an earlier run must never survive into this one: two runs write the same bytes.
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, force: true });

  let files = 0;
  let bytes = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        files += 1;
        bytes += statSync(path).size;
      }
    }
  };
  walk(to);
  return { path: to, files, bytes };
}

/** Whether a handed-in screenshots/ holds at least one image file: the library refuses a directory that holds none. */
function holdsImage(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isFile() && !entry.name.startsWith('.'));
}

function main(): void {
  mkdirSync(outDir, { recursive: true });

  const app = handIn('app');
  if (app === null) throw new Error('main.ts: app/: no such directory: the entry is a static app/ with index.html at its root');
  if (!existsSync(join(outDir, 'app', 'index.html'))) throw new Error('main.ts: app/index.html: no such file');

  const shots = handIn('screenshots');
  const shotsDir = join(outDir, 'screenshots');
  const shotsReady = shots !== null && holdsImage(shotsDir);

  const lines: string[] = [`app/     ${app.files} files, ${app.bytes} bytes -> ${app.path}`];
  if (shots !== null) lines.push(`shots    ${shots.files} files, ${shots.bytes} bytes -> ${shots.path}`);

  if (shotsReady) {
    const dossier = buildDossier(outDir, DOSSIER_OPTS);
    writeFileSync(join(outDir, 'dossier.json'), dossier);
    lines.push(`dossier  ${dossier.length} bytes -> ${join(outDir, 'dossier.json')}`);
  } else {
    // Screenshots are taken when the app is done; a run before that hands in main.ts and app/ alone.
    lines.push('dossier  skipped: screenshots/ holds no image yet, and buildDossier refuses a directory that holds none');
  }

  lines.push(`output   ${outDir}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
