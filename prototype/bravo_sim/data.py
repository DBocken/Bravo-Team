"""Data-driven ghost definitions (09-tech-architecture.md: content as data).

Prototype scope: 6 of the 12 launch ghosts — three full confusion pairs
(Hantu<->Demon, Mare<->Jinn, Wraith<->Yurei) from canon §8. Evidence is
modeled as atoms; a ghost is consistent with the Journal iff every Confirmed
atom is in its `possible` set (02-ghost-roster.md Tell matrix, §5).
"""

# Human-readable evidence text per atom.
ATOM_TEXT = {
    "whisper":         "whispering with no source",
    "single_throw":    "a single object thrown",
    "door_op":         "a door moved on its own",
    "opens_window":    "a window thrown open from inside",
    "cools_room":      "the room measurably colder — frost crackle",
    "warm_slow":       "traces cross the warm room slowly (speed follows cold)",
    "fast_cold":       "fast traces through a cold room",
    "frost_prints":    "frost footprints stop at the salt line",
    "temp_flat":       "traces cross the warm room at full speed (cold means nothing to it)",
    "claw_chip":       "a claw chip on a lone specialist — outside any Hunt",
    "salt_scatter":    "the salt line is crossed and scattered, prints straight through",
    "early_hunt":      "Hunt eligibility far below Dread 60",
    "flicker":         "angry light flicker",
    "light_kill":      "a bulb killed outright — switch flipped, breaker untouched",
    "dark_speed_link": "fast traces through darkness, detours around lit rooms",
    "den_doors":       "the same room's doors keep closing",
    "flicker_cascade": "a flicker cascade down the corridor — a surge dash",
    "battery_drain":   "equipment batteries draining at double rate",
    "power_slow":      "with the power cut, the traces have gone sluggish",
    "prints_normal":   "ordinary prints across the salt line",
    "translocation":   "a displacement sigh — it is suddenly somewhere else entirely",
    "salt_pristine":   "it demonstrably crossed the salt line — the salt is pristine",
    "wall_phase":      "a trace that ends at a wall and resumes beyond it",
    "aura_drain":      "composure bleeding with no event on screen",
    "water_sign":      "taps running; water pooling",
    "wet_prints":      "wet bare footprints across the salt line",
    "backfire_hantu":  "BACKFIRE — Hearth-Theft: every flame snuffs; frost blooms across the Anchor room",
    "backfire_demon":  "BACKFIRE — Wrath: one silent beat, then the Hunt comes regardless of Dread",
    "backfire_mare":   "BACKFIRE — Total Dark: the breaker trips and every fixture dies",
    "backfire_jinn":   "BACKFIRE — Surge: the breaker slams ON and every fixture burns over-bright",
    "backfire_wraith": "BACKFIRE — Walkthrough: it exits through the Anchor-room wall; crossed salt undisturbed",
    "backfire_yurei":  "BACKFIRE — Sorrow Wave: site-wide weeping from every direction at once",
}

