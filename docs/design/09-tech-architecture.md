# 09 · Technical Architecture — Engine, Sim Core, Data, and the Machinery Behind the Dread

**Document 09 · Owner: Technical architecture · Status: Draft v0.1 · Consistent with Canon v0.1**

This document decides the engine, defines the simulation architecture, and specifies the pipelines that let a twelve-ghost deduction game ship at AAA mobile quality (canon §12) and stay fair (canon §3.5). Player-facing budgets it must hit are contracted in 07-mobile-ux.md §11–12; content rules it must enforce live in 02-ghost-roster.md §5 and 03-recon-and-misidentification.md §2.3. All numbers are **v0.1 targets** unless marked otherwise.

The one-sentence thesis: **the game is a small deterministic C# library; everything else is a client of it.**

---

## 1. Engine decision — Unity 6 LTS + URP + C# [DECIDED]

Working assumption confirmed. The decision is driven by one architectural fact: our core asset is a headless, deterministic, turn-based simulation (§2) that must run **inside the shipping game, inside CI runners, and inside a Monte Carlo balance farm** (§10). In Unity, all three are the same plain C# assembly. In Unreal, the sim would be C++ against engine types or a parallel reimplementation; in Godot, the surrounding production ecosystem is the risk, not the language.

| Criterion | Unity 6 + URP | Unreal 5 | Godot 4 |
|---|---|---|---|
| Sim core sharing (client + CI + bot farm) | **Same C# assembly everywhere**; .NET 8 on servers, IL2CPP on device | C++ core possible but engine-entangled by default; headless builds heavyweight | C# shared assembly also works; weakest CI/build tooling of the three |
| Mobile binary + memory floor | ~35–60 MB empty; fits 07's 300 MB first-run with room for content | ~90–150 MB empty; hostile to the 300 MB budget and Minimum-class 3 GB RAM | Small footprint, comparable to Unity |
| Renderer fit for top-down horror | URP **Forward+**: many dynamic lights per screen — our horror language *is* lights (§8.1) | Vastly more renderer than a 24–40 px top-down ghost needs; Lumen/Nanite are dead weight on our device matrix | Adequate forward renderer; no equivalent of Forward+ clustering maturity on mobile Vulkan |
| Heavy 2D UI (Journal, Office, Codex) | UI Toolkit + established mobile UI patterns | UMG workable but slower iteration for a UI-dense game | UI system fine; tooling thinner |
| Asset delivery / streaming | Addressables + mip streaming, mature | Pak/chunk system mature but heavier ops | No production-grade equivalent; we'd build it |
| Device matrix reach (07 §12: Vulkan 1.1, A12, 3 GB) | Proven at exactly this tier | Proven mostly at higher tiers | Unproven at AAA-mobile scale and cert load |
| Hiring & middleware | Largest mobile talent pool; first-class Wwise/FMOD, crash/analytics SDKs | Smaller mobile-Unreal pool | Smallest pool; middleware support partial |
| Cost & terms | Per-seat subscription; runtime fee rescinded (2024) — no rev share | 5% royalty past threshold | Free (MIT) |

**Why not Unreal:** everything Unreal is best at — high-end lighting, cinematic fidelity, big-world streaming — is off-camera in a top-down tactics game rendered at phone size, while everything we bleed on daily — binary size, 3 GB RAM devices, C# sim reuse, UI iteration speed — is where Unreal is weakest for us. **Why not Godot:** the engine could ship this game; the *ecosystem* (device-farm tooling, streaming, store cert experience, senior hiring, middleware) cannot yet carry a AAA schedule, and we would spend our innovation budget rebuilding plumbing instead of ghosts.

Committed stack: **Unity 6 LTS · URP Forward+ · C# 12 / .NET Standard 2.1 sim assembly · IL2CPP on both platforms · Burst/Jobs where profiling earns it · Addressables · Wwise** (audio pipeline detail in 10-art-audio-narrative.md). Engine risk register: we pin one LTS for the project, upgrade only at milestone boundaries, and keep the sim core engine-free (§2) as the structural hedge — if Unity terms ever shift again, the game's brain walks away intact.

---

