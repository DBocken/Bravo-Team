"""Contract generation and the Recon Report (03-recon-and-misidentification.md).

Authored backwards from ground truth: pick the true ghost, roll misID per
tier, draw the wrong claim only from the confusion pair, then write Form 11-R
log lines that describe the honest overlap — plus the loose thread on Veteran.
"""

import random

from . import data, world


LOG_LINES = {  # in-fiction Activity Log lines encoding true Tells (atom or None)
    "hantu": [
        ("02:12 cold pocket in the lower rooms — thermometer bottomed out", None),
        ("02:31 activity fastest wherever it's coldest", "fast_cold"),
        ("02:44 window in the north room standing open, again", "opens_window"),
        ("03:05 no light interference logged all night", None),
    ],
    "demon": [
        ("01:58 opened up on us hard — earliest activity spike I've logged", None),
        ("02:20 something raked P.'s arm in the study. drew blood", "claw_chip"),
        ("02:36 salt line in the hall crossed like it wasn't there", "salt_scatter"),
        ("02:51 flickers when it's angry. it is often angry", "flicker"),
    ],
    "mare": [
        ("02:02 bulbs popping one by one down the corridor", "light_kill"),
        ("02:19 it will not enter the lit kitchen", "dark_speed_link"),
        ("02:40 bedroom doors keep drifting shut", "den_doors"),
        ("02:55 breaker itself untouched — it's the fixtures", None),
    ],
    "jinn": [
        ("02:07 lights strobing in sequence down the hall — fast mover behind it", "flicker_cascade"),
        ("02:25 both torch packs at half charge already", "battery_drain"),
        ("02:41 killed the generator: site went quiet, activity crawled", "power_slow"),
        ("02:58 not one bulb actually dead. flickers only", None),
    ],
    "wraith": [
        ("02:09 trace pinged in the study, then through the wall into the hall", "wall_phase"),
        ("02:27 it was at the far end of the site one minute later. no path", "translocation"),
        ("02:45 salt across the doorway untouched — and it crossed, we watched", "salt_pristine"),
        ("03:01 never once used a door", None),
    ],
    "yurei": [
        ("02:15 J. came out of the bathroom shaking. nothing on the tape", "aura_drain"),
        ("02:33 taps running again. floor's soaked", "water_sign"),
        ("02:50 all activity inside the same few rooms — it doesn't range", None),
        ("03:07 not a single object thrown all night", None),
    ],
    "poltergeist": [
        ("02:05 three plates airborne AT ONCE. three", "multi_throw"),
        ("02:22 the junk room is a warzone, the tidy rooms are silent", None),
        ("02:39 cutlery drawer buzzing a full minute before it blew", "rattle_precursor"),
        ("02:56 it works the rooms, not us — never came at anyone", None),
    ],
    "banshee": [
        ("02:03 it's fixed on M. — every event lands on her, nobody else", "keening"),
        ("02:24 wail again. only M. doubled over, we felt nothing", "keening"),
        ("02:47 it walked PAST me to get to her", None),
        ("03:02 rest of us might as well be furniture", None),
    ],
    "revenant": [
        ("02:11 slowest trace I've ever logged. one meter a minute, maybe", "slow_creep"),
        ("02:29 D. rounded a corner into its eyeline. it CLOSED, fast", "los_sprint"),
        ("02:48 no prints — a single scored drag-line in the dust", "drag_marks"),
        ("03:04 lights, doors, temperature: all clean. it only wants us", None),
    ],
    "shade": [
        ("02:08 site went dead quiet the moment we grouped up", None),
        ("02:26 K. saw it in the pantry — alone. it was gone when I got there", "lone_manifest"),
        ("02:44 activity keeps drifting to whichever wing we're not in", None),
        ("03:00 quietest hostile I've ever filed. barely an event log", None),
    ],
    "draugr": [
        ("02:06 mudroom door jammed like it was welded. took both of us", "jammed_doors"),
        ("02:23 heavy tread through the floor. shelves trembling", "thud"),
        ("02:41 everything happens inside the same stretch of rooms", None),
        ("02:57 prints in the salt an inch deep. straight through", "deep_prints"),
    ],
    "dybbuk": [
        ("02:09 whispers by the downed crew — half-words, like speech", "whisper_mimicry"),
        ("02:31 I swear the body had MOVED when we came back", None),
        ("02:49 single throws only, soft ones. it's not the objects it wants", None),
        ("03:05 it keeps circling the stretcher room", None),
    ],
}

