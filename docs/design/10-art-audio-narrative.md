# 10 · Art, Audio & Narrative — The Haunted Diorama and the Company That Cleans It

**Document 10 · Owner: Art direction, audio direction, narrative & world · Status: Draft v0.1 · Consistent with Canon v0.1**

This document owns how Bravo Team looks, sounds, and reads. Its anchors are canon §2 (blue-collar horror) and canon §3 pillar 3; its hard clients are 02-ghost-roster.md §6 (ghost readability rules), 07-mobile-ux.md (HUD, audio-off parity, accessibility), 08-monetization-and-liveops.md §2.5 (cosmetic readability gate, silhouette tolerances, class accent bands — defined here), and 09-tech-architecture.md §8 (light budgets, Wwise). Writing and casting of the Office event vignettes are owned here per 06-progression-and-meta.md §1.1; portraits and barks for the specialist cast per 04-squad-and-gear.md §3. All values are **v0.1 targets**.

Direction in one line: **a haunted diorama, documented by a company that files everything.**

---

## 1. Art direction

### 1.1 The look — stylized realism, diorama framing

Top-down at phone size demands shape and value before detail. The target is **stylized realism**: believable materials and grounded proportions, simplified toward silhouette and value — closer to a scale model of a real farmhouse than to either photorealism (illegible at 32 px) or cartoon flatness (kills the horror). The fixed north-up camera (07 §3.4) sits at ~57° tilt with a gentle tilt-shift depth falloff at Wide zoom, so every site reads as a **diorama**: a model house on a black table, lit from inside. That framing is the horror thesis — the player is outside the dollhouse, and something else is in it.

