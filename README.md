# BRAVO TEAM

> **Alpha finds them. Bravo finishes them.**

A premium-quality, free-to-start, top-down **turn-based tactics** game for mobile
(iOS + Android). You run the *Bravo Shift* of **Halloway & Veck Paranormal
Abatement, Ltd.** — the cleanup crew that deploys *after* the glamorous
investigation team ("Alpha") has identified the ghost and driven away. Armed with
Alpha's recon report, you lead a squad of specialists back into the site, confirm
the entity's behavior, perform the correct **Banishment Rite**, and carry out the
unconscious Alpha members the van left behind.

The hook: **the report is a hypothesis.** On higher difficulties, Alpha sometimes
got it wrong — the "Hantu" you prepared for is actually a Demon, your rite
backfires, and now you must re-identify a hostile entity mid-contract from its
observed behavior.

Inspired by the investigation fantasy of co-op ghost-hunting games
(Phasmophobia et al.), but a different game with a different focus: not
first-person hide-and-seek identification, but **squad tactics, ritual execution,
and deduction under pressure — built mobile-first** (8–15 minute contracts,
save-per-turn, playable offline, one thumb).

## Quick facts

| | |
|---|---|
| Genre | Turn-based tactics / deduction / horror |
| Platform | iOS + Android, phone & tablet; landscape-primary with full portrait support |
| Session | 8–15 min (small/medium sites), 15–25 min (large) |
| Launch content | 12 ghosts · 5 sites (+1 post-launch flagship) · 4 classes · 10 named specialists · 5 difficulty tiers |
| Signature system | Recon Reports that can be wrong → Field Journal deduction → Challenge the ID |
| Business | Free-to-start; cosmetics + opt-in rewarded-ad multiplier, added post-launch. No pay-to-win, no energy, no loot boxes |

## Design documentation

The complete AAA game design package lives in [`docs/design/`](docs/design/).
Start with the canon, which locks the vision, pillars, terminology, roster, and
core numbers; every other document elaborates without contradicting it.

| Doc | File | Covers |
|---|---|---|
| 00 | [Vision & Canon](docs/design/00-vision-and-canon.md) | Pitch, pillars, IP safety, core loop, locked canon |
| 01 | [Core Gameplay](docs/design/01-core-gameplay.md) | Turns, AP, grid, sound & light, Dread, Hunts, Composure, Rites |
| 02 | [Ghost Roster](docs/design/02-ghost-roster.md) | 12 launch ghosts: behavior, Tells, Rites, Backfires, Tell matrix |
| 03 | [Recon & Misidentification](docs/design/03-recon-and-misidentification.md) | Recon Reports, Field Journal, Challenge the ID, difficulty tiers, Blackout |
| 04 | [Squad & Gear](docs/design/04-squad-and-gear.md) | Classes, specialist cast, skill trees, equipment, Alpha rescue |
| 05 | [Maps & Environments](docs/design/05-maps-and-environments.md) | Six sites, environmental systems, procedural variation, fairness |
| 06 | [Progression & Meta](docs/design/06-progression-and-meta.md) | The Office, Contract Board, Standing, Codex, economy, endgame |
| 07 | [Mobile UX](docs/design/07-mobile-ux.md) | Controls, HUD, FTUE, accessibility, performance & battery budgets |
| 08 | [Monetization & Live Ops](docs/design/08-monetization-and-liveops.md) | Skins, rewarded ads, seasons, ethics guardrails *(later phase)* |
| 09 | [Tech Architecture](docs/design/09-tech-architecture.md) | Engine, deterministic sim core, data pipeline, testing, milestones |
| 10 | [Art, Audio & Narrative](docs/design/10-art-audio-narrative.md) | Art & audio direction, world-building, tone bible, localization |

## Playable prototype

A deterministic, headless **core-loop prototype** lives in
[`prototype/`](prototype/) — pure Python, no dependencies. It implements the
tactical ruleset of docs 01–03 (Dread, Hunts, Composure with false Tells,
Rites with Backfire-as-clue, the Field Journal, Challenge the ID) for six
ghosts across three confusion pairs on the vignette farmhouse, with an
interactive ASCII mode, an autoplaying Supervisor bot, and a 13-check test
suite:

```bash
cd prototype
python3 -m bravo_sim --auto --seed 4 --difficulty veteran --misid  # watch
python3 -m bravo_sim --play                                        # play
python3 -m bravo_sim --selftest                                    # verify
```

## Status

**Concept / pre-production.** This repository contains the design package
(v0.1) and the Python design-validation prototype of the core loop. All
numeric values are tuning targets, not shipped balance.
