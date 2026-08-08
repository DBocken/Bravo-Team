"""The deterministic contract simulation — one contract, van door to van door.

Implements 01-core-gameplay.md: player phase / ghost phase rounds, 2 AP
actions, sound & LOS perception, Dread with thresholds and the rising floor,
Hunts with Prelude, Composure with Rattled false Tells, Rites with banking
channels and Backfire-as-clue. Per-ghost overrides per 02-ghost-roster.md.
All tuning values from 01 §12.
"""

import random

from . import data
from .contracts import Contract
from .journal import Journal
from .world import Site, DIRS4, FURNACE_POS, BREAKER_POS, FRAGMENT_TILES


class Specialist:
    def __init__(self, name, cls, pos):
        self.name = name
        self.cls = cls              # Ritualist | Warden | Scout
        self.pos = pos
        self.hp = 14 if cls == "Warden" else 10
        self.max_hp = self.hp
        self.composure = 100
        self.ap = 0
        self.items = []             # 4 slots (prototype: unified inventory)
        self.hidden = False
        self.hide_seen = False      # ghost saw them enter
        self.steadied = False
        self.downed = False
        self.dead = False
        self.carrying = None        # 'alpha' | specialist name
        self.rattled_history = set()  # turns on which they were Rattled

    @property
    def rattled(self):
        return self.composure < 25

    @property
    def initials(self):
        return self.name[:2].upper()

    def mobile(self):
        return not self.downed and not self.dead

    def lose_composure(self, n):
        if self.steadied:
            n = (n + 1) // 2
        self.composure = max(0, self.composure - n)

    def gain_composure(self, n):
        self.composure = min(100, self.composure + n)