## 2. The deterministic sim core — codename **Nightshift**

### 2.1 Principle

All game rules — grid, AP, LOS, sound, Dread, Hunts, Composure, Rites, ghost AI, contract generation — live in `HV.Sim`, a **pure C# assembly with zero `UnityEngine` references**, no I/O, no clocks, no floats (§2.3). Unity is a *view*: it feeds player intents in as Commands and renders the stream of SimEvents that comes back. The sim never knows a frame rate exists.

```mermaid
flowchart TD
    subgraph HV.Sim — deterministic, headless
        GS[GameState\nsnapshot-serializable] --> RE[Rules engine\n01 core + 02 overrides]
        RE --> EV[SimEvent stream\nordered beats]
        CG[Contract generator\n+ misID validator §5] --> GS
        AI[Ghost AI\nutility scorer §4] --> RE
    end
    subgraph Clients of the sim
        U[Unity presentation\nrenders events, sends Commands]
        CI[CI validators\ncontent build §3.2]
        MC[Overtime bot farm\nMonte Carlo balance §10.2]
        FS[Future async MP service\npost-launch research, canon §12]
    end
    U -->|Commands| RE
    EV --> U
    CI --> CG
    MC --> RE
```

### 2.2 Commands, events, state

- **Command:** one player intent (`Move`, `Interact`, `Channel`, `ChallengeID(ghost)`, `EndPhase`, …) matching 01 §2's action table. Commands are validated by the sim (illegal ⇒ rejected with reason; the UI greys options *using the same validator*, so UI and rules can never disagree).
- **SimEvent:** one atomic outcome — a beat (01 §1), a Dread tick, a Tell emission, a Journal state change, a Hunt check result. Events carry perception flags (heard/seen/unperceived) so the presentation layer shows exactly what 01 §1 permits and the Debrief replay can show the rest.
- **GameState:** the complete contract state — grid deltas from the site seed, entities, Dread, Composure, Journal ledger, RNG stream cursors. Target size ≤32 KB raw, ≤8 KB LZ4-compressed (v0.1 target). Meta state (Office, roster, Codex, currencies) is a separate `HV.Meta` state object with the same snapshot discipline.
- **Replay = contract seed + command log.** Any contract ever played can be re-simulated bit-exactly from ~2 KB of data.

### 2.3 Determinism rules

1. **No floats in `HV.Sim`.** Integer math throughout; Q16.16 fixed-point where fractions are needed (sound attenuation, utility scores). A Roslyn analyzer fails CI on any `float`/`double`/`System.Math` usage in the assembly — determinism is enforced by tooling, not code review.
2. **Seeded RNG streams**, one PCG32 instance per concern: `contract-gen`, `ghost-behavior`, `tell-emission`, `dread-checks`, `composure`. Streams are independent, so a player opening one extra door does not reshuffle the ghost's whole future — replays stay comparable and "no hidden dice" (canon §3.5) is auditable. Presentation randomness (particle jitter, VO picks) uses a separate non-authoritative RNG that never touches the sim.
3. **Fixed iteration order** everywhere (entities by stable ID, considerations by index). Ties break deterministically before any RNG draw.
4. **Golden hash:** xxHash64 of GameState appended to every snapshot and replay frame. Any client/CI/farm divergence is caught at the exact round it occurs.

### 2.4 What determinism buys (why this is non-negotiable)

| Payoff | Mechanism |
|---|---|
| Save-per-turn, killable app (canon §12) | Snapshots are tiny (§2.2) — writing one per phase is free (§6) |
| Debrief replay & "what you missed" (01 §1) | Re-sim from seed + commands; render unperceived events this time |
| Balance testing at scale | Overtime farm re-runs thousands of contracts headless, no rendering (§10.2) |
| Fair-scary auditability (canon §3.5) | Every death reproducible; every Hunt check inspectable from the replay |
| Future async multiplayer (canon §12 [OPEN]) | Shared contracts = shipping a seed; verifying a rival's run = replaying their 2 KB command log server-side |
| Cheat resistance | Claimed results are re-simulated, never trusted (§7) |
| Cross-device continuation | A snapshot resumes identically on any platform — integer math makes iOS/Android/x86 bit-exact (§6.3) |

