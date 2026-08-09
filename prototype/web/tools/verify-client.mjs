#!/usr/bin/env node
// Headless verification of the built client: the parts a Node-only sim
// harness cannot reach — scene composition, every audio cue, the interface,
// keyboard control, and the fog behaviour at the end of a contract.
//
//   node tools/verify-client.mjs [path/to/field-console.html]
//
// Needs playwright-core and a Chromium. In this repo's dev container:
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
import {chromium} from "playwright-core";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT = process.argv[2] || path.join(HERE, "..", "field-console.html");
const EXE = process.env.PW_CHROMIUM ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fails = 0;
const check = (name, ok, detail) => {
  if (ok) console.log("  ok  " + name);
  else { fails++; console.log("FAIL  " + name + (detail ? ": " + detail : "")); }
};

const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox",
         "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
const errors = [];
page.on("pageerror", (e) => errors.push("page: " + String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) });

await page.goto("file://" + path.resolve(ARTIFACT), {waitUntil: "load"});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const bs = [...document.querySelectorAll("#briefing button")];
  (bs.find((b) => /deploy the bravo/i.test(b.textContent)) || bs[0]).click();
});
await page.waitForTimeout(2200);

// --- scene composition -----------------------------------------------------
const scene = await page.evaluate(() => {
  const D = window._dbg, R = D.R;
  let meshes = 0;
  R.scene.traverse((o) => { if (o.isMesh) meshes++ });
  const u = R.units[D.sim.squad[0].name];
  let unitParts = 0;
  u.grp.traverse((o) => { if (o.isMesh) unitParts++ });
  let propMeshes = 0;
  for (const k in R.tileObjs) propMeshes += R.tileObjs[k].length;
  return {meshes, propMeshes, doors: Object.keys(R.doors).length,
          unitParts, legs: u.legs?.length ?? 0, arms: u.arms?.length ?? 0};
});
check("scene builds with props, doors and limbed crew",
  scene.meshes > 300 && scene.propMeshes > 200 && scene.doors > 8 &&
  scene.unitParts > 15 && scene.legs === 2 && scene.arms === 2,
  JSON.stringify(scene));

// --- every audio cue, including with malformed input -----------------------
const audio = await page.evaluate(() => {
  const S = window._dbg.snd, p = window._dbg.sim.squad[0].pos, out = [];
  const t = (label, fn) => { try { fn(); out.push(label + ":ok") }
                             catch (e) { out.push(label + ":" + e.message) } };
  for (const cue of ["tap", "ev", "al", "prelude", "down", "chant", "banish",
                     "backfire", "collapse", "door", "strike"])
    t(cue, () => S.play(cue, p));
  t("step", () => S.step("Hall", 0));
  t("pad", () => S.pad([220, 330], 0.4, 0.02, 0));
  t("sweep", () => S.sweep(200, 2000, 0.4, 0.02, 0, 1.2));
  t("thump", () => S.thump(0.08));
  // a NaN reaching an AudioParam would kill the graph for the whole shift
  t("guard:NaN-pan", () => S.step("Hall", undefined));
  t("guard:null-spec", () => S.modal(null, 0.1, 0, 0.1));
  return out;
});
check(`all ${audio.length} audio cues fire, malformed input included`,
  audio.every((r) => r.endsWith(":ok")),
  audio.filter((r) => !r.endsWith(":ok")).join(", "));

// --- interface -------------------------------------------------------------
const ui = await page.evaluate(() => {
  const D = window._dbg;
  D.sel(D.sim.squad[2].name);
  return {
    objective: document.querySelector("#objline").textContent,
    selInfo: document.querySelector("#acts .selinfo")?.textContent ?? null,
    endTurn: document.querySelector("#btnEnd")?.textContent ?? null,
    apCosts: [...document.querySelectorAll("#acts .cost")].length,
  };
});
check("objective line, actor strip and AP costs are present",
  !!ui.objective && /move/.test(ui.selInfo || "") && /left/.test(ui.endTurn || "") &&
  ui.apCosts >= 4, JSON.stringify(ui));

// --- keyboard --------------------------------------------------------------
await page.keyboard.press("1");
await page.waitForTimeout(150);
const k1 = await page.evaluate(() => document.querySelector("#acts .selinfo")?.textContent);
await page.keyboard.press("Tab");
await page.waitForTimeout(150);
const k2 = await page.evaluate(() => document.querySelector("#acts .selinfo")?.textContent);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const round = await page.evaluate(() => window._dbg.sim.round);
check("keyboard selects, cycles and ends the turn",
  k1 !== k2 && round >= 2, `${k1} / ${k2} / round ${round}`);

// --- the map is handed back when the contract ends -------------------------
const fog = await page.evaluate(() => {
  const D = window._dbg;
  D.R.seen.fill(1);
  for (const s of D.sim.squad) { s.hp = 0; s.state = "down" }
  D.sim.over = true;
  D.sel(D.sim.squad[0].name);
  const d = D.R.fog.data;
  let max = -1;
  for (let i = 3; i < d.length; i += 4) if (d[i] > max) max = d[i];
  return {maxAlpha: max};
});
check("post-contract map never cuts to black", fog.maxAlpha < 200,
  `max fog alpha ${fog.maxAlpha}/255`);

check("zero page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(fails ? `FAILURES: ${fails}` : "ALL PASSED");
process.exit(fails ? 1 : 0);