GHOSTS = {
    "hantu": dict(
        name="Hantu",
        possible=["whisper", "single_throw", "door_op", "opens_window",
                  "cools_room", "warm_slow", "fast_cold", "frost_prints",
                  "backfire_hantu"],
        partner="demon",
        hunt_threshold=60, hunt_duration=3,
        salt_record="frost_prints", crosses_salt=False,
        rite=dict(name="Warming Rite", length=3,
                  reagents={"brazier_coals": 2, "lamp_oil": 1},
                  special="warm"),   # anchor room >= 15 C or channel pauses
    ),
    "demon": dict(
        name="Demon",
        possible=["whisper", "single_throw", "door_op", "flicker", "temp_flat",
                  "claw_chip", "salt_scatter", "early_hunt", "prints_normal",
                  "backfire_demon"],
        partner="hantu",
        hunt_threshold=40, hunt_duration=3,   # DM-1: hunts from Dread 40
        salt_record="salt_scatter", crosses_salt=True,
        rite=dict(name="Naming", length=4,
                  reagents={"ritual_chalk": 1, "consecrated_water": 1,
                            "censer_incense": 1, "name_fragment": 2},
                  special="all_channel"),  # every specialist channels
    ),
    "mare": dict(
        name="Mare",
        possible=["whisper", "single_throw", "door_op", "light_kill",
                  "dark_speed_link", "den_doors", "temp_flat", "prints_normal",
                  "backfire_mare"],
        partner="jinn",
        hunt_threshold=60, hunt_duration=3,
        salt_record="prints_normal", crosses_salt=True,
        rite=dict(name="Illumination Rite", length=3,
                  reagents={"mirror_ward": 1, "lamp_oil": 2},
                  special="lit"),    # anchor room must be lit
    ),
    "jinn": dict(
        name="Jinn",
        possible=["whisper", "single_throw", "door_op", "flicker",
                  "flicker_cascade", "battery_drain", "power_slow",
                  "temp_flat", "prints_normal", "backfire_jinn"],
        partner="mare",
        hunt_threshold=60, hunt_duration=3,
        salt_record="prints_normal", crosses_salt=True,
        rite=dict(name="Smokeless Fire", length=3,
                  reagents={"brazier_coals": 1, "censer_incense": 1},
                  special="dark"),   # breaker off for the whole channel
    ),
    "wraith": dict(
        name="Wraith",
        possible=["whisper", "single_throw", "translocation", "salt_pristine",
                  "wall_phase", "temp_flat", "backfire_wraith"],
        partner="yurei",             # note: no door_op — WR-4 (N)
        hunt_threshold=60, hunt_duration=3,
        salt_record="salt_pristine", crosses_salt=True,
        rite=dict(name="Binding", length=3,
                  reagents={"grave_soil": 4},
                  special=None),     # the soil circle IS the reagent placement
    ),
    "yurei": dict(
        name="Yurei",
        possible=["whisper", "door_op", "water_sign", "aura_drain",
                  "wet_prints", "temp_flat", "backfire_yurei"],
        partner="wraith",            # note: no single_throw — YU-4 (N)
        hunt_threshold=65, hunt_duration=3,
        salt_record="wet_prints", crosses_salt=True,
        rite=dict(name="Sealing", length=3,
                  reagents={"ritual_chalk": 1, "consecrated_water": 1,
                            "votive": 2},
                  special="manifest_t2"),  # she manifests inside the sigil
    ),
}

GHOST_KEYS = list(GHOSTS)

REAGENT_NAMES = {
    "salt": "Salt", "lamp_oil": "Lamp Oil", "brazier_coals": "Brazier Coals",
    "censer_incense": "Censer Incense", "ritual_chalk": "Ritual Chalk",
    "consecrated_water": "Consecrated Water", "mirror_ward": "Mirror Ward",
    "grave_soil": "Grave Soil", "votive": "Votive Candles",
    "cleansing_bundle": "Cleansing Bundle", "name_fragment": "Name-Fragment",
    "lantern": "Lantern",
}

# The van's staples crate (prototype convenience, documented deviation):
# HQ-only reagents so a mid-contract Challenge is never a dead end.
VAN_CRATE = ["ritual_chalk", "consecrated_water", "censer_incense",
             "mirror_ward", "salt", "salt", "cleansing_bundle",
             "cleansing_bundle", "votive", "votive", "lantern"]

DIFFICULTIES = {
    "standard":  dict(misid=0.00, mult=1.0, permadeath=False, blackout=False),
    "veteran":   dict(misid=0.15, mult=1.5, permadeath=False, blackout=False),
    "nightmare": dict(misid=0.35, mult=2.25, permadeath=True, blackout=False),
    "blackout":  dict(misid=0.00, mult=3.0, permadeath=True, blackout=True),
}


def consistent(ghost_key, confirmed_atoms):
    poss = set(GHOSTS[ghost_key]["possible"])
    return all(a in poss for a in confirmed_atoms)


def candidates(confirmed_atoms):
    return [k for k in GHOST_KEYS if consistent(k, confirmed_atoms)]


def discriminates(atom, new_id, old_id):
    """Does this atom support new_id against old_id? (03 §4.2)"""
    return atom in GHOSTS[new_id]["possible"] and atom not in GHOSTS[old_id]["possible"]