---

## 3. Data-driven content — codename **Stockroom**

### 3.1 Format decision: versioned JSON source, compiled binary catalog [DECIDED — not ScriptableObjects]

Ghosts, Tells, Rites, Backfires, gear, reagents, site variation tables, contract templates, and tuning tables are authored as **JSON files in the repo** (`/content/*.json`, schema-validated), compiled at content-build time into a compact binary catalog (FlatBuffers) shipped via Addressables.

ScriptableObjects lose on three counts: the engine-free sim (§2) cannot read them; they diff badly in review (YAML asset noise vs. a clean two-line JSON change); and validating them requires booting the Unity editor in CI, which the Stockroom validators must not depend on. Designers get: JSON Schema autocompletion in VS Code, a custom in-editor **Stockroom Inspector** that round-trips to the same JSON for visual editing, and hot-reload of the compiled catalog in development builds. **Acceptance test for the pipeline: a designer adds a post-launch ghost (e.g. the Weeper, canon §8) — behavior pack, Tells, Rite, Backfire, confusion-set entries — with zero engineer time, and CI tells them within minutes whether it's fair.**

### 3.2 Content-build validators (build fails, not warns)

| Validator | Rule enforced | Source of truth |
|---|---|---|
| Schema & reference check | Every ID resolves; no orphan Tells, Rites, reagents | Stockroom schemas |
| **Tell matrix uniqueness** | Every ghost row differs from every other row in **≥2 columns** of the Master Tell Matrix | 02-ghost-roster.md §5 |
| Confusion pair separation | Each locked pair (canon §8) has ≥2 observable separator Tells; secondary confusables (Nightmare, 03 §2.2) likewise | 02-ghost-roster.md §5 |
| Rite reachability | Every Rite's reagents are purchasable (06 §6.2) or present on scavenge tables of every site the ghost can spawn on | 04 / 05 / 06 |
| **Solvability sampling** | 500 seeds per (confusion pair × site × tier): misID validator (§5) pass rate ≥85%; any pair-site combination below floor blocks the build | 03-recon-and-misidentification.md §2.3 |
| Special-case rules | Dybbuk contracts seed ≥1 Alpha victim (03 §2.2); Shade rite solo-viability; Demon hunt-floor override sanity | 02 / 03 |
| Readability manifest | Every ghost has silhouette, ring-glyph set, stinger, haptic pattern, and decal assigned | 02 §6, 10-art-audio-narrative.md |

Content and code version independently: every snapshot and replay records the **content hash** it was played under, so a tuning patch never corrupts an in-flight contract — the old catalog is retained until the contract ends.

### 3.3 Localization and text

All player-facing strings (Tell text, report voice templates from 03 §2.1, forms, barks) live in the same pipeline as string tables keyed by ID, exported to standard XLIFF for vendors. Report voice templating (Crew Farrow/Marlowe/Hale, 03 §1.1) is data: template + slot grammar per crew, so narrative iterates without engineering.

---

## 4. Ghost AI — hidden-information agents

### 4.1 Decision: utility scoring on a macro-mode state machine [DECIDED — no behavior trees]

The generic layer (01 §3) is a five-mode state machine — **Dormant → Active → Prelude → Hunt → Enraged** — with transitions owned by the rules engine (Dread thresholds, Hunt checks, Backfires). *Within* a mode, the ghost picks its move and its one-to-two interactions by **utility scoring**: each candidate action is scored as a weighted sum of fixed-point considerations (distance to interest, noise memory, clutter density, light state, target Composure, Anchor homing, per-ghost taste). Highest score wins; ties break by consideration index, then one draw from the `ghost-behavior` stream.

Why not behavior trees: our twelve ghosts differ by *weights and vetoes*, not by control flow. Utility weights are pure data — a behavior pack (§4.2) — so designers tune personality in Stockroom without touching a tree editor, and the scorer is trivially deterministic and unit-testable. BTs would push ghost identity into structure, which means engineer time per ghost — exactly what §3 forbids.

### 4.2 Behavior packs

