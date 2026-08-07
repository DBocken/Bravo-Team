# Prototype Findings — v0.1 Balance & Design Feedback

**Source:** `bravo_sim` Monte Carlo runs (`--stats 25`, `--byghost 6`) plus
observations made while building the sim and its Supervisor bot. This is the
feedback channel 09-tech-architecture.md's balance farm exists to provide:
findings and *proposals* only — canon and the v0.1 tuning tables in docs
00–03 stay authoritative until a design pass accepts a change.

## 1. Headline numbers

25 seeds per difficulty, autoplaying Supervisor bot:

| difficulty | banished | withdraw | failed | timeout | avg rounds | avg payout | misID rolled / solved |
|---|---|---|---|---|---|---|---|
| Standard  | 25/25 | 0 | 0 | 0 | 18.6 | 893  | — |
| Veteran   | 22/25 | 1 | 1 | 1 | 28.8 | 1096 | 6 / 3 |
| Nightmare | 21/25 | 2 | 1 | 1 | 31.7 | 1447 | 10 / 6 |
| Blackout  | 14/25 | 10 | 0 | 1 | 52.6 | 1419 | — |

The ladder behaves as designed: Standard is reliably winnable, the misID
tiers cost real contracts, and Blackout's cold-start roughly doubles contract
length with Withdraw (a paid scouting run per 03 §8.7) as a frequent, honest
outcome.

6 seeds per ghost — Standard, and Veteran with a **forced** misidentified
report:

| ghost | std banish | std rds | misID banish | misID rds | re-ID correct |
|---|---|---|---|---|---|
| hantu | 6/6 | 22.7 | 6/6 | 23.3 | 6/6 |
| demon | 6/6 | 25.8 | **1/6** | 45.0 | 6/6 |
| mare | 6/6 | 14.5 | 6/6 | 23.8 | 6/6 |
| jinn | 6/6 | 13.3 | 6/6 | 17.8 | 6/6 |
| wraith | 6/6 | 16.8 | 6/6 | 21.5 | 6/6 |
| yurei | 6/6 | 21.0 | 6/6 | 32.8 | 6/6 |
| poltergeist | 6/6 | 12.5 | 6/6 | 27.7 | 6/6 |
| banshee | 6/6 | 12.7 | 6/6 | 19.0 | 6/6 |
| revenant | 6/6 | 14.0 | 6/6 | 30.7 | 6/6 |
| shade | 6/6 | 16.0 | 6/6 | 32.0 | 6/6 |
| draugr | 6/6 | 18.8 | 6/6 | 27.7 | 6/6 |
| dybbuk | 6/6 | 15.5 | 4/6 | 49.0 | 6/6 |

**The deduction layer never loses.** Re-identification reached ground truth
in 72/72 forced-misID contracts — the Tell matrix, the salt-line instrument,
and Backfire-as-clue are sufficient in practice, not just on paper. What
varies is whether the crew can still *cash in* the correct answer.

## 2. Flags and proposals

### F1 — The late-discovered Demon is nearly unwinnable (1/6)

A "Hantu" that turns out to be a Demon is the canonical misID (canon §1) —
and in play it is the one contract the bot almost never finishes. By the
time the ID flips (~round 10–15), Dread is high, the Demon hunts from 40
with doubled rolls, and the Naming still demands on-site research (2
name-fragments) plus a 4-turn all-channel with nobody guarding. The result
is a war of attrition against a rising floor.

This connects directly to 02-ghost-roster.md's open question on fragment
count/density. **Proposals** (pick one, not all):
- A **Verified** Challenge to Demon marks one name-fragment location on the
  map — the crew's certainty pays out in research speed, reinforcing 03's
  verification economy.
- Fragment count scales with site size: 1 on Small/Medium, 2 on Large+.
- Naming length 4 → 3 when the working ID was Verified before Enact.

The reverse direction (Demon-claimed, actually Hantu) is completely healthy:
6/6, fastest misID solve in the set — the report even packs Warming-adjacent
reagents.

### F2 — The Poltergeist→Dybbuk flip is slow (4/6, 49 rounds)

Stillness loadout (salt + iron) shares nothing with the Exorcism (votive ×4
+ consecrated water + cleansing bundle), so the flip triggers the longest
re-fetch chain in the game across the whole site. Solvable but grinding.
**Proposal:** Exorcism votive ×4 → ×3, or votive scavenge yields +1 in
bedroom-archetype rooms (where the folklore puts them anyway).

### F3 — Rules the prototype forced us to sharpen (already applied here)

These came out of making the sim actually run; the design docs should adopt
them explicitly in the next revision:

1. **Channel Dread surcharge is per Channel *turn*, not per channeler**
   (01 §5.1 wording is ambiguous for the Naming's all-channel — per
   channeler makes the Demon rite self-defeating at +12/turn).
2. **A running furnace outpaces the Hantu's room-cooling.** If the double
   cooling rate (HT-3) applies while the furnace burns, the Warming Rite's
   ≥15 °C condition is unreachable — the Tell should read "cools occupied
   rooms at double rate *while the site heat is off*".
3. **The Naming's chalk circle needs an explicit Refuge keyword** (01 §6.4)
   — one blocked strike per Hunt for channelers in the circle. Without it,
   an all-channel rite against a threshold-40 hunter is statistically a
   squad wipe; with it, the "wards pre-laid, doors shut" counterplay the
   docs describe actually carries the fight.
4. **Fumbled/dropped reagents must be recoverable floor objects** (01 §8.1
   implies this; the first prototype implementation lost them, and
   single-source reagents made contracts silently unwinnable).
5. **Past the Dread floor ratchet (≥ 70) there is no quiet left** — the only
   winning lines are finishing the rite *through* Hunts or withdrawing.
   That is the intended endgame pressure, and squads (and the tutorial)
   should be taught it: 01 §5.3 could add one sentence naming the
   "channel through it" line as intended play, not desperation.

### F4 — Healthy signals worth keeping

- Standard rounds: 12.5–25.8 per ghost — inside the 8–15 min session target
  at the mobile pacing model, with the Demon correctly the longest.
- Blackout's 40% Withdraw rate with the ×3.0 multiplier makes the
  scout-then-retry loop economically sane without being free.
- Backfire-as-clue resolved every wild-challenge line the bot ever took;
  no contract dead-ended after a wrong Rite.

## 3. Reproduction

```bash
cd prototype
python3 -m bravo_sim --stats 25      # tier table
python3 -m bravo_sim --byghost 6     # per-ghost table
python3 -m bravo_sim --auto --difficulty veteran --misid --ghost demon  # watch F1
```

All numbers are deterministic per seed; the tables above used seeds 1–25 and
1–6 respectively.
