// Entry point of the make.fun frontend entry.
//
// It is deliberately small: Node's standard library copies the static app and
// the screenshots into the output directory, then the entry kit's own
// buildDossier() writes dossier.json beside them. Two runs of this file write
// the same bytes, so the entry stays reproducible.

import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-frontend.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(process.env.MAKEFUN_OUTPUT_DIR || "/output");
const APP = join(HERE, "app");
const SCREENSHOTS = join(HERE, "screenshots");
const STATIC_PIECES = [
  { from: APP, to: join(OUTPUT, "app"), required: true },
  { from: SCREENSHOTS, to: join(OUTPUT, "screenshots"), required: false },
];

const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function measure(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = await measure(path);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await stat(path)).size;
    }
  }
  return { files, bytes };
}

async function place(piece) {
  if (!(await exists(piece.from))) {
    if (piece.required) throw new Error(`missing source directory: ${piece.from}`);
    return { skipped: true, files: 0, bytes: 0 };
  }
  await rm(piece.to, { recursive: true, force: true });
  await mkdir(dirname(piece.to), { recursive: true });
  await cp(piece.from, piece.to, { recursive: true, force: true, preserveTimestamps: true });
  return { skipped: false, ...(await measure(piece.to)) };
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  const placed = [];
  for (const piece of STATIC_PIECES) {
    const result = await place(piece);
    placed.push({ to: piece.to, ...result });
  }

  const entryPage = join(OUTPUT, "app", "index.html");
  if (!(await exists(entryPage))) {
    throw new Error(`the output has no app/index.html at ${entryPage}`);
  }

  // buildDossier() hands back the dossier as the exact bytes it wants written
  // (a Uint8Array of JSON); a plain string or object is written as such.
  const dossier = await buildDossier(OUTPUT, DOSSIER_OPTIONS);
  const dossierPath = join(OUTPUT, "dossier.json");
  if (typeof dossier === "string") {
    await writeFile(dossierPath, dossier, "utf8");
  } else if (dossier instanceof Uint8Array) {
    await writeFile(dossierPath, dossier);
  } else if (dossier !== undefined && dossier !== null) {
    await writeFile(dossierPath, JSON.stringify(dossier), "utf8");
  } else if (!(await exists(dossierPath))) {
    throw new Error("buildDossier() returned nothing and wrote no dossier.json");
  }

  const lines = [`output: ${OUTPUT}`];
  for (const item of placed) {
    const label = item.to.slice(OUTPUT.length + 1).split(sep).join("/");
    lines.push(
      item.skipped
        ? `  ${label}: not present, skipped`
        : `  ${label}: ${item.files} files, ${item.bytes} bytes`
    );
  }
  const dossierSize = (await stat(dossierPath)).size;
  const appSize = await measure(join(OUTPUT, "app"));
  lines.push(`  dossier.json: ${dossierSize} bytes`);
  lines.push(`app budget: ${appSize.files}/${DOSSIER_OPTIONS.app_max_files} files, ${appSize.bytes}/${DOSSIER_OPTIONS.app_max_bytes} bytes`);
  process.stdout.write(lines.join("\n") + "\n");
}

await main();