One JSON pack per ghost: consideration weights, interaction taste table (which Tells it emits, at what base rates), movement profile (speed as a function — Hantu's `f(cold)`, Revenant's creep/sprint pair, Draugr's constant 3), hard vetoes (the "Never does" column of 02 §5, enforced as filters *before* scoring so a Yurei can never throw even under a weight bug), Hunt-layer parameters (hunt speed, senses, ward interaction, Demon's Dread ≥40 override), and the Backfire signature script. The generic Hunt layer (01 §6) consumes pack parameters; only the **Dybbuk's host mechanic** and the **Wraith's wall-phase pathing** are code-level capability flags, implemented once in the generic layer and switched on by the pack.

### 4.3 Difficulty knobs (per tier, data-driven)

| Knob | Trainee | Standard | Veteran | Nightmare / Blackout |
|---|---|---|---|---|
| Aggression weight multiplier | ×0.7 | ×1.0 | ×1.1 | ×1.25 |
| Hunt duration modifier | −2 turns | 0 | 0 | +1 turn |
| Tell emission rate floor | Boosted +20% | Baseline | Baseline | Baseline — **never lowered** |
| Composure drain multiplier | ×0.75 | ×1.0 | ×1.1 | ×1.25 |

The floor rule is structural: difficulty may make the ghost *meaner*, never *less identifiable* — the passive-guaranteed Tell bound (≥90% by Dread 50, 03 §2.3) is validated per tier by the Stockroom solvability sampler. Deception scales through the *report* (03 §6), not through starving evidence.

---

## 5. Procedural contract generation & the misID validator

The generator lives in `HV.Sim` (so CI and the bot farm run the identical code path) and implements 03 §2.1's pipeline: ground truth → misID roll per tier (0/0/15/35/–, canon §10) → confusion-set draw → **validation** → evidence selection → crew voice → tier degradation. Site variation (Anchor, temperatures, breaker, hiding spots, victims — canon §11) is drawn from 05-maps-and-environments.md's per-site variation tables on the `contract-gen` stream.

The **misID validator** is the fairness gate (03 §2.3), and it is *not* statistical hand-waving — it checks the actual seed:

1. **Reachability analysis (symbolic).** For each disambiguating Tell between true and claimed ghost, check its preconditions against the generated site graph: the Mare/Jinn breaker test needs a functional breaker; a Hantu speed read needs one warm-able and one cold room; the Wraith salt test needs salt in the store or on this site's scavenge table. ≥1 such **player-triggerable** Tell must exist.
2. **Emission simulation (Monte Carlo).** Run the ghost's behavior pack headless against the reference pacing model (Dread +2/turn, 01 §5) 200 times; ≥1 **passive** Tell must be emitted with ≥90% probability by Dread 50.
3. **Third Tell** may be either type, or the always-reachable Backfire signature (03 §5).
4. Fail ⇒ reroll site variation, max 8 attempts, then **abort the misID and file a correct report** (03 §2.3 — "misID is a privilege of the seed").

Account-level pity rules (no 3 consecutive misIDs; the Halloway Memo, 03 §8.4) are enforced in `HV.Meta` at Contract Board generation (06 §2.2), client-side and offline-capable. On-device generation cost budget: ≤150 ms per contract including validation, amortized during Board refresh — never on the deployment loading screen.

---

## 6. Save system & cloud sync

### 6.1 Snapshot cadence and format

- **Checkpoint at the start of every player phase** (01 §1) plus on `OnApplicationPause`. Mid-phase kills lose nothing: the command log since the last snapshot is journaled per-command and replayed on restore — "killable at any moment with zero loss" (canon §12) is literal.
- **Format:** header (save schema version, contract ID, round, content hash, state xxHash64) + LZ4 GameState blob. ≤8 KB compressed (§2.2). Meta saves (`HV.Meta`) identical scheme, ≤64 KB.
- Writes are **atomic double-buffered**: write to slot B, fsync, CRC-verify, then swap the head pointer. The previous **three round snapshots** are retained.

### 6.2 Corruption resilience

