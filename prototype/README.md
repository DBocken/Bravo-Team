# Bravo Team — Core-Loop Prototype (`bravo_sim`)

A **deterministic, headless design-validation prototype** of the on-site
tactical loop, in pure Python (stdlib only, 3.10+). It exists to answer one
question before any Unity code is written: *do the rules in docs 01–03
actually produce the intended game?* — the deduction, the Dread ratchet, the
misidentification drama, the Backfire-as-clue.

This is the paper prototype of the sim core described in
[`09-tech-architecture.md`](../docs/design/09-tech-architecture.md); the
production implementation remains deterministic headless C# under Unity. This
code validates rules, it does not ship.

## Run it

```bash
cd prototype

# Watch the bot play a contract, full transcript + journal + debrief
python3 -m bravo_sim --auto --seed 4 --difficulty veteran --misid

# Play a contract yourself (ASCII map, command REPL — `help` for commands)
python3 -m bravo_sim --play --seed 7 --difficulty standard

# Force a setup: the canonical "Cold One" (reported Hantu, actually Demon)
python3 -m bravo_sim --auto --difficulty veteran --misid --ghost demon

# Run the test suite (13 checks, incl. end-to-end bot runs on all tiers)
python3 -m bravo_sim --selftest

# Monte Carlo balance farm in miniature (doc 09): N seeds per difficulty
python3 -m bravo_sim --stats 20
python3 -m bravo_sim --byghost 6     # per-ghost table, incl. forced misID
```

**Playable in a browser:** [`web/field-console.html`](web/field-console.html)
is a self-contained JS port of this sim (all 12 ghosts, all four
difficulties, touch-first UI) — open the file locally, no build step, no
dependencies. **Balance findings** from the Monte Carlo runs, with proposals
back into the design docs, live in [`FINDINGS.md`](FINDINGS.md).

Same seed + same flags ⇒ byte-identical transcript (a selftest asserts it).

## What is implemented (faithful to the docs)

- **Turn structure** (01 §1–2): player phase / ghost phase, 2 AP, the full
  action table (move/sprint, doors, interact, place/throw-lite, channel,
  hide, steady, lift/lower, hand-off-lite, pickup).
- **Grid rules** (01 §4): Chebyshev movement, Bresenham LOS blocked by
  walls/closed doors/tall furniture, windows pass; sound flood-fill at
  −1/tile and −3/closed door; Lit/Dim/Dark with lanterns; hiding spots
  with the Rattled whimper risk.
- **Dread** (01 §5): +2 baseline, all listed sources, 25/50/75 threshold
  events, the visible Hunt check `d100 ≤ Dread − 50` at ≥60, post-Hunt
  relief −30 and the rising floor `30 + 10N` capped at 70.
- **Hunts** (01 §6): Prelude warning, 2 activations × 4 tiles, senses and
  pursuit priority, lost-the-scent, salt-line Deterrents, Strikes with
  knockback and witness Composure, Down-ends-the-Hunt.
- **Composure & Rattled** (01 §7): all drains/restores, the d4 panic table,
  and **false Tells** — White-knuckle observations logged wrong 50% of the
  time, rendered identically to true entries, revealed only at Debrief.
- **Rites** (01 §8): Prepare (reagent logistics incl. scavenging and floor
  recovery), Anchor (the hum, inspection), Enact (banking channels,
  interruption, per-rite special conditions), and **Backfire** with the true
  ghost's auto-Confirmed signature (03 §5).
- **Field Journal** (03 §3): Suspected→Confirmed corroboration,
  instrument-grade entries (salt lines, the dial, claw chips), striking,
  candidate filtering against the Tell sets.
- **Challenge the ID / File the ID** (03 §4): free first challenge, −50
  re-file fee, Verified (+250, +10 Composure) at ≥2 discriminating Confirmed
  atoms or a Backfire signature.
- **Contract generation** (03 §2): misID only from the signature confusion
  pair, Veteran loose-thread log line, Blackout with no claim and mandatory
  filing.
- **All twelve launch ghosts — the six locked confusion pairs** with
  distinct behavior models, rites and Backfire riders: Hantu↔Demon
  (temperature vs. aggression), Mare↔Jinn (bulbs vs. current), Wraith↔Yurei
  (translocation vs. tether), Revenant↔Draugr (two-state LOS sprint vs. the
  zone-bound brute that jams doors), Shade↔Banshee (isolation-triggered vs.
  the Mark that follows one specialist), Poltergeist↔Dybbuk (the multi-throw
  barrage vs. **possession of the downed Alpha** — hosted Hunts, and an
  Exorcism that ends with the host alive).
- Rite special conditions as gameplay: the Naming's all-channel circle with
  its Refuge ward, the Sever's Marked-at-the-effigy bait, the Lone Vigil's
  exactly-one-within-six rule, the Warming/Illumination/Smokeless
  environment gates.
- **Scoring** (01 §10.4): base fee, difficulty multipliers, Alpha rescue,
  no-down/Dread/Hunt/Clean-Journal bonuses, Withdraw call-out fee.

The autoplay bot is a competent Supervisor: it sweeps for the Anchor, lays
salt-line instruments, runs the pair's on-demand test (furnace / breaker),
strikes Rattled testimony, challenges when the Journal kills the claim,
ferries reagents (through Hunts once the Dread floor leaves no quiet), and
extracts with the Alpha. Across seeds it banishes on every difficulty;
Blackout-Demon contracts are the one place it sometimes loses a squad, which
is exactly where the design says the ceiling should be.

## Deliberate prototype simplifications

Documented so nobody mistakes them for design changes:

- One site (the vignette farmhouse) with seeded Anchor/Alpha variation
  instead of full procedural layouts.
- Evidence is modeled as discrete atoms per ghost rather than the full Tell
  taxonomy; report authoring uses a fixed line pool per ghost (no crew
  voices, no Nightmare corruption table).
- Classes are light: Warden +HP, Scout speed + passive read radius,
  Ritualist −1 channel turn. No skill trees, no per-item gear catalog;
  unified 4-slot inventory, unlimited free door ops.
- The van stocks a staples crate (HQ-only reagents) so a mid-contract
  Challenge is never a dead end — the generation-time solvability validator
  of 03 §2.3 stands in for loadout planning.
- Some rite sub-mechanics are flattened to their reagent cost: the
  Poltergeist's favorite-object marking, the Revenant relic escort, the
  Draugr grave-goods recovery, on-site effigy crafting; the Exorcism
  anchors at the vessel-object while possession plays out as behavior.
- No Office meta, no perma-death consequences beyond the flag; the
  contract is the whole loop here.

## Layout

| File | Contents |
|---|---|
| `bravo_sim/world.py` | Map parsing, LOS, sound, light, temperature, pathfinding |
| `bravo_sim/data.py` | Data-driven ghost/rite/reagent definitions, difficulty table |
| `bravo_sim/contracts.py` | Contract + Recon Report generation (misID pipeline) |
| `bravo_sim/journal.py` | Field Journal: entries, corroboration, candidates, challenges |
| `bravo_sim/sim.py` | The turn engine: actions, ghost AI, Dread, Hunts, Rites, scoring |
| `bravo_sim/bot.py` | Autoplay Supervisor policy |
| `bravo_sim/ui.py` | ASCII renderer + interactive command loop |
| `bravo_sim/selftest.py` | 13-check test suite (`--selftest`) |
