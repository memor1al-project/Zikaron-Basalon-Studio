#!/usr/bin/env node
/**
 * Unpacks a Story Studio export into a folder, as a stream.
 *
 * The in-app import reads the whole archive into memory, which is fine for a folder of
 * photographs and wrong for a family archive of many gigabytes — exactly the ones most
 * worth restoring. This reads the zip entry by entry and writes each file as it arrives,
 * so the only limit is disk space.
 *
 * Afterwards, point the Studio at the folder: the catalog is already inside it, so the
 * story reopens with its tags, notes, faces and previews intact.
 *
 * Usage:
 *   node scripts/unpack-story.mjs story-2026-09-22.zikaron.zip --into ~/Documents/helfgot
 *   node scripts/unpack-story.mjs archive.zip --into ./folder --force   # replace existing files
 *   node scripts/unpack-story.mjs archive.zip --list                    # manifest only, write nothing
 */

import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// fflate lives with the app; the script has no package.json of its own.
const { Unzip, AsyncUnzipInflate } = createRequire(import.meta.url)(
  path.join(ROOT, "app/node_modules/fflate")
);

const MANIFEST_NAME = "manifest.json";
const MATERIALS_PREFIX = "materials/";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const archivePath = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--into");
const target = value("--into");
const FORCE = flag("--force");
const LIST_ONLY = flag("--list");

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** Keeps the archive's folder shape while refusing anything that escapes the target. */
function safeRelative(entryName) {
  const relative = entryName.slice(MATERIALS_PREFIX.length);
  const segments = relative.split("/").filter((s) => s && s !== "." && s !== "..");
  return segments.join("/");
}

function formatBytes(bytes) {
  const units = ["bytes", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function describeManifest(manifest) {
  console.log(`\nExport of "${manifest.story?.label ?? "a story"}"`);
  console.log(`  made           ${String(manifest.exportedAt).replace("T", " ").slice(0, 19)}`);
  console.log(`  by             Story Studio v${manifest.app?.version} (build ${manifest.app?.build})`);
  console.log(`  catalog        schema ${manifest.database?.schemaVersion ?? "?"}, revision ${manifest.database?.revision ?? "unknown"}`);
  console.log(`  materials      ${manifest.counts?.included} included, ${manifest.counts?.missing} missing, ${manifest.counts?.materials} total`);

  const missing = (manifest.bom ?? []).filter((b) => !b.included);
  if (missing.length > 0) {
    console.log(`\n  These were recorded but not in the archive:`);
    for (const entry of missing.slice(0, 20)) {
      console.log(`    - ${entry.name}${entry.reason ? ` (${entry.reason})` : ""}`);
    }
    if (missing.length > 20) console.log(`    …and ${missing.length - 20} more`);
  }
}

async function main() {
  if (!archivePath) fail("Which archive? Pass the .zip as the first argument.");
  if (!fs.existsSync(archivePath)) fail(`No such file: ${archivePath}`);
  if (!LIST_ONLY && !target) fail("Where to? Pass --into <folder>, or --list to only read the manifest.");

  if (target) fs.mkdirSync(target, { recursive: true });

  let manifest = null;
  const written = [];
  const skipped = [];
  const pending = new Set();

  await new Promise((resolve, reject) => {
    const unzip = new Unzip();
    unzip.register(AsyncUnzipInflate);

    unzip.onfile = (file) => {
      const isMaterial = file.name.startsWith(MATERIALS_PREFIX) && !file.name.endsWith("/");
      const isManifest = file.name === MANIFEST_NAME;
      const isCatalog = !file.name.includes("/") && file.name.endsWith(".sqlite");

      if (!isMaterial && !isManifest && !isCatalog) return;

      // The manifest is small and needed whole; everything else streams to disk.
      if (isManifest) {
        const parts = [];
        file.ondata = (err, chunk, final) => {
          if (err) return reject(err);
          parts.push(Buffer.from(chunk));
          if (final) manifest = JSON.parse(Buffer.concat(parts).toString("utf8"));
        };
        file.start();
        return;
      }

      const relative = isCatalog ? file.name : safeRelative(file.name);
      if (!relative) return;

      if (LIST_ONLY) return;

      const destination = path.join(target, relative);
      if (fs.existsSync(destination) && !FORCE) {
        skipped.push(relative);
        return;
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const out = fs.createWriteStream(destination);
      const token = {};
      pending.add(token);

      file.ondata = (err, chunk, final) => {
        if (err) {
          pending.delete(token);
          return reject(err);
        }
        out.write(Buffer.from(chunk));
        if (final) {
          out.end(() => {
            written.push(relative);
            pending.delete(token);
            process.stdout.write(`\r  restored ${written.length} files…`);
          });
        }
      };
      file.start();
    };

    const source = createReadStream(archivePath);
    source.on("data", (chunk) => unzip.push(new Uint8Array(chunk)));
    source.on("end", () => {
      unzip.push(new Uint8Array(0), true);
      // Entry writes finish asynchronously after the last chunk is pushed.
      const settle = () => (pending.size === 0 ? resolve() : setTimeout(settle, 20));
      settle();
    });
    source.on("error", reject);
  });

  if (!manifest) fail("No manifest.json inside — this doesn't look like a Story Studio export.");
  if (manifest.format !== "zikaron-story-export") fail("That archive was made by a different tool.");

  if (written.length > 0) process.stdout.write("\n");
  describeManifest(manifest);

  if (LIST_ONLY) {
    console.log("\n(--list: nothing was written.)\n");
    return;
  }

  console.log(`\nRestored into ${path.resolve(target)}`);
  console.log(`  written        ${written.length}`);
  if (skipped.length > 0) {
    console.log(`  left alone     ${skipped.length} already there (use --force to replace)`);
  }

  const catalog = written.find((f) => f.endsWith(".sqlite")) ?? skipped.find((f) => f.endsWith(".sqlite"));
  console.log(`  catalog        ${catalog ? `${catalog} (${formatBytes(manifest.database?.sizeBytes ?? 0)})` : "NOT FOUND — the story will open empty"}`);

  // The BOM is the check: an archive can be truncated, and a silent short restore is the
  // failure mode worth catching before someone deletes the original.
  const expected = (manifest.bom ?? []).filter((b) => b.included).length;
  const restoredMaterials = written.filter((f) => !f.endsWith(".sqlite")).length + skipped.filter((f) => !f.endsWith(".sqlite")).length;
  if (restoredMaterials < expected) {
    console.log(`\n  WARNING: the manifest lists ${expected} materials but ${restoredMaterials} are present.`);
    console.log(`  The archive may be incomplete. Keep the original until this is resolved.`);
    process.exitCode = 1;
  }

  console.log(`\nNow open the Studio and connect this folder.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