On load: CRC fail or state-hash mismatch ⇒ fall back one snapshot (max three rounds back — worst case the player replays two turns, and the game says so in fiction: *"Form 3-B: report water damage to paperwork"*). Snapshot schema migrations are forward-only with per-version migrators, tested in CI against a corpus of saves from every shipped build. A save that fails all recovery is quarantined and uploaded (with consent) for forensics, never silently deleted.

### 6.3 Cloud sync & conflict rules

A thin H&V profile service (blob store + metadata; no game logic) syncs opportunistically — platform saves (iCloud / Play Games) are insufficient because **cross-platform continuation iOS↔Android is a requirement**. Conflict resolution is type-aware, not last-writer-wins across the board:

| Data | Rule |
|---|---|
| In-flight contract snapshot | Highest round number wins; tie ⇒ most recent server receipt time. UI offers "continue on this device?" when a newer remote exists |
| Codex, Commendations, unlocks | **Monotone set-union** — knowledge can only grow; merging two devices never loses an unlock |
| Payout, Standing, Reagent stock | Per-transaction ledger with device-local sequence numbers; merge replays both ledgers (this structure is exactly what migrates to the server in the 08 phase, §7) |
| Settings | Per-device, never synced |

Offline is a first-class state, not an error: nothing above blocks play; sync is reconciliation, not permission.

---

## 7. Offline-first, and the server-authoritative economy of the 08 phase

The split is decided now so nothing needs re-architecting later (canon §12: monetization "added in a later phase, designed now"):

| Stays client-side forever | Migrates to server at 08 phase |
|---|---|
| The entire sim, ghost AI, contract generation, misID validator | **Glimmer balance** — server ledger, client caches a signed balance |
| Saves & local progression; play with zero connectivity | **Cosmetic entitlements** — server-granted, client-cached, verified on sync |
| Payout / Standing / Reagents (single-player, no trade, no power for sale — canon §3.5 makes server authority pointless here) | **IAP receipt validation** — server-to-server: App Store Server API v2 + Play Developer API with real-time developer notifications; no client-trusted receipts, ever |
| Codex & knowledge progression | **Rewarded-ad multiplier grants** — ad-network server-side-verification callbacks credit the multiplier; the client never self-reports a completed ad |

Anti-cheat posture matches the stakes: in a single-player offline game where money buys only cosmetics, client-side currency hacking harms nobody and we spend zero effort fighting it beyond telemetry sanity bounds (a client reporting 40 banishes/hour gets flagged, not banned). The moment async multiplayer or competitive boards arrive (post-launch research, canon §12), the determinism dividend pays out: submitted results are **seed + command log**, and the server *re-simulates* rather than trusts — cheat resistance was bought in §2, not bolted on.

---

## 8. Rendering strategy — AAA on mobile, top-down

### 8.1 URP Forward+ and the light budget

Darkness is our horror language (10-art-audio-narrative.md): the Mare kills lights, the Jinn flickers them, Dread events brown-out rooms, and the player reads safety in lumens. Forward+ clustered lighting makes many small dynamic lights affordable, which is exactly our load: many sources, small radii, top-down occlusion.

| Budget (per visible screen) | Minimum class | Target class | Premium class |
|---|---|---|---|
| Realtime point/spot lights | 6 | 12 | 16 |
| Shadow-casting lights | 1 (carried lantern) | 2 | 3 |
| Particle budget | 50% tier | 100% | 100% + premium VFX layer |

Techniques: per-room light state is *sim data* (01 §4.5) rendered as light intensity/color animation — a flicker is an intensity curve, **never** a shadow-map re-render; baked AO and baked ambient per site variation; darkness beyond light radii is fog-of-war compositing + grading, not brute-force lighting. The thermal overlay and ring-glyph event layer (02 §6) render as a screen-space pass over the grid, costed as UI.

### 8.2 Draw calls and batching

Top-down + room-based sites give a gift of an occlusion story: room-level culling from the sim's own visibility data. Static geometry batches per room; furniture, decals (frost prints, drag-marks — 02 §6's one-decal-budget), and debris use GPU instancing; UI is UI Toolkit (one pass); SRP Batcher on everywhere. **Draw call ceilings: ≤300 Minimum, ≤500 Target, ≤700 Premium.** A per-site CI capture on reference hardware fails the build over ceiling — art discovers budget breaks at authoring time, not cert time.