LOOSE_THREADS = {  # misID: one in-voice line inconsistent with the CLAIM (03 §2.3)
    ("hantu", "demon"): "02:58 opened up on us before second sweep — punchy for a cold one",
    ("demon", "hantu"): "02:58 for all that fury it never once crossed our salt",
    ("mare", "jinn"):   "02:58 funny thing — not one bulb actually died, just flickers",
    ("jinn", "mare"):   "02:58 generator was off an hour and it never slowed down",
    ("wraith", "yurei"): "02:58 salt by the door came up wet. prints, almost",
    ("yurei", "wraith"): "02:58 J. swears it crossed the hallway without touching the wet floor",
    ("revenant", "draugr"): "02:58 never once saw it leave that wing, sprint or no sprint",
    ("draugr", "revenant"): "02:58 odd — it followed D. clear across the site once",
    ("shade", "banshee"): "02:58 quiet, sure, but K. got hit through a full huddle",
    ("banshee", "shade"): "02:58 the 'fixation' went silent every time we bunched up",
    ("poltergeist", "dybbuk"): "02:58 for all the racket, never two objects at once",
    ("dybbuk", "poltergeist"): "02:58 it hurled half the kitchen and ignored the stretcher room",
}


class Contract:
    def __init__(self, seed, difficulty="standard", force_misid=None,
                 force_ghost=None):
        self.seed = seed
        self.difficulty = difficulty
        cfg = data.DIFFICULTIES[difficulty]
        rng = random.Random(f"contract:{seed}")  # str seeds hash stably across processes
        self.true_ghost = force_ghost or rng.choice(data.GHOST_KEYS)
        misid = force_misid if force_misid is not None \
            else rng.random() < cfg["misid"]
        if cfg["blackout"]:
            self.claimed = None
            self.misid = False
        elif misid:
            self.claimed = data.GHOSTS[self.true_ghost]["partner"]
            self.misid = True
        else:
            self.claimed = self.true_ghost
            self.misid = False
        self.anchor = rng.choice(world.ANCHOR_SPOTS[self.true_ghost])
        self.alpha_pos = rng.choice(world.ALPHA_SPOTS)
        self.ghost_start = rng.choice(
            world.ANCHOR_SPOTS[self.true_ghost])  # starts near its anchor
        self.report = self._author(rng, cfg)

    def _author(self, rng, cfg):
        lines = []
        if cfg["blackout"]:
            lines.append("H&V DARK SHEAF — no Form 11-R was ever filed.")
            lines.append("Dispatch memo: crew of 3 deployed / 2 returned. "
                         "One member still on site.")
            frags = rng.sample(LOG_LINES[self.true_ghost], 2)
            for text, _atom in frags:
                lines.append(f'  fragment: "{text}"')
            lines.append("File the ID before Enact — there is no claim to trust.")
            return lines
        claim_name = data.GHOSTS[self.claimed]["name"]
        lines.append(f"H&V FORM 11-R — Claimed Entity: {claim_name.upper()}")
        conf = "High" if not self.misid else rng.choice(["High", "High", "Moderate"])
        lines.append(f"Confidence: {conf}.")
        # Honest lines describe the TRUE ghost's behavior that overlaps the
        # claim — on a correct report they simply describe the ghost.
        pool = [(t, a) for (t, a) in LOG_LINES[self.true_ghost]
                if a is None or a in data.GHOSTS[self.claimed]["possible"]]
        for text, _atom in rng.sample(pool, min(2, len(pool))):
            lines.append(f"  log: {text}")
        if self.misid and self.difficulty == "veteran":
            lines.append(f"  log: {LOOSE_THREADS[(self.claimed, self.true_ghost)]}")
        lines.append(f"Downed Manifest: 1 Alpha member on site, last seen near "
                     f"the {self._alpha_room_hint(rng)}.")
        return lines

    def _alpha_room_hint(self, rng):
        from .world import Site
        room = Site().room(self.alpha_pos) or "site"
        if self.difficulty == "nightmare" and rng.random() < 0.4:
            return room + " (stale)"
        return room