**Cutaway wall spec** (built once, per 07 §3.4's fixed camera): south-facing walls (camera side) render at knee height with a clean cut cap and a faint full-height footprint line; doorframes on cut walls stay ghosted at 30% so door states read; north walls render full. No roofs, ever. Interior floors are the canvas of the game — wood grain, lino, tile designed to carry decals (frost prints, drag-marks, salt) at high contrast.

### 1.2 Value structure — darkness is the canvas, light is information

The image is built dark-first. Baseline site value sits low (Dark tiles ~15% value); everything the player must read is carried by **light, not albedo** (09 §8.1's Forward+ budget exists for exactly this):

- **Lit tiles** are pools of warm practical light (fixtures, lanterns, fire) — safety, information, Composure.
- **Dim tiles** carry cool ambient spill — legible, uneasy.
- **Dark tiles** drop to silhouette-and-outline: the squad renders as rim-lit shapes, furniture as mass. You can navigate dark; you cannot *know* dark.
- The horror grammar is light behaving badly: flicker curves, brown-outs, a corridor of bulbs dying one by one (a Mare's path is literally drawn in dying light). Per 09 §8.1, flicker is an intensity curve, never a shadow re-render.

Rule for every artist: **if a screenshot's information survives being posterized to 4 values, the composition is right.** If detail noise carries nothing, cut it.

### 1.3 Color scripts per site

A restrained master palette (desaturated naturals + practical-light warms) with one signature accent per site. System/UI colors are reserved (§1.6) and never appear in set dressing.

| Site (05) | Base temperature | Signature accent | Feel |
|---|---|---|---|
| 5 Vesper Close | Warm neutrals, magnolia walls | Sodium streetlight amber through windows | The ordinary made wrong |
| Gorse End Farm | Cold stone, oiled wood | Hearth ember orange vs. cellar blue-grey | Canonical Hantu stage: warmth as territory |
| Camp Ashfen | Blue-black night, pine green | Firepit orange + string-light pearls | Islands of light in a dark sea |
| Corbie Hill Secondary | Institutional mint + parquet | Failing fluorescent cyan-white | Liminal-space familiarity |
| Wrenmoor Penitentiary | Iron grey, limewash | Klaxon red (sparingly — near-reserved) | Weight, echo, geometry |
| Bellwether Hall | Bone white gone yellow | Brass bell-board glints, hydro-wing teal | Clinical grandeur, post-launch flagship |

### 1.4 Character design — silhouette first, class accents locked

Specialists render at 24–40 px in play; identity is carried in this order: **silhouette → class accent band → palette → face** (faces live in portraits, §1.7).

- **Class silhouettes** (gameplay data, per 08 §2.5's silhouette lock): Ritualist — long open coat, satchel, asymmetric drape. Warden — bulk at the shoulders, lantern hook, wide stance. Scout — slim, backpack antenna mast, forward lean. Medic — cross-strap harness, kit at the hip, upright carry posture. **Tolerance: cosmetics may alter interior detail and materials freely but must keep the class outline within ±10% of the reference silhouette envelope at gameplay zoom, and may never add or remove the four keystone shapes above.** This sentence is the contract 08 §2.5 enforces.
- **Class accent band** (mandatory on every outfit, fixed placement, ≥8% of visible sprite area): Ritualist **ochre-gold**, Warden **safety orange**, Scout **signal violet**, Medic **bone white**. Accents are chosen to differ in luminance as well as hue and are validated under all three colorblind presets (07 §10.1). Final swatch values ship in the art bible after that validation.
- Costume language is worn workwear: coveralls, hi-vis piping, taped boots, company patches. These are people who own their tools. Nothing tactical-military, nothing occult-chic — the occult is the *job*, the clothes are the *trade*.

### 1.5 Ghost visual language

Owns the render side of 02 §6's readability table. Three presence states:

1. **Unmanifested** (default): the ghost is never rendered. Its presence is environmental — event beats, rings and residue glyphs (07 §6), decals, and a subtle **wrongness pass** in its current room at Dread ≥50 (desaturation −10%, contact shadows deepened). Players who notice the wrongness pass are reading the site like a professional; it is a soft skill-expression channel, never required (the beats carry all hard information).
2. **Manifestation beat**: a 1-beat apparition using the roster's shared spectral materials — **spectral white-green, additive, always animated from the environment inward** (frost gathers into the Hantu; debris orbits into the Poltergeist). Silhouette per 02 §6's table, identifiable at 32 px greyscale.
3. **Hunt form**: full render, higher opacity, per-family locomotion animation (the read-at-a-glance layer: Draugr *walks*, Revenant *drags then lunges*, Wraith *glides through the wall you trusted*). The screen-language during Hunts (edge vignette, desaturation) is 07 §6's; the ghost render must stay the brightest moving value on screen — you never lose the thing that is killing you.

**The spectral palette is reserved for ghosts** (08 §2.5 rule 4): nothing else in the game — cosmetic, UI, or environment — may use additive white-green.

### 1.6 VFX language & the reserved system palette

- **Reserved system palette** (no cosmetic or environment art may use these in their luminance windows, 08 §2.5 rule 3): **alarm crimson** (Hunt state, strikes), **caution amber** (Dread thresholds, warnings), **signal cyan** (selection, paths, LOS previews), **spectral white-green** (ghosts). Class accents (§1.4) deliberately avoid all four.
- **Rite VFX**: chalk-and-ash material language — drawn sigils that light along their strokes as the channel banks turns, reagents rendered as physical props (the brazier glows, the salt line is *salt*). Progress is legible at a glance: each banked Channel turn adds one lit ring segment. Cosmetic Rite themes (08 §2) recolor linework and palette only; the progress segments keep system colors.
- **Backfires** are the loudest frame in the game: a full-room pulse in the true ghost's signature behavior (03 §5.1), art-directed per ghost so the clue lands even in a screenshot.
- **Wards**: Deterrent/Barrier/Refuge (01 §6.4) each own one glyph shape + one animation verb (salt *settles*, iron *plants*, circle *breathes*). A scoured ward's death animation is unmissable — consumed protection is information.
- **Decals** (02 §6's one-per-ghost budget): high-contrast, floor-layer, persistent until walked through. Authored as the site's memory — on mobile the player often reads them two turns late.

### 1.7 Portraits & the Office scene

- **Portraits**: painted busts, warm-lit against cool paper backgrounds — the one place the game gives faces generous light. The cast (04 §3) is working-class, plural, lived-in; direction per specialist persona lines. Rattled and Downed states get portrait variants (03/01 lean on the badge; the portrait sells it).
- **The Office** (06 §1): a single illustrated cross-section diorama — the game's daylight counterweight. Clutter tells the company's story: the corkboard, the mop rack that becomes the Commissary (08 §2), Advisors' desks accreting personal junk. Event vignettes (06 §1.1) are single-illustration scenes with two-line captions, never animated cutscenes.

### 1.8 UI art language — the company paper trail

Menus, Briefing, Journal, Codex, and Debrief wear the **corporate-paranormal print aesthetic**: carbon-copy forms, rubber stamps, laminated checklists, coffee rings, H&V letterhead, a typewriter-plus-ballpoint type stack. The Form fictions (11-R, 12-A, 7-C, 3-E, 9-K, 2-F — 03/06) are *literal UI surfaces*: the Dossier is a scanned form, the Debrief is an itemized invoice being stamped.

Hard boundary (07 owns layout): the **in-contract HUD is clean, modern, and instrument-like** — the paper skin applies to sheets and meta screens only. Dread dials and AP pips are life-safety equipment, not stationery. Print-flavor charm never costs a millisecond of tactical legibility, and all HUD text obeys 07 §4.3's floors.

---

## 2. Audio direction

Partner spec: 07 §6 owns audio-off parity (every sound has a visual twin); 09 §1 commits the Wwise pipeline. This section owns what the game sounds like.

### 2.1 Diegetic-first — the site is the instrument

Bravo Team's score is mostly *performed by the building*. Room tones (each site has a tuned bed: Gorse End's beams, Wrenmoor's echo, Ashfen's reeds and water), practicals (fridge hum, strip-light buzz, rain on windows), and the ghost's interactions are the soundtrack. Music enters only where the fiction allows it (§2.4). Silence is budgeted like a resource: the mix keeps genuine quiet available so that a single floorboard can carry a beat.

**Sound rings are literal**: every ring glyph (07 §6) corresponds to a real spatialized sound event — thickness/loudness, category/timbre match one-to-one. A practiced player can play eyes-on-the-board by ear; a muted player loses nothing (07's certification gate).

### 2.2 Per-ghost audio signatures

Each ghost family owns a **signature timbre** (its interactions and stinger are built from it) and a **haptic pattern** (07 §7). These are Tells in the audio channel — 02 §6's "audio is evidence" rule — and they are deliberately learnable.

| Ghost | Signature timbre |
|---|---|
| Poltergeist | Dry wood knocks, crockery chatter, escalating clatter-rhythms |
| Banshee | Bowed glass over a held vocal keen — always localized on the Marked |
| Wraith | Air-pressure drop, a whisper with no consonants; the *absence* of footsteps |
| Hantu | Ice crack, contracting metal ticks, breath-plume shiver |
| Yurei | Slow water drips, wet cloth, a low hummed lullaby fragment |
| Mare | Filament sing before a bulb dies; felt-muted piano knocks in the dark |
| Revenant | Burlap drag over floorboards; a heartbeat that syncs to its creep, then sprints |
| Jinn | Mains hum swelling, arc-snaps, appliance rattle in passing |
| Shade | Room tone *drop* — its signature is subtraction; a candle-snuff hiss |
| Demon | Sub-harmonic growl, scraped brass, three-knock mockeries of the chant |
| Draugr | Earth-deep footfalls with screen-shake pairing, grave-goods chime, timber strain |
| Dybbuk | Reversed, broken speech fragments near bodies; a wet inhale on possession |

Hunt stingers are one-bar statements of the family timbre; Preludes reuse the stinger at −12 dB and half speed (the site clearing its throat). Backfire signatures (03 §5.1) get bespoke audio moments — the loudest sounds in the game.

### 2.3 Mix targets

- **Phone speaker** (mono, no lows): the information mix. All gameplay-critical audio carries in 300 Hz–8 kHz; stingers double their sub content with a mid-range transient so nothing vital lives below a phone speaker's floor. Loudness-managed to survive a train platform.
- **Headphones**: the horror mix. Full spatialization (ring bearings are audibly true), sub layer active, dynamics opened up. Detected via route change; switchable manually.
- **Calm Horror toggle** (07 §10.4): same information, softer transient peaks, no jump-spikes — mixed as a first-class snapshot, not a post-hoc limiter.
- Wwise state groups mirror the sim's phases (player phase / ghost phase / Prelude / Hunt / Banished) and Dread bands, so the mix is driven by the same events the HUD renders (09 §2.2's SimEvent stream).

### 2.4 Music

- **The Office**: warm, janky lo-fi — detuned upright piano, tape hiss, a radio that plays until you pick up a contract. The comedy register lives here.
- **On site**: no conventional score below Dread 25. From 25: a low pulse layer. From 50: a tension bed (strings played *inside* the piano, bowed metal). From 60 (Hunt-eligible): a barely-audible heart layer that the player learns to dread more than the dial. Hunts: stinger into a per-family ostinato. Banishment: one release chord, then true silence — the only total quiet in the game, held for three seconds before the site's room tone returns *cleansed* (a brighter retuning of the same bed). Extraction plays the game's only melodic theme, small and tired, over the van door closing.
- Layers are additive stems under Wwise RTPC control from the Dread value — the score *is* the Dread dial, which is why it never lies (canon §3 pillar 5).

### 2.5 Voice

Text-first barks (04 §3, 07 §6 caption chips) with a light **non-verbal VO layer**: breaths, efforts, whispered single words ("...cold. cold cold cold—"), per-specialist grunt sets. No full VO at launch — barks localize as text (§4.3), the whisper layer is language-neutral by design, and Dispatch radio lines in FTUE (07 §9) are text-over-static with a processed voice murmur underneath. Full VO is a post-launch quality lever, evaluated per-language.

---

## 3. Narrative & world

### 3.1 Premise, restated as theme

Canon §2 gives the fantasy; the theme underneath is **who gets seen**. Alpha crews are on camera; Bravo is on the clock. The game's world-building consistently honors the unseen professional: every system speaks in invoices, forms, and shift language, and the emotional payoffs are professional ones — a clean Journal, a carried body, a plaque on a breakroom wall.

The player-Supervisor is a **silent professional**: never rendered, never voiced, addressed by role ("Supervisor," "boss," "gaffer" per specialist). The player's expressed personality is their decisions — loadouts, challenges, who they go back for.

### 3.2 Halloway & Veck — company lore and the long arc

**Founded 1974.** Edith **Halloway** (field occultist, believed entities are grief to be resolved) and Aurel **Veck** (loss adjuster, believed entities are liabilities to be abated) incorporated H&V after the event that made both careers: the catastrophic clearance and closure of **Bellwether Hall** in 1974 (05 §2 — the asylum "shut since 1974"; 08's FQ1 ledger title *The Bellwether Account*; the "Founders' Era 1974" and "Original 1974" cosmetics all point at the same buried file).

- **The schism** (long-arc mystery, seasons-scale): Halloway walked out of the company in the '90s over what the Bellwether paperwork calls only *"the disputed abatement."* She is retired, alive, and still reads every file — the **Halloway Memo** pity system (03 §8.4) is her hand in the fiction. Veck is deceased; the Veck family holds the letterhead, personified at launch by **Corin Veck** (04 §7.6), the nephew working his way up from logistics, embarrassed into competence.
- **The surge** (liveops meta-mystery, with 08 §6): contract volume is rising quarter over quarter — H&V's board celebrates the revenue; field crews notice banished sites getting re-listed by a shell buyer, **Marrow Holdings**, that keeps appearing on Form 7-C billing addresses. Season ledger titles (08 §6.1) are chapters of this account-book mystery. Rules for the arc: it seasons the world through documents and vignettes, is never required reading, never gates gameplay, and each quarter's beat must resolve locally even if the arc continues.
- **Canon of restraint**: H&V is not a conspiracy and the player is never betrayed by their own company. The corporate comedy stays warm; the rot, if any, is upstream.

### 3.3 The Alpha crews as recurring characters

The three launch crews (voices and failure fingerprints owned by 03 §1.1) get faces and continuity here:

- **Crew Farrow** — led by **Imogen Farrow**, ex-utilities inspector; the crew that files at 3 a.m. in block capitals. Respected by Bravo, grudgingly. Farrow reports occasionally include a personal sticky note when a Bravo save was clean: highest honor in the fiction.
- **Crew Marlowe** — fronted by **Dash Marlowe** of the *Marlowe After Dark* podcast; charming, brave, calibration of a weather vane. Marlowe's episodes (Office radio snippets) retell contracts the player actually completed, wrong in ways the player will notice — the world's own unreliable narrator.
- **Crew Hale** — the juniors: rotating hires under **Priya Hale**, the only senior who stayed after the last round of Alpha turnover (a quiet lore thread: Alpha crews burn out; Bravo endures). Their hedged, honest reports improve over the game's seasons — the one crew that visibly *learns*.

Named Alpha rescue targets (04 §7.6: Marsh, Brassard, Veck, Nguyen, Quill) belong to these crews' orbits; each Advisor's desk vignettes continue their arc post-rescue (06 §1.1's beats; e.g. Marsh's podcast-poster housewarming).

### 3.4 The specialist cast

Casting and barks for the ten specialists follow 04 §3's persona lines. Writing rules: barks are ≤8 words (they share the caption channel, 07 §6), grounded in trade-speak rather than quips, and each specialist owns 2–3 verbal tics that survive translation (Okafor counts doors; Lis narrates exits; Vance hums the chant off-duty — heard in the Office, a tell that she's nervous about the next job). Rattled barks fragment the character's normal speech pattern, not generic screaming — panic is characterization.

The wake vignette for a perma-death (04 §8, 06 §1.1) is the tonal high-wire: one illustration, the sealed locker, the crew's coffee mugs, one line each in-voice. Comedy fully off. This scene is written per-specialist at launch — ten bespoke wakes — because the game's one irreversible loss deserves non-template writing.

### 3.5 Tone bible — the two registers

1. **On site: procedural dread.** Sentences shorten. Vocabulary is trade-concrete (breaker, soil, chant, door). No irony past the van doors. The ghost is never comic.
2. **At the Office: deadpan clerical.** The comedy is the *form* meeting the *unspeakable* — horror processed through carbon paper. Jokes are structural (the form has a field for this?!), never mocking the folklore or the dead (§4.2).

House style: H&V documents use passive bureaucratic voice; Dispatch uses second-person imperative; specialists use first-person trade shorthand. The word "ghost" appears in dialogue; documents say "entity." Nobody in-fiction says "gameplay words" (Dread, Tell, Rattled are UI vocabulary; characters say "the site's winding up," "what we saw," "she's shook").

### 3.6 Sample texts (v0.1 reference quality bar)

**a) Recon Report excerpt — Form 11-R, Crew Marlowe (Veteran, misID seed):**
> ENTITY (CLAIMED): HANTU — confidence HIGH. Folks, the *second* we cracked the kitchen the temp fell off a cliff, absolutely textbook cold-seeker, chef's kiss. Frost on the pantry door by 0200. Big activity spike before second sweep — punchy for a cold one, but hey, they get moody. Site reads simple. Get the furnace going and it's a one-coffee job. — D.M.

**b) Incident form — Form 2-F (auto-filed at Debrief when a false Tell is revealed):**
> WITNESS: M. Lis (Scout, Shift 2). STATEMENT: Witness reports observing "wet footprints" in the east hall at approx. turn 11. Review of shift telemetry indicates witness Composure at time of observation: 19 (RATTLED). No corroborating instrument log. FINDING: entry reclassified. NOTE FROM PAYROLL: hazard pay unaffected. Get some rest, Lis.

**c) Bark set — Sam Okafor (Warden), excerpt:**
> "Two doors. I like it." · "Door's mine. Go." · "Salt won't hold this one." · "Walk, don't run. It listens." · *(Rattled)* "One door. One. One." · *(Hunt survived)* "Filing that under overtime."

**d) Codex entry — Hantu, level 1 ("Sighted"), excerpt:**
> *From the company Bestiary, revised —* The Malay traditions name many spirits *hantu*; the file borrows the word with respect and no claim of scholarship (see Cultural Notes, App. C). Ours is the cold in the house that arrives like a tenant. Field rule of thumb: warmth is not comfort, it is *terrain* — hold it. — E.H., margin note: *"It isn't angry. It is winter. Winter doesn't negotiate." *