### 8.3 Texture streaming and asset delivery

ASTC textures universally (Vulkan 1.1 floor, 07 §12); mip streaming with pools of **256 MB (Minimum) / 384 MB (Target)**. Delivery decision for 07 §11's open point: **CDN-backed Addressables remote catalogs on both platforms** — one pipeline, one cache policy (LRU + per-pack pin, per 07), one patch path for live content — rather than maintaining parallel Play Asset Delivery and ODR integrations. Base install (≤300 MB: FTUE, two sites, all 12 ghost sims + behavior packs, core audio) ships in the store binary; site packs of 40–80 MB stream per 07 §11. Revisit platform-native delivery only if store featuring programs demand it.

### 8.4 Frame pacing, eco mode, thermals

60 fps Target / 30 locked Minimum / optional 120 Hz **UI-and-camera-only** on Premium (07 §11): the sim advances on turns, so high refresh applies to camera scrolls and UI transitions via UI Toolkit's own update path — world rendering stays at 60. Eco mode implements 07's spec: URP asset swap (halved particles, reduced shadow resolution) + dynamic resolution ×0.85 + 30 fps cap, auto-triggered on OS battery saver or thermal state ≥ `serious`/`MODERATE`, switching **only at phase boundaries** with the single quiet toast. Between player inputs the game is idle by construction — we exploit it: when no animation or beat is playing, render on demand, not per-frame. A turn-based game that warms a phone in menus has failed; idle GPU is the cheapest thermal headroom we own.

---

## 9. Analytics & telemetry — codename **Timecard**

Events are emitted **by the sim core** (a telemetry sink on the SimEvent stream), so instrumentation is deterministic, replayable, and identical across client and bot farm — the balance dashboard cannot disagree with the game.

| Family | Events (examples) | Feeds |
|---|---|---|
| Funnel | FTUE step completion (07 §9 beats), contract start/abandon/complete, session length | Retention & FTUE tuning |
| **Balance** | Per-Tell observation rate, Journal state transitions, **Challenge accuracy** (declared vs. true ghost), per-ghost banish/Backfire/withdraw rates, Dread at banish, Hunt survival, Rattled misreport incidence | 02/03 tuning; compared against Overtime farm priors (§10.2) — human deltas from bot baselines are the misID difficulty signal |
| Economy | Payout/Standing/Reagent ledger deltas, price-point interactions (08 phase) | 06 §6 sink pressure |
| Performance | FPS percentiles, thermal state timeline, battery %/hr on the standard replay, load times, crash/ANR | 07 §11 budget enforcement; yearly matrix re-baseline (07 §12) |

Posture: offline queue with opportunistic batched upload (Wi-Fi preferred); no PII, no ad identifiers pre-08 phase; random install ID, resettable; regional data residency; in-game telemetry opt-out (crash reporting excepted); GDPR delete/export endpoints from soft launch day one. The game is not child-directed (12+ target rating); ATT prompts arrive only with the 08 ads phase and only for users who opt into rewarded ads.

---

## 10. Testing strategy

### 10.1 Sim-core tests

- **Table-driven rules tests**: every numbered rule in 01 (AP costs, noise values, Dread math, Hunt check `d100 ≤ Dread − 50`, Rattled table) encoded as data-driven unit tests — the tuning table *is* the test fixture, so a tuning change updates tests and game from one file.
- **Vetoes as properties**: property-based tests hammer each behavior pack with random states asserting the "Never does" column (02 §5) — a Wraith that touches a door is a red build.
- **Golden replays**: a curated corpus (including canon §15's Jinn scenario and 03 §9's "Cold One") re-simulated on every commit across x86 CI, IL2CPP-iOS, and IL2CPP-Android runners; any state-hash divergence fails.

### 10.2 The Overtime farm — Monte Carlo balance at scale

