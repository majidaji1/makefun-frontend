// Entry point: stage the static app and its screenshots into the output
// directory, then let the vendored kit write dossier.json from what is there.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = import.meta.dirname;
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(out, { recursive: true });

for (const dir of ['app', 'screenshots']) {
  const dest = join(out, dir);
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(here, dir), dest, { recursive: true });
}

const bytes = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
  app_path_max_bytes: 1000,
});

writeFileSync(join(out, 'dossier.json'), bytes);
console.log(`staged ${out}: dossier.json is ${bytes.length} bytes`);