**e) Season teaser — FQ1, *The Bellwether Account* (store/News card, 08 §6.1):**
> In 1974, two clerks with a van closed the worst file this company ever opened. This quarter, the county reopens Bellwether Hall — and H&V is contractually obliged to answer. Bring your paperwork. The building kept its own.

**f) Memo of the day — Contract Board rotation (06 §1.1), two additions:**
> "The van is not 'atmospherically compromised.' The van needs a valet. — Motor Pool" · "Reminder: 'it followed me home' is a Form 11-R addendum, not a personal matter. — Dispatch"

---

## 4. Localization & cultural respect

### 4.1 The folklore covenant

Our roster borrows from living traditions — Hantu (Malay/Indonesian), Jinn (Islamic), Dybbuk (Jewish), Yurei (Japanese), Draugr (Norse), Banshee (Irish), and the rest (02 §4). Binding rules:

1. **Research first, invent second.** Each ghost's folklore paragraph (02) is reviewed by a paid **culture-bearer consultant** from the relevant tradition before content lock; consultants are credited. The Codex's folklore notes carry a standing disclaimer (see sample d) that the game abstracts, borrows, and respects — it does not document.
2. **No sacred-practice mimicry.** Rites are *invented trade rituals* in H&V's house style (salt, soil, candles, paperwork); they deliberately do not reproduce real religious ceremony — the Dybbuk's Exorcism and the Jinn's rite in particular are reviewed for distance from actual Jewish and Islamic practice while keeping the folklore's moral center (host-preservation; smokeless fire).
3. **No ethnic caricature in design**: ghost visual/audio design draws from the *phenomenon* (cold, current, grief), never from ethnic signifiers of the source culture. The Weeper and future roster (02 §7) enter through the same gate.
4. Marketing and liveops copy inherit these rules (08's calendar naming reviewed against religious calendars before scheduling).

### 4.2 Languages & text planning

- **Soft launch: 5 languages** (per 09 §11) — EN, DE, FR, ES-419, PT-BR (aligned with likely pilot markets). **Global launch: 10+** adding JA, KO, ZH-Hant, PL, TR; ID and MS prioritized fast-follow with a dedicated cultural pass (the Hantu is *from* those markets — that localization must be the best one, not an afterthought).
- All strings externalized through the Stockroom string tables (09 §3.3), XLIFF to vendors; the crew-voice templating grammar ships per-language style guides so Marlowe stays florid and Farrow stays terse in every locale.
- **Text expansion planning**: UI reserves +35% over EN (DE/FR headroom); barks and captions hard-cap at their chip widths (07 §6) and are written to length per language, not translated word-for-word. Forms keep their EN form-numbers everywhere (they are proper nouns of the fiction).
- Fonts: a print-flavored UI stack with full Latin/Cyrillic/CJK coverage plans and a fallback chain validated at 07 §4.3's minimum sizes.

---

## Open questions

- **Wrongness-pass strength (§1.5):** the Dread ≥50 room-desaturation is a connoisseur channel; validate on the device farm that it survives OLED crush and eco-mode color at 07 §11's budgets, or gate it to Target-class and above.
- **Full VO scope (§2.5):** post-launch lever — decide per-language after soft launch whether Dispatch and the five named Alphas get full VO, using retention and session-audio telemetry (many players are muted; VO spend may be better put into haptics and stingers).
- **Marlowe podcast episodes (§3.3):** produced audio snippets vs. text-only radio cards at launch — cost/charm tradeoff, decide at vertical slice with 09's audio budget.
- **Ten bespoke wake scenes (§3.4):** confirm writing/illustration budget survives production planning (09 §11); fallback is bespoke text over a shared illustration template — the one place we pre-authorize a scope cut without a pillar fight.
- **Culture-bearer review cadence (§4.1):** per-ghost at content lock vs. a standing quarterly council once liveops adds ghosts (08 §6) — decide before FQ1 planning; budget owner is production.
