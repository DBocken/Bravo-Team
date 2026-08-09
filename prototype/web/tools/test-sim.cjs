// Extract the DOM-free sim core from the artifact HTML and exercise it.
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../field-console.html", "utf8");
const m = html.match(/\/\*SIM-BEGIN\*\/([\s\S]*)\/\*SIM-END\*\//);
if (!m) { console.error("no SIM block"); process.exit(1); }
const factory = new Function(m[1] + `
return {Sim, Site, Contract, Journal, GHOSTS, GKEYS, RNG, ANCHORS, key:(p)=>p[0]+","+p[1]};`);
const S = factory();
let fails = 0;
const check = (name, fn) => {
  try { fn(); console.log("  ok  " + name); }
  catch (e) { fails++; console.log("FAIL  " + name + ": " + (e.stack || e)); }
};

check("map parses; every room reachable from van", () => {
  const site = new S.Site();
  const van = site.roomTiles("Van")[0];
  for (const room of ["Kitchen","Pantry","Mudroom","Bedroom","Cellar","Hall","Bathroom","Living","Foyer","Study"]) {
    const t = site.roomTiles(room).find(p => !site.furn[S.key(p)]);
    // crew reachability: doors open en route; ghost:true would ban the
    // van/yard tiles the crew actually starts on
    if (!site.path(van, t, {doorsOk: true})) throw new Error(room + " unreachable");
  }
});

check("LOS and sound basics", () => {
  const site = new S.Site();
  if (site.los([2,2],[2,6])) throw new Error("wall should block");
  if (!site.los([8,6],[14,6])) throw new Error("hall LOS");
  const heard = site.loudness([8,6],5);
  if (heard["8,6"] !== 5) throw new Error("src loudness");
  if (heard["2,2"]) throw new Error("kitchen should be silent");
});

check("misID draws partner only; standard correct", () => {
  for (let s = 0; s < 30; s++) {
    const c = new S.Contract(s, "standard");
    if (c.claimed !== c.trueGhost) throw new Error("standard misID");
  }
  for (let s = 0; s < 30; s++) {
    const c = new S.Contract(s, "veteran", true);
    if (c.claimed !== S.GHOSTS[c.trueGhost].partner) throw new Error("bad draw");
  }
});

check("backfire logs signature and challenge verifies", () => {
  const sim = new S.Sim(5, "veteran", true, "demon");
  if (sim.journal.workingId !== "hantu") throw new Error("claim");
  const d0 = sim.dread;
  sim.backfire();
  if (sim.dread !== d0 + 15) throw new Error("dread");
  if (!sim.journal.confirmed().includes("backfire_demon")) throw new Error("atom");
  const { verified } = sim.journal.challenge("demon");
  if (!verified) throw new Error("verify");
});

check("scripted Warming Rite completes and banishes", () => {
  const sim = new S.Sim(2, "standard", null, "hantu");
  sim.startPlayerPhase();
  const v = sim.spec("Vance");
  // legit-ish setup: poke state that play would establish
  sim.anchorFound = true; sim.anchorRoom = sim.site.room(sim.contract.anchor);
  sim.anchorConfirmed = true;
  sim.placed = { brazier_coals: 2, lamp_oil: 1 };
  sim.site.furnaceOn = true;
  sim.site.temp[sim.anchorRoom] = 18;
  v.pos = sim.contract.anchor.slice();
  for (let i = 0; i < 8 && !sim.banished; i++) {
    v.pos = sim.contract.anchor.slice();
    const [ok, why] = sim.actChannel(v);
    if (!ok) throw new Error("channel refused: " + why);
    sim.advance();
    sim.site.temp[sim.anchorRoom] = 18; // hold warmth for the test
  }
  if (!sim.banished) throw new Error("no banishment");
});

check("random-play survives 60 rounds for all 12 ghosts (standard + misID veteran)", () => {
  for (const ghost of S.GKEYS) {
    for (const [diff, misid] of [["standard", null], ["veteran", true], ["blackout", null]]) {
      const sim = new S.Sim(3, diff, misid, ghost);
      sim.startPlayerPhase();
      const rr = S.RNG("test:" + ghost + diff);
      let guard = 0;
      while (!sim.over && sim.round < 60 && guard++ < 400) {
        for (const s of sim.squad) {
          if (!s.mobile()) continue;
          let inner = 0;
          while (s.ap > 0 && inner++ < 6) {
            const r = rr.random();
            if (r < 0.55) {
              const dx = rr.randint(-4, 4), dy = rr.randint(-4, 4);
              sim.actMove(s, [s.pos[0] + dx, s.pos[1] + dy], rr.random() < 0.15);
            } else if (r < 0.65) sim.actSteady(s);
            else if (r < 0.72) sim.actHide(s);
            else if (r < 0.8 && s.hidden) sim.actUnhide(s);
            else if (r < 0.9) {
              // poke adjacent things
              for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0],[1,1],[-1,-1]]) {
                const p = [s.pos[0] + dx, s.pos[1] + dy];
                const k = S.key(p);
                if (sim.site.kind[k] === "door") { sim.actDoor(s, p); break; }
                if ((sim.site.searchLeft[k] || []).length) { sim.actInteract(s, "search", p); break; }
              }
              if (s.ap > 0) sim.actSteady(s);
            } else if (s.items.length) sim.actPlace(s, s.items[0]);
            else sim.actSteady(s);
          }
        }
        sim.advance();
      }
      if (guard >= 400) throw new Error("stuck loop " + ghost + "/" + diff);
      if (sim.dread < 0 || sim.dread > 100) throw new Error("dread bounds");
    }
  }
});

check("challenge flow works from a random game", () => {
  const sim = new S.Sim(9, "blackout", null, "jinn");
  sim.startPlayerPhase();
  const [ok] = sim.actChallenge("jinn");
  if (!ok) throw new Error("file failed");
  if (sim.journal.workingId !== "jinn") throw new Error("wid");
});

console.log(fails ? "FAILURES: " + fails : "ALL PASSED");
process.exit(fails ? 1 : 0);
