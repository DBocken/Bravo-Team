#!/usr/bin/env node
// Assemble the single-file field console from its sources.
//
// The shipped artifact is one self-contained HTML file with no external
// requests — it has to run from file:// and inside a CSP that blocks every
// CDN. That is a delivery constraint, not an architecture: the sources live
// apart so the diff of a gameplay change is a gameplay change, and not a
// 600 KB vendored blob scrolling past.
//
//   src/part-head.html   markup, CSS, and the /*SIM-BEGIN*/…/*SIM-END*/ rules
//                        engine — opens a <script> it does not close
//   src/part-ui3d.js     renderer, UI and audio — closes it
//   vendor/three.*.js    substituted into the /*THREE_LIB*/ placeholder
//
// Usage:  node build.mjs [--check]
//         --check verifies the committed artifact matches the sources
//         instead of writing it (used by CI and before every commit).
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "src");
const VENDOR = path.join(HERE, "vendor");
const OUT = path.join(HERE, "field-console.html");

const head = fs.readFileSync(path.join(SRC, "part-head.html"), "utf8");
const ui = fs.readFileSync(path.join(SRC, "part-ui3d.js"), "utf8");

if (!head.includes("/*THREE_LIB*/"))
  throw new Error("part-head.html has no /*THREE_LIB*/ placeholder");
if (!head.includes("/*SIM-BEGIN*/") || !head.includes("/*SIM-END*/"))
  throw new Error("part-head.html has lost its SIM fence");

const vendored = fs.readdirSync(VENDOR).filter((f) => f.endsWith(".js"));
if (vendored.length !== 1)
  throw new Error(`expected exactly one vendored library, found ${vendored.length}`);
const lib = fs.readFileSync(path.join(VENDOR, vendored[0]), "utf8");
if (!/@license/.test(lib.slice(0, 400)))
  throw new Error("vendored library lost its license header");

const html = (head + "\n" + ui + "\n</script>\n").replace("/*THREE_LIB*/", () => lib);

// the file must stay offline-safe: nothing may reach out to a network host
const appOnly = html.replace(lib, "");
const external = appOnly.match(/\b(?:src|href)\s*=\s*["']https?:/gi);
if (external) throw new Error(`external reference in app source: ${external[0]}`);

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== html) {
    console.error("field-console.html is stale — run: node build.mjs");
    process.exit(1);
  }
  console.log(`field-console.html matches its sources (${html.length} bytes)`);
} else {
  fs.writeFileSync(OUT, html);
  console.log(`built field-console.html (${html.length} bytes, ${vendored[0]})`);
}