class Sim:
    MOVE, SPRINT, CARRY_MOVE = 4, 7, 3
    MAX_ROUNDS = 90

    def __init__(self, seed=1, difficulty="standard", force_misid=None,
                 force_ghost=None):
        self.rng = random.Random(f"sim:{seed}")
        self.contract = Contract(seed, difficulty, force_misid, force_ghost)
        self.cfg = data.DIFFICULTIES[difficulty]
        self.site = Site()
        self.gdef = data.GHOSTS[self.contract.true_ghost]
        self.journal = Journal(self.contract.claimed)
        self.round = 1
        self.dread = 0
        self.dread_floor = 0
        self.hunts_survived = 0
        self.thresholds_fired = set()
        self.log_lines = []
        self.over = False
        self.outcome = None         # 'banished' | 'withdraw' | 'failed' | 'timeout'
        self.banished = False

        # Ghost state
        self.gpos = self.contract.ghost_start
        self.g_interest = None
        self.g_noise_heard = []     # (pos, loudness) this round
        self.hunt = None            # dict(phase, last_seen, quiet_phases) or None
        self.prelude = False
        self.force_hunt = False     # Demon Wrath backfire rider
        self.hosted = False         # Dybbuk: possessing the downed Alpha
        self.quiet_until = 0        # Shade Absence backfire rider
        self.marked = None          # Banshee: name of the Marked specialist

        # Rite state
        self.anchor_found = False   # room known (the hum)
        self.anchor_confirmed = False
        self.placed = {}            # reagent -> count placed at anchor
        self.channel_banked = 0
        self.channel_inflight = []  # specialist names channeling this round
        self.fragments_found = 0

        # Squad
        van = self.site.room_tiles("Van")
        self.squad = [
            Specialist("Vance", "Ritualist", van[0]),
            Specialist("Okafor", "Warden", van[1]),
            Specialist("Lis", "Scout", van[2]),
        ]
        self.alpha = dict(pos=self.contract.alpha_pos, tagged=True,
                          rescued=False, carried_by=None)
        if self.contract.true_ghost == "banshee":
            self.marked = self.rng.choice([s.name for s in self.squad])
        self.property_damage = 0
        self.hum_rooms_visited = set()
        self._load_default_loadout()

    # ------------------------------------------------------------------ util

    def log(self, msg):
        self.log_lines.append(f"[T{self.round:02d}] {msg}")

    def spec(self, name):
        for s in self.squad:
            if s.name.lower().startswith(name.lower()):
                return s
        return None

    def working_rite(self):
        wid = self.journal.working_id
        return data.GHOSTS[wid]["rite"] if wid else None

    def _load_default_loadout(self):
        """Loadout tailored to the claimed ghost (canon §5)."""
        claim = self.contract.claimed or "hantu"
        need = dict(data.GHOSTS[claim]["rite"]["reagents"])
        need.pop("name_fragment", None)
        flat = []
        for r, n in need.items():
            flat += [r] * n
        flat += ["salt", "salt", "lantern", "cleansing_bundle"]
        for i, item in enumerate(flat[:12]):
            self.squad[i % 3].items.append(item)
        for s in self.squad:
            del s.items[4:]

    # ---------------------------------------------------------- perception

    def perceivers_of(self, pos, noise, visible=True):
        """Who saw or heard an event? Scout passively reads events <= 8 tiles
        (class signature: 'reveals Tells faster', canon §9)."""
        out = []
        heard_map = self.site.loudness_at(pos, noise) if noise > 0 else {}
        for s in self.squad:
            if not s.mobile():
                continue
            if visible and not s.hidden and self.site.los(s.pos, pos) \
                    and self.site.chebyshev(s.pos, pos) <= 11:
                out.append((s, "saw"))
            elif s.pos in heard_map:
                out.append((s, "heard"))
            elif s.cls == "Scout" and self.site.chebyshev(s.pos, pos) <= 8:
                out.append((s, "read"))
        return out

    def emit(self, pos, noise, text, atoms=(), visible=True, sitewide=False):
        """A ghost beat. Perceived beats log Tells; Rattled observers may log
        them FALSE (01 §7.3 White-knuckle, 50%)."""
        if sitewide:
            pv = [(s, "felt") for s in self.squad if s.mobile()]
        else:
            pv = self.perceivers_of(pos, noise, visible)
        if not pv:
            return
        room = self.site.room(pos) or "somewhere"
        self.log(f"~ {text} ({room})")
        for s, _how in pv:
            s.lose_composure(3)     # ghost interaction perceived: -3
        if not atoms:
            return
        observer = pv[0][0]
        for atom in atoms:
            hidden_false = False
            if observer.rattled and self.rng.random() < 0.5:
                # White-knuckle: recorded wrong — swapped for an atom that
                # fits the CLAIM (panic confirms the report).
                claim = self.journal.working_id or self.contract.true_ghost
                pool = [a for a in data.GHOSTS[claim]["possible"]
                        if not a.startswith("backfire")]
                atom = self.rng.choice(pool)
                hidden_false = True
                observer.rattled_history.add(self.round)
            self.journal.log(self.round, observer.initials, atom,
                             hidden_false=hidden_false)

    # ------------------------------------------------------- player actions
    # Each returns (ok: bool, msg: str). AP is checked and spent here.

    def _spend(self, s, ap):
        if s.ap < ap:
            return False
        s.ap -= ap
        return True

    def _make_noise(self, pos, noise):
        if noise >= 3:
            self.g_noise_heard.append((pos, noise))

    def act_move(self, s, dest, sprint=False):
        if not s.mobile() or s.hidden:
            return False, "cannot move"
        limit = self.SPRINT if sprint else \
            (self.CARRY_MOVE if s.carrying else self.MOVE)
        if s.carrying and sprint:
            return False, "cannot sprint while carrying"
        if s.cls == "Scout" and not sprint and not s.carrying:
            limit = 5
        blocked = [o.pos for o in self.squad if o is not s and o.mobile()]
        path = self.site.path(s.pos, dest, blocked=blocked)
        if path is None or len(path) > limit:
            return False, "out of range or blocked"
        if not self._spend(s, 2 if sprint else 1):
            return False, "no AP"
        s.pos = dest
        s.steadied = False
        noise = 4 if sprint else 1
        self._make_noise(dest, noise)
        if sprint:
            self.dread_add(1, "sprint")
        if s.carrying == "alpha":
            self.alpha["pos"] = dest
        self._on_enter(s)
        return True, f"{s.name} {'sprints' if sprint else 'moves'} to {dest}"

    def _on_enter(self, s):
        room = self.site.room(s.pos)
        # The hum: entering the Anchor room (01 §8.2).
        if room and room == self.site.room(self.contract.anchor) \
                and room not in self.hum_rooms_visited:
            self.hum_rooms_visited.add(room)
            self.anchor_found = True
            self.anchor_room = room
            s.lose_composure(2)
            self.log(f"* {s.name} feels it: resonance in the {room}. "
                     f"(Anchor room found)")

    def act_door(self, s, pos):
        if self.site.kind.get(pos) != "door" or self.site.chebyshev(s.pos, pos) > 1:
            return False, "no adjacent door"
        if pos in self.site.jammed_doors:
            if not self._spend(s, 2):
                return False, "jammed door needs 2 AP"
            self.site.jammed_doors.discard(pos)
        self.site.door_open[pos] = not self.site.door_open[pos]
        self._make_noise(pos, 1)
        return True, f"door {'opened' if self.site.door_open[pos] else 'closed'}"

    def act_interact(self, s, what, pos=None):
        """what: 'furnace'|'breaker'|'light'|'search'|'tag'|'inspect'|'salt_check'|'crate'"""
        if not s.mobile() or s.hidden:
            return False, "cannot act"
        p = pos or s.pos
        if self.site.chebyshev(s.pos, p) > 1:
            return False, "not adjacent"
        if not self._spend(s, 1):
            return False, "no AP"
        self._make_noise(p, 2)
        if what == "furnace":
            if self.site.chebyshev(s.pos, FURNACE_POS) > 1:
                s.ap += 1
                return False, "not at the furnace"
            self.site.furnace_on = not self.site.furnace_on
            self.dread_add(2, "utility ignition")
            return True, f"furnace {'lit' if self.site.furnace_on else 'killed'}"
        if what == "breaker":
            if self.site.chebyshev(s.pos, BREAKER_POS) > 1:
                s.ap += 1
                return False, "not at the breaker"
            if self.round < self.site.breaker_locked_until:
                return True, "the breaker is locked by the surge — it won't move"
            self.site.breaker_on = not self.site.breaker_on
            self.dread_add(2, "breaker")
            return True, f"breaker {'on' if self.site.breaker_on else 'off'}"
        if what == "light":
            room = self.site.room(s.pos)
            if room not in self.site.fixture_on:
                return True, "no fixture here"
            self.site.fixture_on[room] = not self.site.fixture_on[room]
            if self.site.fixture_on[room]:
                self.dread_add(1, "light on")
            return True, f"{room} light {'on' if self.site.fixture_on[room] else 'off'}"
        if what == "search":
            yields = self.site.search_left.get(p)
            if not yields:
                return True, "nothing more here"
            item = yields.pop(0)
            if self.contract.true_ghost == "demon" and p in FRAGMENT_TILES \
                    and self.fragments_found < 2:
                item = "name_fragment"
                self.fragments_found += 1
            if item == "name_fragment":
                self.fragments_found = max(self.fragments_found, 1)
                self.log(f"* {s.name} finds a name-fragment "
                         f"({self.fragments_found}/2).")
            if len(s.items) < 4:
                s.items.append(item)
                return True, f"found {data.REAGENT_NAMES[item]}"
            return True, f"found {data.REAGENT_NAMES[item]} but hands are full"
        if what == "tag":
            return True, "no tagging needed — walk up and shoulder them"
        if what == "inspect":
            if p == self.contract.anchor:
                self.anchor_confirmed = True
                return True, "ANCHOR CONFIRMED — this is the tether"
            return True, "nothing — this object is inert"
        if what == "salt_check":
            line = self.site.salt_lines.get(p)
            if not line:
                return True, "no salt line here"
            if line["record"]:
                self.journal.log(self.round, "SALT LINE", line["record"],
                                 instrument=True)
                self.log(f"* the salt line testifies: "
                         f"{data.ATOM_TEXT[line['record']]}")
                line["record"] = None
                return True, "salt line read logged (Confirmed)"
            return True, f"salt line {line['state']}, nothing new"
        if what == "crate":
            if self.site.room(s.pos) != "Van":
                return True, "the crate is in the van"
            if not self.site.search_left.get("crate"):
                self.site.search_left["crate"] = list(data.VAN_CRATE)
            crate = self.site.search_left["crate"]
            if crate and len(s.items) < 4:
                item = crate.pop(0)
                s.items.append(item)
                return True, f"took {data.REAGENT_NAMES[item]} from the crate"
            return True, "crate exhausted or hands full"
        s.ap += 1
        return False, f"unknown interaction {what}"

    def take_from_crate(self, s, item):
        """Targeted crate pull (1 AP)."""
        if self.site.room(s.pos) != "Van" or len(s.items) >= 4:
            return False, "must be at the van with a free slot"
        if not self._spend(s, 1):
            return False, "no AP"
        crate = self.site.search_left.setdefault("crate", list(data.VAN_CRATE))
        if item in crate:
            crate.remove(item)
            s.items.append(item)
            return True, f"took {data.REAGENT_NAMES[item]}"
        s.ap += 1
        return False, f"no {item} left in the crate"

    def act_drop(self, s, item):
        """Dropping is free (01 §2); the item lies on the floor, recoverable."""
        if item in s.items:
            s.items.remove(item)
            self.site.floor_items.setdefault(s.pos, []).append(item)
            return True, f"{s.name} drops {data.REAGENT_NAMES[item]}"
        return False, "not carried"

    def act_pickup(self, s, pos, item=None):
        """Recover a dropped item from an adjacent tile (1 AP)."""
        if self.site.chebyshev(s.pos, pos) > 1 or len(s.items) >= 4:
            return False, "not adjacent or hands full"
        stack = self.site.floor_items.get(pos, [])
        if not stack:
            return False, "nothing there"
        if item is None:
            item = stack[0]
        if item not in stack:
            return False, "not there"
        if not self._spend(s, 1):
            return False, "no AP"
        stack.remove(item)
        s.items.append(item)
        self._make_noise(pos, 2)
        return True, f"{s.name} recovers {data.REAGENT_NAMES[item]}"

    def act_place(self, s, item):
        """Place a reagent at/adjacent to own tile. At the anchor it counts as
        Rite setup; salt anywhere makes a salt line; a lantern lights r=2."""
        if item not in s.items or not self._spend(s, 1):
            return False, "not carried or no AP"
        s.items.remove(item)
        self._make_noise(s.pos, 1)
        rite = self.working_rite()
        # Rite-reagent placement takes precedence at the confirmed Anchor
        # (the Stillness Rite anchors objects with salt — 02, Poltergeist).
        if rite and self.anchor_confirmed \
                and self.site.chebyshev(s.pos, self.contract.anchor) <= 1 \
                and item in rite["reagents"] \
                and self.placed.get(item, 0) < rite["reagents"][item]:
            self.placed[item] = self.placed.get(item, 0) + 1
            return True, f"{data.REAGENT_NAMES[item]} placed at the Anchor"
        if item == "salt":
            self.site.salt_lines[s.pos] = {"state": "intact", "record": None}
            return True, f"salt line laid at {s.pos}"
        if item == "lantern":
            self.site.lanterns.append(s.pos)
            return True, "lantern lit"
        if item == "cleansing_bundle":
            before = self.dread
            self.dread = max(self.dread_floor, self.dread - 10)
            return True, f"cleansing bundle burned: Dread {before}->{self.dread}"
        if self.anchor_confirmed and \
                self.site.chebyshev(s.pos, self.contract.anchor) <= 1:
            self.placed[item] = self.placed.get(item, 0) + 1
            return True, f"{data.REAGENT_NAMES[item]} placed at the Anchor"
        s.items.append(item)
        s.ap += 1
        return False, "reagents place at the confirmed Anchor (salt/lantern/bundle anywhere)"

    def rite_ready(self):
        rite = self.working_rite()
        if not rite or not self.anchor_confirmed:
            return False, "no working ID or Anchor unconfirmed"
        need = dict(rite["reagents"])
        frags = need.pop("name_fragment", 0)
        if frags and self.fragments_found < frags:
            return False, f"name-fragments {self.fragments_found}/{frags}"
        for r, n in need.items():
            if self.placed.get(r, 0) < n:
                return False, f"missing {data.REAGENT_NAMES[r]} " \
                              f"{self.placed.get(r, 0)}/{n}"
        return True, "ready"

    def _special_ok(self, rite):
        room = self.site.room(self.contract.anchor)
        sp = rite["special"]
        if sp == "warm":
            return self.site.temp.get(room, 0) >= 15, "the Anchor room is too cold"
        if sp == "lit":
            lit = self.site.light_level(self.contract.anchor, self.round) == "lit"
            return lit, "the Anchor room is not lit"
        if sp == "dark":
            return not self.site.breaker_on, "site power must be off"
        if sp == "marked_near":
            m = self.spec(self.marked) if self.marked else None
            ok = m is not None and m.mobile() and \
                self.site.chebyshev(m.pos, self.contract.anchor) <= 2
            # On a wrong-ID Sever there is no Mark; the rite proceeds — the
            # Backfire is the teacher.
            return (ok or self.contract.true_ghost != "banshee"), \
                "the Marked must stand within 2 tiles of the effigy"
        if sp == "lone":
            near = [s for s in self.squad if s.mobile()
                    and self.site.chebyshev(s.pos, self.contract.anchor) <= 6]
            return len(near) == 1, "exactly one specialist may keep the vigil"
        return True, ""

    def act_channel(self, s):
        rite = self.working_rite()
        ok, why = self.rite_ready()
        if not ok:
            return False, why
        if self.site.chebyshev(s.pos, self.contract.anchor) > 1:
            return False, "must be within 1 tile of the Anchor"
        if not self._spend(s, 2):
            return False, "channel takes the whole turn (2 AP)"
        sok, swhy = self._special_ok(rite)
        if not sok:
            s.ap += 2
            return False, swhy
        if not self.channel_inflight:
            self.dread_add(4, "channel")   # +4 per Channel TURN, not per chanter
        self.channel_inflight.append(s.name)
        self._make_noise(s.pos, 3)
        return True, f"{s.name} channels — the chant holds ({self.channel_banked}" \
                     f"/{self._rite_length(rite)} banked)"

    def _rite_length(self, rite):
        n = rite["length"]
        if any(x.name == "Vance" and x.mobile() for x in self.squad) \
                and rite["special"] != "all_channel":
            pass  # Ritualist bonus applies only if Vance channels; checked at bank
        return n

    def act_hide(self, s):
        spot = None
        for dx, dy in [(0, 0)] + DIRS4:
            p = (s.pos[0] + dx, s.pos[1] + dy)
            if self.site.furn.get(p) == "hide" and \
                    not any(o.hidden and o.pos == p for o in self.squad):
                spot = p
                break
        if not spot:
            return False, "no free hiding spot adjacent"
        if s.carrying:
            return False, "cannot hide while carrying"
        if not self._spend(s, 1):
            return False, "no AP"
        s.pos = spot
        s.hidden = True
        s.hide_seen = self.hunt is not None and \
            self.site.los(self.gpos, spot) and \
            self.site.chebyshev(self.gpos, spot) <= 6
        return True, f"{s.name} hides"

    def act_unhide(self, s):
        if not s.hidden:
            return False, "not hidden"
        if not self._spend(s, 1):
            return False, "no AP"
        s.hidden = False
        s.hide_seen = False
        return True, f"{s.name} slips out"

    def act_steady(self, s):
        if not self._spend(s, 1):
            return False, "no AP"
        s.steadied = True
        return True, f"{s.name} steadies"

    def act_lift(self, s):
        if s.carrying:
            return False, "already carrying"
        if not self.alpha["rescued"] and not self.hosted and \
                self.alpha["carried_by"] is None and \
                self.site.chebyshev(s.pos, self.alpha["pos"]) <= 1:
            if not self._spend(s, 1):
                return False, "no AP"
            s.carrying = "alpha"
            self.alpha["carried_by"] = s.name
            self.alpha["pos"] = s.pos
            self._make_noise(s.pos, 2)
            return True, f"{s.name} shoulders the Alpha"
        for o in self.squad:
            if o.downed and not o.dead and \
                    self.site.chebyshev(s.pos, o.pos) <= 1 and o.carrying is None:
                if not self._spend(s, 1):
                    return False, "no AP"
                s.carrying = o.name
                return True, f"{s.name} lifts {o.name}"
        return False, "no body adjacent"

    def act_lower(self, s):
        if not s.carrying:
            return False, "carrying nothing"
        if s.carrying == "alpha":
            self.alpha["carried_by"] = None
            self.alpha["pos"] = s.pos
            if self.site.room(s.pos) == "Van":
                self.alpha["rescued"] = True
                self.log("* the Alpha is lowered into the van. Rescued.")
        else:
            o = self.spec(s.carrying)
            o.pos = s.pos
        s.carrying = None
        return True, f"{s.name} lowers the body"

    def act_challenge(self, new_id):
        if new_id not in data.GHOSTS:
            return False, "unknown ghost"
        old = self.journal.working_id
        if new_id == old:
            return False, "that is already the working ID"
        fee, verified = self.journal.challenge(self.round, new_id)
        name = data.GHOSTS[new_id]["name"]
        if verified:
            for s in self.squad:
                s.gain_composure(10)
            self.log(f"* FORM 12-A SIGNED: working ID is now {name}. "
                     f"VERIFIED — the crew rallies (+10 Composure).")
        else:
            self.log(f"* FORM 12-A SIGNED: working ID is now {name} "
                     f"(unverified hunch).")
        self.verified_challenge = verified and new_id == self.contract.true_ghost
        return True, f"challenged to {name}" + (f" (re-file fee {fee})" if fee else "")

    # --------------------------------------------------------------- dread

    def dread_add(self, n, _why=""):
        self.dread = min(100, self.dread + n)

    def _threshold_events(self):
        for th in (25, 50, 75):
            if self.dread >= th and th not in self.thresholds_fired:
                self.thresholds_fired.add(th)
                self._fire_threshold(th)

    def _fire_threshold(self, th):
        mobile = [s for s in self.squad if s.mobile()]
        if not mobile:
            return
        if th == 25:
            self.log("! DREAD 25 — Unrest: a door slams somewhere unseen.")
            self._make_noise(self.gpos, 3)
        elif th == 50:
            low = min(mobile, key=lambda s: s.composure)
            low.lose_composure(8)
            self.log(f"! DREAD 50 — Malice: a door slams beside {low.name} "
                     f"(-8 Composure).")
        else:
            for s in mobile:
                s.lose_composure(5)
            self.log("! DREAD 75 — Fury: sitewide flicker (-5 Composure all).")

    # ----------------------------------------------------------- the phases

    def start_player_phase(self):
        """Bank channels, roll Rattled, refresh AP."""
        self._bank_channel()
        for s in self.squad:
            s.ap = 2 if s.mobile() else 0
            if s.mobile() and s.rattled:
                s.rattled_history.add(self.round)
                roll = self.rng.randint(1, 4)
                if roll == 1:
                    s.ap -= 1
                    self.log(f"! {s.name} is Rattled — FREEZE (loses 1 AP).")
                elif roll == 2 and not s.steadied:
                    self._bolt(s)
                elif roll == 3 and s.items:
                    drop = s.items.pop(self.rng.randrange(len(s.items)))
                    self.site.floor_items.setdefault(s.pos, []).append(drop)
                    self.log(f"! {s.name} is Rattled — FUMBLE, drops "
                             f"{data.REAGENT_NAMES[drop]}.")
                    self._make_noise(s.pos, 2)
                else:
                    self.log(f"! {s.name} is Rattled — white-knuckled. "
                             f"Their reads may be wrong.")
            s.steadied = False

    def _bolt(self, s):
        away = self.site.path(s.pos, (11, 14), for_ghost=False)  # toward the van
        if away:
            s.pos = away[min(3, len(away) - 1)]
        self.log(f"! {s.name} is Rattled — BOLT.")
        self.channel_interrupted_names = getattr(self, "channel_interrupted_names", set())
        self.channel_interrupted_names.add(s.name)

    def _bank_channel(self):
        rite = self.working_rite()
        if not self.channel_inflight or not rite:
            self.channel_inflight = []
            return
        interrupted = getattr(self, "channel_interrupted_names", set())
        chans = [n for n in self.channel_inflight if n not in interrupted]
        self.channel_interrupted_names = set()
        need_all = rite["special"] == "all_channel"
        mobile = [s.name for s in self.squad if s.mobile()]
        ok = bool(chans) and (not need_all or set(mobile) <= set(chans))
        self.channel_inflight = []
        if not ok:
            self.log("* the chant was broken — the in-flight turn is lost.")
            return
        self.channel_banked += 1
        length = rite["length"]
        if "Vance" in chans and rite["special"] != "all_channel":
            length = max(2, length - 1)   # Ritualist signature: enacts faster
        if rite["special"] == "manifest_t2" and self.channel_banked == 2:
            for n in chans:
                self.spec(n).lose_composure(8)
            self.log("~ she manifests inside the sigil, bowed and silent. "
                     "(-8 Composure, channelers)")
        self.log(f"* channel banks: {self.channel_banked}/{length}.")
        if self.channel_banked >= length:
            self._complete_rite()

    def _complete_rite(self):
        wid = self.journal.working_id
        if wid == self.contract.true_ghost:
            self.banished = True
            self.hunt = None
            self.prelude = False
            if self.hosted:          # Exorcism: the host survives (02, Dybbuk)
                self.hosted = False
                self.alpha["pos"] = self.gpos
                self.log("* the Alpha collapses, breathing — the Dybbuk is "
                         "driven out of its host.")
            self.log(f"* BANISHMENT. The {data.GHOSTS[wid]['name']} is dragged "
                     f"manifest to the Anchor and comes apart. The site goes quiet.")
        else:
            self._backfire()

    def _backfire(self):
        true = self.contract.true_ghost
        self.dread_add(15, "backfire")
        for s in self.squad:
            if s.mobile():
                s.lose_composure(15)
        self.placed = {}
        self.channel_banked = 0
        atom = f"backfire_{true}"
        self.journal.log(self.round, "BACKFIRE", atom, instrument=True)
        self.log(f"! {data.ATOM_TEXT[atom]}")
        # Signature riders (03 §5.1)
        site = self.site
        if true == "demon":
            self.force_hunt = True
        elif true == "hantu":
            room = site.room(self.contract.anchor)
            site.temp[room] = 2
        elif true == "jinn":
            site.breaker_on = True
            site.breaker_locked_until = self.round + 2
        elif true == "mare":
            site.breaker_on = False
            for r in list(site.fixture_on):
                site.fixture_dead_until[r] = self.round + 3
        elif true == "yurei":
            for s in self.squad:
                if s.mobile():
                    s.lose_composure(10)
        elif true == "poltergeist":
            room = site.room(self.contract.anchor)
            for s in self.squad:
                if s.mobile() and site.room(s.pos) == room:
                    s.hp -= 1        # Clutterstorm: 1 HP to all in the room
        elif true == "banshee":
            mobile = [s.name for s in self.squad if s.mobile()]
            if mobile:
                self.marked = self.rng.choice(mobile)
        elif true == "revenant":
            low = min((s for s in self.squad if s.mobile()),
                      key=lambda s: s.composure, default=None)
            if low:
                low.lose_composure(10)
        elif true == "shade":
            self.quiet_until = self.round + 3
        elif true == "draugr":
            for p, k in site.kind.items():
                if k == "door":
                    site.door_open[p] = False
                    site.jammed_doors.add(p)
        elif true == "dybbuk":
            if not self.hosted and not self.alpha["rescued"] \
                    and self.alpha["carried_by"] is None:
                self.hosted = True
                self.gpos = self.alpha["pos"]
        # Immediate Hunt check at +25 (01 §8.3), Prelude still guaranteed.
        if self._hunt_check(bonus=25):
            self.prelude = True

    # ------------------------------------------------------------ ghost turn

    def ghost_phase(self):
        if self.over or self.banished:
            return
        if self.prelude:
            self.prelude = False
            self.hunt = dict(phase=0, last_seen=None, quiet=0,
                             duration=self.gdef["hunt_duration"]
                             + (1 if self.dread >= 80 else 0))
            for s in self.squad:
                if s.mobile():
                    s.lose_composure(5)
            self.log("!! PRELUDE — sitewide flicker, a low rumble. The Hunt "
                     "begins next phase. (-5 Composure all)")
        elif self.hunt:
            self._hunt_phase()
        else:
            self._calm_phase()
        # Dread tick and checks (01 §1 flow)
        hantu = self.contract.true_ghost == "hantu"
        self.site.tick_temperature(self.site.room(self.gpos), hantu)
        self.dread_add(2, "baseline")
        self._threshold_events()
        self._composure_environment()
        if not self.hunt and not self.prelude and not self.banished:
            if self.force_hunt:
                self.force_hunt = False
                self.prelude = True
                self.log("!! The Wrath answers — a Hunt regardless of Dread.")
            elif self._hunt_check():
                self.prelude = True
        self.g_noise_heard = []

    def _composure_environment(self):
        for s in self.squad:
            if not s.mobile() or self.site.room(s.pos) == "Van":
                continue
            if self.site.light_level(s.pos, self.round) == "dark":
                s.lose_composure(2)
            # Yurei aura (YU-1): passive drain, logged as a Tell.
            if self.contract.true_ghost == "yurei" and \
                    self.site.chebyshev(s.pos, self.gpos) <= 4:
                s.lose_composure(6)
                if self.rng.random() < 0.6:
                    self.journal.log(self.round, s.initials, "aura_drain",
                                     hidden_false=False)
                    self.log(f"~ {s.name} shivers: composure bleeding with "
                             f"no event on screen.")
        # Regroup: adjacent ally on lit/dim tile, +3 (01 §7.2)
        for s in self.squad:
            if not s.mobile() or s.hidden:
                continue
            near = any(o is not s and o.mobile()
                       and self.site.chebyshev(s.pos, o.pos) <= 1
                       for o in self.squad)
            if near and self.site.light_level(s.pos, self.round) != "dark":
                s.gain_composure(3)

    def _hunt_check(self, bonus=0):
        g = self.contract.true_ghost
        if g == "demon":
            threshold, sub, rolls = 40, 30, 2   # DM-1: doubled rolls
        else:
            threshold, sub, rolls = self.gdef["hunt_threshold"], 50, 1
        if g == "dybbuk" and not self.hosted:
            return False                        # DY-4: never hunts unhosted
        if g == "shade" and not self._isolated_specialists():
            return False                        # SH-4: needs an isolated mark
        if g == "banshee":
            m = self.spec(self.marked) if self.marked else None
            if not (m and m.mobile()):          # BN: re-Mark, no hunt this phase
                mobile = [s.name for s in self.squad if s.mobile()]
                if mobile:
                    self.marked = self.rng.choice(mobile)
                return False
        if self.dread < threshold:
            return False
        target = self.dread - sub + bonus
        for _ in range(rolls):
            roll = self.rng.randint(1, 100)
            if roll <= target:
                self.log(f"!! HUNT CHECK at Dread {self.dread}: d100={roll} "
                         f"<= {target} — passed.")
                if self.dread < 60:
                    self.journal.log(self.round, "THE DIAL", "early_hunt",
                                     instrument=True)
                    self.log("* the dial should not be live yet. "
                             "(early hunt logged, Confirmed)")
                return True
        return False

    # Ghost movement helpers ------------------------------------------------

    def _ghost_speed(self):
        g = self.contract.true_ghost
        site = self.site
        if g == "hantu":
            t = site.temp.get(site.room(self.gpos) or "Hall", 13)
            return 5 if t <= 8 else (2 if t >= 20 else 3)
        if g == "mare":
            return 2 if site.light_level(self.gpos, self.round) == "lit" else 4
        if g == "jinn":
            return 4 if site.breaker_on else 2
        if g in ("yurei", "shade"):
            return 2
        return 3

    def _ghost_hunt_speed(self):
        g = self.contract.true_ghost
        site = self.site
        if g == "hantu":
            t = site.temp.get(site.room(self.gpos) or "Hall", 13)
            return 6 if t <= 8 else (3 if t >= 20 else 4)
        if g == "mare":
            return 3 if site.light_level(self.gpos, self.round) == "lit" else 5
        if g == "jinn":
            return 6 if site.breaker_on else 3
        if g == "demon":
            return 5
        if g == "revenant":
            return 6                 # RV-2: LOS is its only accelerant
        if g in ("yurei", "shade", "draugr"):
            return 3                 # DG-1: it NEVER accelerates
        return 4

    def _ghost_move_toward(self, target, tiles):
        through_walls = self.contract.true_ghost == "wraith"
        path = self.site.path(self.gpos, target, for_ghost=True,
                              through_walls=through_walls)
        if not path:
            return []
        moved = []
        budget = tiles
        for step in path:
            if budget <= 0:
                break
            # Deterrent (01 §6.4): outside Hunts, a salt-respecting ghost
            # stops at an intact line — and the Hantu leaves frost prints
            # at the edge (02, confusion pair separator).
            line = self.site.salt_lines.get(step)
            if line and line["state"] == "intact" \
                    and not self.gdef["crosses_salt"] and not self.hunt:
                line["record"] = self.gdef["salt_record"]
                break
            cost = 1
            k = self.site.kind.get(step)
            if k == "door" and not self.site.door_open[step]:
                door_atoms = ["door_op"] \
                    if "door_op" in self.gdef["possible"] else []
                if through_walls:
                    pass
                elif self.hunt:
                    cost = 2       # closed door costs the ghost 1 extra tile
                    self.site.door_open[step] = True
                    self.emit(step, 1, "a door swings open on its own",
                              atoms=door_atoms)
                else:
                    self.site.door_open[step] = True
                    self.emit(step, 1, "a door swings open on its own",
                              atoms=door_atoms)
            if self.site.light_level(step, self.round) == "lit" \
                    and self.contract.true_ghost == "mare" and self.hunt:
                cost += 1          # Mare: entering a lit tile costs extra
            if budget < cost:
                break
            budget -= cost
            self.gpos = step
            if self.hosted:
                self.alpha["pos"] = step   # the host walks
            moved.append(step)
            self._cross_salt(step)
        return moved

    def _cross_salt(self, p):
        line = self.site.salt_lines.get(p)
        if not line or line["state"] != "intact":
            return
        g = self.gdef
        if self.hunt:
            line["state"] = "scoured"
            line["record"] = None
            self.log("~ the salt line is scoured in the rush.")
            return
        line["record"] = g["salt_record"]
        if g["salt_record"] == "salt_scatter":
            line["state"] = "scoured"

    # Calm behavior ---------------------------------------------------------

    def _calm_phase(self):
        g = self.contract.true_ghost
        if self.round < self.quiet_until:
            return                   # Shade Absence: dead silence, Dread climbs
        # Revenant: two-state stalker — 1-tile creep, 6-tile sprint on sight.
        if g == "revenant":
            self._revenant_calm()
            return
        # Interest: noise >= 3 -> seen specialist -> anchor drift (01 §3)
        target = None
        if self.g_noise_heard:
            loud = max(self.g_noise_heard, key=lambda t: t[1])
            if self.gpos in self.site.loudness_at(loud[0], loud[1] + 6):
                target = loud[0]   # ghost hearing, generously ranged
        if target is None:
            seen = [s for s in self.squad if s.mobile() and not s.hidden
                    and self.site.chebyshev(self.gpos, s.pos) <= 6
                    and self.site.los(self.gpos, s.pos)]
            if seen:
                target = seen[0].pos
        if target is None:
            target = self.contract.anchor
        # Per-ghost interest overrides.
        if g == "banshee" and self.marked:
            m = self.spec(self.marked)
            if m and m.mobile():
                target = m.pos       # BN-1: she attends a person, not a place
        if g == "dybbuk" and not self.hosted and not self.alpha["rescued"] \
                and self.alpha["carried_by"] is None:
            target = self.alpha["pos"]   # DY-1: it drifts to the bodies
        # Tethers: Yurei 6 (YU-3), Draugr 8 (DG-4).
        tether = {"yurei": 6, "draugr": 8}.get(g)
        if tether and self.site.chebyshev(target, self.contract.anchor) > tether:
            target = self.contract.anchor
        prev = self.gpos
        moved = self._ghost_move_toward(target, self._ghost_speed())
        self._movement_evidence(prev, moved)
        # Dybbuk possession: reaching the body, it takes it (DY-2).
        if g == "dybbuk" and not self.hosted and not self.alpha["rescued"] \
                and self.alpha["carried_by"] is None \
                and self.site.chebyshev(self.gpos, self.alpha["pos"]) <= 1:
            self.hosted = True
            self.gpos = self.alpha["pos"]
            self.emit(self.gpos, 4, "the downed Alpha convulses, stands, "
                      "and walks", atoms=["possession"])
            return
        if g == "shade" and self._squad_grouped_near():
            return                   # SH-1: company silences it
        budget = 2 if self.dread >= 25 else 1
        for _ in range(budget):
            self._interaction()

    def _squad_grouped_near(self):
        """SH-1: 2+ mobile specialists within 6 of the Shade and each other."""
        near = [s for s in self.squad if s.mobile()
                and self.site.chebyshev(s.pos, self.gpos) <= 6]
        return len(near) >= 2 and any(
            self.site.chebyshev(a.pos, b.pos) <= 6
            for a in near for b in near if a is not b)

    def _revenant_calm(self):
        prev = self.gpos
        seen = [s for s in self.squad if s.mobile() and not s.hidden
                and self.site.chebyshev(self.gpos, s.pos) <= 8
                and self.site.los(self.gpos, s.pos)]
        if seen:
            t = min(seen, key=lambda s: self.site.chebyshev(self.gpos, s.pos))
            moved = self._ghost_move_toward(t.pos, 6)
            if moved:
                self.emit(self.gpos, 2,
                          "movement traces: " + data.ATOM_TEXT["los_sprint"],
                          atoms=["los_sprint"])
        else:
            tgt = self.contract.anchor
            if self.g_noise_heard:
                tgt = max(self.g_noise_heard, key=lambda x: x[1])[0]
            moved = self._ghost_move_toward(tgt, 1)
            if moved and self.rng.random() < 0.5:
                self.emit(self.gpos, 2,
                          "movement traces: " + data.ATOM_TEXT["slow_creep"],
                          atoms=["slow_creep"])
        self._movement_evidence(prev, [])   # no generic speed reads
        if self.rng.random() < 0.25:
            self.emit(self.gpos, 3, "a long scraping drag", atoms=["whisper"])

    def _movement_evidence(self, prev, moved):
        """Speed/temperature/darkness reads on perceived traces (Tell layer)."""
        if not moved:
            return
        g = self.contract.true_ghost
        site = self.site
        watchers = [s for s in self.squad if s.mobile() and (
            any(site.los(s.pos, p) and site.chebyshev(s.pos, p) <= 8
                for p in moved) or
            (s.cls == "Scout" and any(site.chebyshev(s.pos, p) <= 8
                                      for p in moved)))]
        if not watchers:
            return
        room = site.room(self.gpos)
        temp = site.temp.get(room, 13) if room else 13
        atom = None
        if g == "hantu":
            if temp >= 20:
                atom = "warm_slow"
            elif temp <= 8:
                atom = "fast_cold"
        elif g != "hantu" and temp >= 20:
            atom = "temp_flat"
        if g == "mare" and site.light_level(self.gpos, self.round) == "dark" \
                and len(moved) >= 3:
            atom = "dark_speed_link"
        if g == "jinn" and not site.breaker_on:
            atom = "power_slow"
        if g == "wraith":
            # Any step that is not 8-adjacent walkable continuity = wall pass.
            for a, b in zip([prev] + moved, moved):
                if site.kind.get(b) == "wall" or site.kind.get(a) == "wall":
                    atom = "wall_phase"
                    break
        if atom:
            self.emit(self.gpos, 2, f"movement traces: {data.ATOM_TEXT[atom]}",
                      atoms=[atom], visible=True)

    def _interaction(self):
        g = self.contract.true_ghost
        r = self.rng.random()
        site = self.site
        room = site.room(self.gpos)
        if g == "hantu":
            if r < 0.30:
                closed = [w for w, o in site.window_open.items() if not o]
                if closed:
                    w = closed[self.rng.randrange(len(closed))]
                    site.window_open[w] = True
                    self.emit(w, 2, "a window bangs open", atoms=["opens_window"])
                    return
            if r < 0.55 and room:
                self.emit(self.gpos, 2, "frost crackles across the walls",
                          atoms=["cools_room"])
            elif r < 0.75:
                self.emit(self.gpos, 2, "a plate slides and shatters",
                          atoms=["single_throw"])
            else:
                self.emit(self.gpos, 3, "a whisper with no mouth",
                          atoms=["whisper"])
        elif g == "demon":
            lone = [s for s in self.squad if s.mobile() and not s.hidden
                    and site.room(s.pos) == room
                    and not any(o is not s and o.mobile()
                                and site.room(o.pos) == room
                                for o in self.squad)]
            if r < 0.25 and lone:
                v = lone[0]
                v.hp -= 1
                v.lose_composure(8)
                self.journal.log(self.round, v.initials, "claw_chip",
                                 instrument=True)  # HP loss is objective
                self.log(f"~ something rakes {v.name} — a claw chip "
                         f"(1 HP, Confirmed).")
            elif r < 0.55:
                self.emit(self.gpos, 4, "a chair hurled the length of the room",
                          atoms=["single_throw"])
            elif r < 0.8 and self.dread >= 40:
                self.emit(self.gpos, 0, "the lights snarl and flicker",
                          atoms=["flicker"], sitewide=self.dread >= 50)
            else:
                self.emit(self.gpos, 3, "a growl beneath the floor",
                          atoms=["whisper"])
        elif g == "mare":
            lit_rooms = [rm for rm in site.fixture_on
                         if site.powered(rm)
                         and self.round >= site.fixture_dead_until.get(rm, 0)]
            if r < 0.45 and lit_rooms:
                rm = lit_rooms[self.rng.randrange(len(lit_rooms))]
                site.fixture_on[rm] = False
                self.emit(self.gpos, 1, f"the {rm} light dies — switch flipped",
                          atoms=["light_kill"], sitewide=True)
            elif r < 0.7:
                den = site.room(self.contract.anchor)
                self.emit(self.contract.anchor, 2,
                          f"the {den} door drifts shut again",
                          atoms=["den_doors"])
            else:
                self.emit(self.gpos, 3, "breathing in the dark",
                          atoms=["whisper"])
        elif g == "jinn":
            near = [s for s in self.squad if s.mobile()
                    and site.chebyshev(s.pos, self.gpos) <= 3]
            if r < 0.35 and site.breaker_on:
                self.emit(self.gpos, 3, "a flicker cascade races down the line",
                          atoms=["flicker_cascade"], sitewide=True)
            elif r < 0.6 and near:
                v = near[0]
                self.journal.log(self.round, v.initials, "battery_drain",
                                 hidden_false=False)
                self.log(f"~ {v.name}'s lamp gutters — battery draining double.")
            elif r < 0.8 and site.breaker_on:
                self.emit(self.gpos, 0, "every screen hisses static",
                          atoms=["flicker"], sitewide=self.dread >= 25)
            else:
                self.emit(self.gpos, 3, "an appliance rattles",
                          atoms=["whisper"])
        elif g == "wraith":
            if r < 0.3 and self.dread >= 40:
                spots = [t for t in site.room_of if site.walkable(t)]
                far = [t for t in spots
                       if site.chebyshev(t, self.gpos) >= 8
                       and site.room(t) != "Van"]
                if far:
                    self.gpos = far[self.rng.randrange(len(far))]
                    self.emit(self.gpos, 8, "a displacement sigh rolls "
                              "through the house", atoms=["translocation"],
                              sitewide=True)
                    return
            if r < 0.6:
                self.emit(self.gpos, 3, "a whisper through the wall",
                          atoms=["whisper"])
            else:
                self.emit(self.gpos, 2, "a picture frame drops",
                          atoms=["single_throw"])
        elif g == "yurei":
            if r < 0.4:
                self.emit((20, 6), 5, "the bathroom taps open by themselves",
                          atoms=["water_sign"])
            elif r < 0.7:
                self.emit(self.gpos, 3, "soft sobbing, very close",
                          atoms=["whisper"])
            else:
                self.emit(self.gpos, 1, "a door eases shut", atoms=["door_op"])
        elif g == "poltergeist":
            if r < 0.35:
                self.emit(self.gpos, 4, "a BARRAGE — plates, books, a chair, "
                          "all at once", atoms=["multi_throw"])
            elif r < 0.55:
                self.emit(self.gpos, 2, "loose objects begin to vibrate",
                          atoms=["rattle_precursor"])
            elif r < 0.8:
                self.emit(self.gpos, 3, "a cup shatters against the wall",
                          atoms=["single_throw"])
            else:
                self.emit(self.gpos, 3, "a gleeful rapping in the walls",
                          atoms=["whisper"])
        elif g == "banshee":
            m = self.spec(self.marked) if self.marked else None
            if r < 0.45 and m and m.mobile():
                m.lose_composure(10)
                self.emit(m.pos, 3, f"a keening wail — only {m.name} doubles "
                          f"over", atoms=["keening"])
            elif r < 0.7:
                self.emit(self.gpos, 3, "a low mourning hum",
                          atoms=["whisper"])
            else:
                self.emit(self.gpos, 2, "a locket slides from a shelf",
                          atoms=["single_throw"])
        elif g == "shade":
            lone = [s for s in self.squad if s.mobile() and not s.hidden
                    and self.site.chebyshev(s.pos, self.gpos) <= 5
                    and not any(o is not s and o.mobile()
                                and self.site.chebyshev(o.pos, s.pos) <= 6
                                for o in self.squad)]
            if r < 0.5 and lone:
                v = lone[0]
                v.lose_composure(8)
                self.emit(v.pos, 0, f"a grey figure, gone when {v.name} "
                          f"blinks — no one else saw it",
                          atoms=["lone_manifest"])
            elif r < 0.7:
                self.emit(self.gpos, 2, "a candle snuffs by itself",
                          atoms=["whisper"])
            else:
                self.emit(self.gpos, 1, "the faintest nudge of a cup",
                          atoms=["single_throw"])
        elif g == "draugr":
            if r < 0.3:
                doors = [p for p, k in self.site.kind.items() if k == "door"
                         and self.site.chebyshev(p, self.contract.anchor) <= 8
                         and p not in self.site.jammed_doors]
                if doors:
                    d = doors[self.rng.randrange(len(doors))]
                    self.site.door_open[d] = False
                    self.site.jammed_doors.add(d)
                    self.emit(d, 3, "a door slams and JAMS",
                              atoms=["jammed_doors"])
                    return
            if r < 0.55:
                self.emit(self.gpos, 4, "heavy tread — the floor trembles",
                          atoms=["thud"])
            elif r < 0.75:
                self.emit(self.gpos, 4, "a wardrobe topples where it stood",
                          atoms=["furniture_topple"])
            else:
                self.emit(self.gpos, 3, "a guttural muttering",
                          atoms=["whisper"])
        elif g == "dybbuk":
            near_body = not self.alpha["rescued"] and \
                self.site.chebyshev(self.gpos, self.alpha["pos"]) <= 4
            if r < 0.4 and near_body and not self.hosted:
                self.emit(self.alpha["pos"], 3,
                          "broken speech near the body: 'help — me — up'",
                          atoms=["whisper_mimicry"])
            elif r < 0.65:
                self.emit(self.gpos, 2, "a soft, single throw",
                          atoms=["single_throw"])
            else:
                self.emit(self.gpos, 3, "a clinging whisper",
                          atoms=["whisper"])

    # Hunt behavior ---------------------------------------------------------

    def _hunt_phase(self):
        h = self.hunt
        h["phase"] += 1
        perceived_any = False
        for activation in range(2):
            target, tpos = self._hunt_target()
            if tpos is None:
                creep = h["last_seen"] or self.contract.anchor
                self._ghost_move_toward(creep, 2)
                continue
            perceived_any = perceived_any or target is not None
            self._ghost_move_toward(tpos, self._ghost_hunt_speed())
            if target and self.site.chebyshev(self.gpos, target.pos) <= 1 \
                    and not target.hidden:
                self._strike(target)
                break
        # Lost the scent: a full phase with no sight and no noise ends it.
        if perceived_any:
            h["quiet"] = 0
        else:
            h["quiet"] += 1
        if self.banished or self.hunt is None:
            return
        if h["quiet"] >= 1 and h["phase"] >= 1 and not perceived_any:
            self._end_hunt("it lost the scent")
        elif h["phase"] >= h["duration"]:
            self._end_hunt("the fury burns out")

    def _isolated_specialists(self):
        return [s for s in self.squad if s.mobile()
                and not any(o is not s and o.mobile()
                            and self.site.chebyshev(o.pos, s.pos) <= 6
                            for o in self.squad)]

    def _hunt_target(self):
        """(specialist_or_None, pos_or_None): seen -> last_seen -> noise."""
        h = self.hunt
        g = self.contract.true_ghost
        vis = [s for s in self.squad if s.mobile() and not s.hidden
               and self.site.chebyshev(self.gpos, s.pos) <= 6
               and self.site.los(self.gpos, s.pos)
               and self.site.room(s.pos) != "Van"]
        if g == "banshee":          # BN-3: she walks past everyone else
            vis = [s for s in vis if s.name == self.marked]
            m = self.spec(self.marked) if self.marked else None
            if m and m.mobile() and not m.hidden:
                h["last_seen"] = m.pos
                return m, m.pos     # she always knows where the Marked is
            return None, h["last_seen"]
        if g == "shade":            # SH-4: lone specialists only
            iso = self._isolated_specialists()
            vis = [s for s in vis if s in iso]
        # A hidden specialist it saw enter, or who makes noise, is fair game.
        for s in self.squad:
            if s.hidden and s.hide_seen:
                vis.append(s)
            elif s.hidden and s.rattled and self.rng.random() < 0.25:
                self.log(f"~ a whimper from {s.name}'s hiding spot.")
                self._make_noise(s.pos, 2)
                vis.append(s)
        if vis:
            t = min(vis, key=lambda s: self.site.chebyshev(self.gpos, s.pos))
            h["last_seen"] = t.pos
            return t, t.pos
        if self.g_noise_heard:
            loud = max(self.g_noise_heard, key=lambda x: x[1])
            return None, loud[0]
        if h["last_seen"]:
            return None, h["last_seen"]
        return None, None

    def _strike(self, target):
        # Refuge (01 §6.4): during an all-channel rite the chalk circle
        # blocks one strike per Hunt aimed at anyone standing in it.
        rite = self.working_rite()
        if rite and rite["special"] == "all_channel" and self.hunt \
                and not self.hunt.get("refuge_used") \
                and (self.channel_banked > 0 or self.channel_inflight) \
                and self.site.chebyshev(target.pos, self.contract.anchor) <= 1:
            self.hunt["refuge_used"] = True
            self.log(f"!! the chalk circle flares — the strike aimed at "
                     f"{target.name} is turned aside.")
            return
        if target.hidden:
            target.hidden = False
        dmg = 6 - (2 if target.steadied else 0)
        target.hp -= dmg
        target.lose_composure(15)
        # Knockback 2 tiles directly away.
        dx = max(-1, min(1, target.pos[0] - self.gpos[0]))
        dy = max(-1, min(1, target.pos[1] - self.gpos[1]))
        for _ in range(2):
            n = (target.pos[0] + dx, target.pos[1] + dy)
            if self.site.walkable(n):
                target.pos = n
        for s in self.squad:
            if s is not target and s.mobile():
                s.lose_composure(10)
        self.channel_interrupted_names = getattr(
            self, "channel_interrupted_names", set())
        self.channel_interrupted_names.add(target.name)
        self.log(f"!! STRIKE — {target.name} takes {dmg} "
                 f"({max(target.hp, 0)} HP left).")
        if target.hp <= 0:
            self._down(target)
            self._end_hunt("it is sated")
        if target.carrying == "alpha":
            self.alpha["carried_by"] = None
            target.carrying = None

    def _down(self, s):
        if s.downed and self.cfg["permadeath"]:
            s.dead = True
            self.log(f"!! {s.name} IS GONE. (Nightmare rules)")
            return
        s.downed = True
        s.hidden = False
        if s.carrying == "alpha":
            self.alpha["carried_by"] = None
        s.carrying = None
        if s.items:   # drops everything on their tile (01 §10.1)
            self.site.floor_items.setdefault(s.pos, []).extend(s.items)
            s.items = []
        for o in self.squad:
            if o is not s and o.mobile():
                o.lose_composure(20)
        self.log(f"!! {s.name} IS DOWN. (-20 Composure squadwide)")
        if all(not x.mobile() for x in self.squad):
            self.over = True
            self.outcome = "failed"

    def _end_hunt(self, why):
        self.hunt = None
        self.hunts_survived += 1
        self.dread_floor = min(70, 30 + 10 * self.hunts_survived)
        self.dread = max(self.dread_floor, self.dread - 30)
        for s in self.squad:
            s.hide_seen = False
        # Demon: 25% to chain a second Hunt immediately (02 roster).
        if self.contract.true_ghost == "demon" and self.rng.random() < 0.25:
            self.prelude = True
            self.log(f"!! the Hunt ends ({why}) — and the pressure "
                     f"IMMEDIATELY builds again. (Dread {self.dread})")
        else:
            self.log(f"!! the Hunt ends — {why}. Dread falls to {self.dread} "
                     f"(floor {self.dread_floor}).")

    # ----------------------------------------------------------- end states

    def end_player_phase(self):
        """Call after the squad's AP is spent; resolves extraction checks."""
        mobile = [s for s in self.squad if s.mobile()]
        if mobile and all(self.site.room(s.pos) == "Van" for s in mobile):
            if self.banished:
                self.over = True
                self.outcome = "banished"
            elif self.round >= 4:      # grace: deployment starts in the van
                self.over = True
                self.outcome = "withdraw"
        if self.round >= self.MAX_ROUNDS:
            self.over = True
            self.outcome = self.outcome or "timeout"

    def advance(self):
        """One full round when driven headless: ghost phase + next player."""
        self.end_player_phase()
        if self.over:
            return
        self.ghost_phase()
        self.round += 1
        if not self.over:
            self.start_player_phase()

    # -------------------------------------------------------------- scoring

    def debrief(self):
        base = 600  # Medium site
        mult = self.cfg["mult"]
        lines = []
        total = 0
        if self.outcome == "banished":
            total = base * mult
            lines.append(f"Base fee (Medium) x{mult}: {int(total)}")
            if self.alpha["rescued"]:
                total += 150
                lines.append("Alpha victim extracted: +150")
            if all(not s.downed and not s.dead for s in self.squad):
                total += 100
                lines.append("No specialist Downed: +100")
            if self.dread < 75:
                total += 75
                lines.append("Dread < 75: +75")
            if self.hunts_survived:
                total += 60 * self.hunts_survived
                lines.append(f"Hazard bonus x{self.hunts_survived}: "
                             f"+{60 * self.hunts_survived}")
            if self.journal.clean():
                total += 50
                lines.append("Clean Journal: +50")
            if getattr(self, "verified_challenge", False):
                total += 250
                lines.append("Verified Challenge/Filing: +250")
        elif self.outcome == "withdraw":
            tells = len({e.atom for e in self.journal.entries if not e.struck})
            if tells >= 2:
                total = base * mult * 0.25
                lines.append(f"Withdraw call-out fee (>=2 Tells): {int(total)}")
            else:
                lines.append("Withdraw with a thin Journal: no fee.")
        else:
            lines.append("Contract failed. No fee. Standing penalty.")
        fee = 50 * max(0, self.journal.challenges - 1)
        if fee:
            total -= fee
            lines.append(f"Re-file fees: -{fee}")
        falses = self.journal.false_entries()
        if falses:
            lines.append(f"(Debrief reveals {len(falses)} FALSE journal "
                         f"entr{'y' if len(falses) == 1 else 'ies'} — "
                         f"logged while Rattled.)")
        truth = data.GHOSTS[self.contract.true_ghost]["name"]
        lines.append(f"Ground truth: the entity was a {truth}."
                     + (" Alpha's report was WRONG." if self.contract.misid
                        else ""))
        return int(total), lines