Nightly: **10,000 headless contracts** across the full matrix (12 ghosts × 6 sites × 5 tiers × misID on/off) at ~50 ms/contract on a single build machine, using three bot policies — *ReferenceBot* (03's reference pacing model), *GreedyBot* (rushes the Rite), *CautiousBot* (over-verifies) — plus a *ChaosBot* fuzzer hunting crashes and soft-locks. Dashboards: banish rate, mean rounds, misID solve rate and time-to-Challenge, Backfire frequency, per-pair separator-Tell usage. Regression gates: any ghost outside its 02 §2 target bands, or any pair-tier solve rate below 03 §11 floors, blocks release. This farm is also the Stockroom solvability sampler (§3.2) — same code, bigger N.

### 10.3 Device farm

In-house rack: 2× each matrix anchor device (07 §12) for daily smoke, weekly full-budget passes (fps percentiles, the standardized 12-minute battery replay, thermal soak: three consecutive contracts). Cloud device farm (Firebase Test Lab class) for breadth: install/boot/FTUE on ~50 models pre-release. Store-cert dry runs from vertical slice onward, not at the end.

---

## 11. Team shape & milestones

| Milestone | Duration | Team (peak) | Scope | Exit criteria |
|---|---|---|---|---|
| **Prototype** | 4 mo | 8 — 3 eng (2 sim, 1 Unity), 2 design, 1 art, 1 audio, 1 prod | Nightshift core, greybox farmhouse, 3 ghosts (Hantu, Demon, Mare), Trainee–Veteran, misID on | The 03 §9 "Cold One" moment lands with playtesters on device; turn hitch <100 ms; golden-replay hash identical across iOS/Android/x86; Overtime farm running |
| **Vertical slice** | 6 mo | 18 — 7 eng (+rendering, tools, backend), 4 design, 4 art, 1 audio, 1 QA, 1 prod | Farmhouse at ship quality, 6 ghosts (three confusion pairs), Office skeleton, save/cloud v1, Stockroom pipeline live | Canon §15 scenario playable at ship quality; 60 fps + all 07 §11 budgets on Target class; a designer ships a ghost tweak with zero engineer time; slice greenlights production |
| **Production → soft launch** | 9 mo | 30 — 10 eng, 6 design, 8 art, 2 audio, 2 QA, 2 prod | All 12 ghosts, 5 launch sites (asylum decision per canon §11), full meta (06), Timecard, localization (5 languages), monetization scaffolding dark | Soft launch in 2–3 geos; crash-free ≥99.5%; D1 ≥ 42% / D7 ≥ 16% (v0.1 targets); misID solve rates within 03 §11 bands from *human* telemetry; battery/thermal green on full matrix |
| **Global launch** | 3 mo | 35 + live-ops pod | 08 phase live (Glimmer, skins, rewarded ads, server economy §7), 10+ languages, featuring build | Store featuring checklist pass; Minimum-class certification on full matrix; economy dashboards live; on-call rotation staffed |

Roughly 22 months prototype-to-global. Structural rules: the **sim team owns `HV.Sim` end-to-end** and reviews every rules PR; a standing **tools engineer** guards the designer-autonomy acceptance test (§3.1) from vertical slice onward; backend stays ≤2 engineers until the 08 phase because §7 keeps the server surface deliberately small.

---

## Open questions

- **Async multiplayer substrate:** determinism makes shared-seed contracts and replay-verified rival runs cheap (§2.4), but product shape (ghost-race vs. shared-board leagues) is 08's live-ops call — architecture reserves the seams, commits nothing.
- **Burst-compiled sim hot paths:** if Overtime farm throughput or on-device contract generation ever misses budget, port the utility scorer and LOS/sound propagation to Burst — decide from prototype profiling, not up front.
- **In-editor Stockroom Inspector scope:** full visual editor vs. thin JSON-form wrapper — decide after watching designers work the vertical slice; the JSON contract (§3.1) is stable either way.
- **Cloud sync provider:** self-hosted thin profile service vs. managed BaaS for blob+ledger sync (§6.3) — cost/compliance trade study due before production start; the client-side ledger format is final regardless.
- **Site pack CDN economics:** if soft-launch bandwidth costs spike, revisit Play Asset Delivery/ODR for the two largest site packs only (§8.3), keeping Addressables as the single logical pipeline.
