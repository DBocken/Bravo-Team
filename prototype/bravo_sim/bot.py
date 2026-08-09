"""Autoplay policy — a competent Bravo Shift Supervisor.

Drives the player phase headlessly: sweeps for the Anchor, runs the
pair-specific disambiguation tests (03 §2.3's on-demand Tells), strikes
Rattled testimony, Challenges the ID when the Journal demands it, preps and
holds the Rite, and extracts. Used by `--auto`, the demo, and the selftests.
"""

from . import data
from .world import FURNACE_POS, BREAKER_POS, ANCHOR_SPOTS, FRAGMENT_TILES

SWEEP_ROOMS = ["Foyer", "Living", "Cellar", "Pantry", "Bedroom", "Mudroom",
               "Study", "Bathroom"]
SWEEP_TARGETS = {
    "Cellar": (2, 6), "Foyer": (11, 10), "Bedroom": (21, 2),
    "Mudroom": (15, 2), "Study": (19, 10), "Bathroom": (20, 6),
    "Living": (3, 10), "Pantry": (9, 2),
}
SALT_SPOTS = [(8, 6), (13, 6)]      # hall chokepoints
FLEE_SPOTS = [(11, 10), (3, 10), (20, 10), (2, 2)]


class Bot:
    def __init__(self, sim):
        self.sim = sim
        self.swept = set()
        self.test_rounds = 0
        self.breaker_test_done = False
        self.furnace_lit_by_bot = False
        self.inspected = set()

    # ------------------------------------------------------------- helpers

    def free(self, p, me):
        sim = self.sim
        return sim.site.walkable(p) and not any(
            o is not me and o.mobile() and o.pos == p for o in sim.squad)

    def goto(self, s, goal, adj=False):
        """Drive s toward goal until arrived, out of AP, or stuck."""
        while True:
            ap_before = s.ap
            if self._goto_step(s, goal, adj):
                return True
            if s.ap <= 0 or s.ap == ap_before:
                return False

    def _goto_step(self, s, goal, adj=False):
        """One movement action toward goal. True when arrived. Unwalkable
        goals (furniture, the Anchor object) are approached via a neighbor."""
        sim = self.sim
        site = sim.site
        if s.pos == goal or (adj and site.chebyshev(s.pos, goal) <= 1):
            return True
        if s.ap <= 0:
            return False
        blocked = [o.pos for o in sim.squad if o is not s and o.mobile()]
        targets = [goal]
        if not site.walkable(goal):
            targets = sorted(
                (n for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                 if (n := (goal[0] + dx, goal[1] + dy)) != goal
                 and site.walkable(n)),
                key=lambda n: site.chebyshev(s.pos, n))
        plan = None
        for t in targets:
            plan = site.path(s.pos, t, blocked=blocked, doors_ok=True) or \
                site.path(s.pos, t, doors_ok=True)
            if plan:
                break
        if not plan:
            return False
        cut = len(plan)
        for i, p in enumerate(plan):
            if site.kind.get(p) == "door" and not site.door_open[p]:
                if site.chebyshev(s.pos, p) <= 1:
                    sim.act_door(s, p)   # free op; a jammed door costs 2 AP
                    if not site.door_open[p]:
                        return False     # couldn't force it this action
                else:
                    cut = i
                break
        limit = 5 if s.cls == "Scout" and not s.carrying else \
            (3 if s.carrying else 4)
        steps = plan[:min(cut, limit)]
        while steps and not self.free(steps[-1], s):
            steps.pop()
        while steps:
            ok, _ = sim.act_move(s, steps[-1])
            if ok:
                break
            steps.pop()
        return s.pos == goal or (adj and site.chebyshev(s.pos, goal) <= 1)

    def squad_items(self):
        out = {}
        for s in self.sim.squad:
            for i in s.items:
                out[i] = out.get(i, 0) + 1
        return out

    # ----------------------------------------------------------- decisions

    def strike_rattled(self):
        j = self.sim.journal
        for idx, e in enumerate(j.entries):
            if e.instrument or e.struck:
                continue
            for s in self.sim.squad:
                if s.initials == e.observer and e.turn in s.rattled_history:
                    j.strike(idx)

    def decide_id(self):
        sim = self.sim
        j = sim.journal
        live = j.candidates()
        if not live:
            return  # impossible journal — strikes already applied; wait
        if j.working_id is None:            # Blackout: file when narrowed
            if len(live) == 1:
                sim.act_challenge(live[0])
            elif len(live) == 2 and sim.round > 30:
                sim.act_challenge(live[0])
        elif j.working_id not in live:      # the claim is dead — challenge
            partner = data.GHOSTS[j.working_id]["partner"]
            new = partner if partner in live else live[0]
            sim.act_challenge(new)

    def pair_under_test(self):
        wid = self.sim.journal.working_id
        if wid:
            return {wid, data.GHOSTS[wid]["partner"]}
        return set(self.sim.journal.candidates())

    def id_settled(self):
        sim = self.sim
        j = sim.journal
        live = j.candidates()
        if j.working_id is None:
            return False
        if sim.contract.difficulty == "standard":
            return True                      # the report is correct by canon
        partner = data.GHOSTS[j.working_id]["partner"]
        if partner not in live:
            return True                      # partner excluded — claim holds
        return self.test_rounds >= 12        # tested enough: trust the paper

    # ------------------------------------------------------------ the turn

    def take_turn(self):
        sim = self.sim
        if sim.over:
            return
        self.strike_rattled()
        self.decide_id()
        if sim.prelude or sim.hunt:
            self.hunt_safety()
            return
        if sim.banished or sim.round > 65:
            self.extract()
            return
        self.manage_dread()
        if not self.id_settled():
            self.test_rounds += 1
            self.investigate()
        else:
            self.execute_rite()

    def manage_dread(self):
        sim = self.sim
        if sim.dread >= max(65, sim.dread_floor + 12):
            for s in sim.squad:
                if s.mobile() and "cleansing_bundle" in s.items and s.ap > 0:
                    sim.act_place(s, "cleansing_bundle")
                    return

    # --------------------------------------------------------- exploration

    def investigate(self):
        sim = self.sim
        pair = self.pair_under_test()
        vance, okafor, lis = sim.spec("Vance"), sim.spec("Okafor"), sim.spec("Lis")
        # Lis sweeps for the Anchor and reads the site (Scout passive).
        if lis.mobile():
            self.sweep(lis)
        # Okafor runs the on-demand tests and lays the salt instrument.
        if okafor.mobile():
            self.run_tests(okafor, pair)
        # Vance checks salt lines, stages reagents early, keeps company.
        if vance.mobile():
            if not self.check_salt(vance):
                if sim.anchor_confirmed:
                    self.stage_reagents(vance)
                else:
                    self.sweep(vance)
            if vance.ap > 0:
                sim.act_steady(vance)

    def sweep(self, s):
        sim = self.sim
        if not sim.anchor_found:
            for room in SWEEP_ROOMS:
                if room in self.swept:
                    continue
                if self.goto(s, SWEEP_TARGETS[room]):
                    self.swept.add(room)
                    if sim.anchor_found or s.ap <= 0:
                        return
                    continue        # arrived with AP to spare: next room
                return              # en route or stuck: stop here this turn
            return
        self.inspect_anchor(s)

    def inspect_anchor(self, s):
        sim = self.sim
        if sim.anchor_confirmed:
            return
        room = getattr(sim, "anchor_room", None)
        if not room:
            return
        spots = [p for ps in ANCHOR_SPOTS.values() for p in ps
                 if sim.site.room(p) == room and p not in self.inspected]
        for p in spots:
            if self.goto(s, p, adj=True) and s.ap > 0:
                sim.act_interact(s, "inspect", p)
                self.inspected.add(p)
                if sim.anchor_confirmed:
                    return
            if s.ap <= 0:
                return

    def run_tests(self, s, pair):
        sim = self.sim
        # Universal instrument: a salt line on the hall chokepoint.
        n_spots = 2 if {"wraith", "yurei"} & pair else 1
        for spot in SALT_SPOTS[:n_spots]:
            if spot not in sim.site.salt_lines:
                if "salt" not in s.items:
                    break
                if self.goto(s, spot) and s.ap > 0:
                    sim.act_place(s, "salt")
                return
        if {"hantu", "demon"} & pair and not sim.site.furnace_on \
                and not self.furnace_lit_by_bot:
            if self.goto(s, FURNACE_POS, adj=True) and s.ap > 0:
                sim.act_interact(s, "furnace", FURNACE_POS)
                self.furnace_lit_by_bot = True
            return
        if {"mare", "jinn"} & pair and not self.breaker_test_done:
            off_round = getattr(self, "breaker_off_round", None)
            if sim.site.breaker_on and off_round is None:
                if self.goto(s, BREAKER_POS, adj=True) and s.ap > 0:
                    sim.act_interact(s, "breaker", BREAKER_POS)
                    self.breaker_off_round = sim.round
            elif off_round is not None and sim.round - off_round >= 4:
                if sim.site.breaker_on:
                    self.breaker_test_done = True   # a Backfire rider beat us to it
                elif self.goto(s, BREAKER_POS, adj=True) and s.ap > 0:
                    sim.act_interact(s, "breaker", BREAKER_POS)
                    self.breaker_test_done = True
            elif s.ap > 0:
                sim.act_steady(s)   # hold position while the dark test runs
            return
        if not self.check_salt(s):
            if s.ap > 0:
                sim.act_steady(s)

    def stage_reagents(self, s):
        """Ferry any carried rite reagent to the confirmed Anchor early."""
        sim = self.sim
        missing, _ = self.missing_reagents()
        carried = [i for i in s.items if i in missing]
        if not carried:
            return False
        if self.goto(s, sim.contract.anchor, adj=True) and s.ap > 0:
            sim.act_place(s, carried[0])
        return True

    def check_salt(self, s):
        """Read any salt line that has recorded a crossing."""
        sim = self.sim
        for p, line in sim.site.salt_lines.items():
            if line["record"]:
                if self.goto(s, p, adj=True) and s.ap > 0:
                    sim.act_interact(s, "salt_check", p)
                return True
        return False

    # ---------------------------------------------------------------- rite

    def alpha_run(self, s):
        """Fetch the Alpha and get her aboard. The collapse after the
        banishment makes leaving this until the end a losing line."""
        sim = self.sim
        a = sim.alpha
        if a["rescued"] or sim.hosted:
            return False
        if s.carrying == "alpha":
            if self.goto(s, self.van_tile(s)) and s.ap > 0 \
                    and sim.site.room(s.pos) == "Van":
                sim.act_lower(s)
            return True
        if a["carried_by"] is not None:
            return False
        if self.goto(s, a["pos"], adj=True) and s.ap > 0:
            sim.act_lift(s)
        return True

    def execute_rite(self):
        sim = self.sim
        # the Scout runs the casualty out while the rite is prepared
        lis = sim.spec("Lis")
        self.alpha_busy = False
        if lis.mobile() and not sim.alpha["rescued"] and not sim.hosted \
                and sim.round < 55:
            self.alpha_busy = self.alpha_run(lis)
        vance, okafor, lis = sim.spec("Vance"), sim.spec("Okafor"), sim.spec("Lis")
        if not sim.anchor_found:
            for s in (lis, vance, okafor):
                if s.mobile():
                    self.sweep(s)
            return
        if not sim.anchor_confirmed:
            for s in (lis, vance):
                if s.mobile():
                    self.inspect_anchor(s)
            if okafor.mobile() and okafor.ap > 0:
                self.goto(okafor, SWEEP_TARGETS.get(
                    getattr(sim, "anchor_room", "Foyer"), (11, 10)), adj=True)
            return
        rite = sim.working_rite()
        ready, why = sim.rite_ready()
        if not ready:
            self.prepare(why, rite)
            return
        self.special_and_channel(rite)

    def missing_reagents(self):
        sim = self.sim
        rite = sim.working_rite()
        if rite is None:
            return [], 0
        need = dict(rite["reagents"])
        frags = need.pop("name_fragment", 0)
        missing = []
        for r, n in need.items():
            for _ in range(max(0, n - sim.placed.get(r, 0))):
                missing.append(r)
        return missing, max(0, frags - sim.fragments_found)

    def prepare(self, why, rite):
        sim = self.sim
        anchor = sim.contract.anchor
        for s in [sim.spec("Vance"), sim.spec("Lis"), sim.spec("Okafor")]:
            if not s.mobile():
                continue
            hopeless = set()      # items this specialist can't source this turn
            while s.ap > 0:
                missing, frags_needed = self.missing_reagents()
                acted = False
                carried_needed = [i for i in s.items if i in missing]
                others_carry = [i for o in sim.squad
                                if o is not s and o.mobile()
                                for i in o.items]
                to_fetch = list(missing)
                for i in carried_needed + others_carry:
                    if i in to_fetch:
                        to_fetch.remove(i)
                to_fetch = [i for i in to_fetch if i not in hopeless]
                if carried_needed:
                    # Ferry what we hold to the Anchor and place it.
                    if self.goto(s, anchor, adj=True) and s.ap > 0:
                        ok, _ = sim.act_place(s, carried_needed[0])
                        acted = ok
                elif frags_needed and s is sim.spec("Lis"):
                    tgt = [p for p in FRAGMENT_TILES
                           if sim.site.search_left.get(p)]
                    if tgt and self.goto(s, tgt[0], adj=True) and s.ap > 0:
                        sim.act_interact(s, "search", tgt[0])
                        acted = True
                elif to_fetch:
                    item = to_fetch[0]
                    crate = sim.site.search_left.get("crate",
                                                     list(data.VAN_CRATE))
                    spots = [p for p, ys in sim.site.search_left.items()
                             if isinstance(p, tuple) and item in ys]
                    floor = [p for p, ys in sim.site.floor_items.items()
                             if item in ys]
                    if len(s.items) >= 4:
                        spare = next((i for i in s.items if i not in missing),
                                     None)
                        if spare:
                            sim.act_drop(s, spare)
                    if floor:
                        if self.goto(s, floor[0], adj=True) and s.ap > 0:
                            ok, _ = sim.act_pickup(s, floor[0], item)
                            acted = ok
                    elif item in crate:
                        if self.goto(s, (11, 17)) and s.ap > 0:
                            ok, _ = sim.take_from_crate(s, item)
                            acted = ok
                        if not acted and s.ap <= 0:
                            break
                    elif spots:
                        if self.goto(s, spots[0], adj=True) and s.ap > 0:
                            sim.act_interact(s, "search", spots[0])
                            acted = True
                    else:
                        hopeless.add(item)
                        acted = True   # re-evaluate remaining fetch list
                if not acted:
                    if s.ap > 0 and sim.site.chebyshev(s.pos, anchor) > 2:
                        if not self.goto(s, anchor, adj=True):
                            break
                    else:
                        if s.ap > 0:
                            sim.act_steady(s)
                        break

    def special_and_channel(self, rite):
        sim = self.sim
        vance, okafor, lis = sim.spec("Vance"), sim.spec("Okafor"), sim.spec("Lis")
        sp = rite["special"]
        anchor = sim.contract.anchor
        room = sim.site.room(anchor)
        vigil_exile = max(FLEE_SPOTS,
                          key=lambda p: sim.site.chebyshev(p, anchor))
        # Satisfy the special condition with the Warden.
        if okafor.mobile():
            handled = False
            if sp == "warm" and not sim.site.furnace_on:
                if self.goto(okafor, FURNACE_POS, adj=True) and okafor.ap > 0:
                    sim.act_interact(okafor, "furnace", FURNACE_POS)
                handled = True
            elif sp == "dark" and sim.site.breaker_on:
                if self.goto(okafor, BREAKER_POS, adj=True) and okafor.ap > 0:
                    sim.act_interact(okafor, "breaker", BREAKER_POS)
                handled = True
            elif sp == "lone":
                # The vigil is kept alone — everyone else beyond 6 tiles.
                self.goto(okafor, vigil_exile)
                if okafor.ap > 0:
                    sim.act_steady(okafor)
                handled = True
            elif sp == "lit" and \
                    sim.site.light_level(anchor, sim.round) != "lit":
                # A placed lantern is Mare-proof light (it kills fixtures,
                # not flames) — the Warden's lantern work is the real rite.
                holder = next((x for x in (okafor, vance, lis)
                               if x.mobile() and "lantern" in x.items), None)
                if holder is not None:
                    if self.goto(holder, anchor, adj=True) and holder.ap > 0:
                        sim.act_place(holder, "lantern")
                    handled = holder is okafor
                elif not sim.site.breaker_on:
                    if self.goto(okafor, BREAKER_POS, adj=True) \
                            and okafor.ap > 0:
                        sim.act_interact(okafor, "breaker", BREAKER_POS)
                    handled = True
                elif not sim.site.fixture_on.get(room, False):
                    tgt = SWEEP_TARGETS.get(room, anchor)
                    if self.goto(okafor, tgt) and okafor.ap > 0 \
                            and sim.site.room(okafor.pos) == room:
                        sim.act_interact(okafor, "light")
                    handled = True
            if not handled:
                self.guard(okafor)
        if sp == "all_channel" and getattr(self, "alpha_busy", False):
            return          # everyone channels or nobody does — rescue first
        if sp == "all_channel":
            # Wards pre-laid (02, Naming): salt on the approaches first.
            near_lines = [p for p in sim.site.salt_lines
                          if sim.site.chebyshev(p, anchor) <= 3
                          and sim.site.salt_lines[p]["state"] == "intact"]
            if len(near_lines) < 2:
                holder = next((x for x in (okafor, lis, vance)
                               if x.mobile() and "salt" in x.items), None)
                if holder is not None:
                    spot = next(
                        (q for q in sorted(
                            sim.site.room_of,
                            key=lambda q: sim.site.chebyshev(q, holder.pos))
                         if 2 <= sim.site.chebyshev(q, anchor) <= 3
                         and sim.site.room(q) == room
                         and q not in sim.site.salt_lines
                         and sim.site.walkable(q)), None)
                    if spot and self.goto(holder, spot) and holder.ap > 0 \
                            and holder.pos == spot:
                        sim.act_place(holder, "salt")
                        return
            chans = [s for s in (vance, okafor, lis) if s.mobile()]
        else:
            chans = [vance if vance.mobile() else
                     (lis if lis.mobile() else okafor)]
            if getattr(self, "alpha_busy", False) and lis in chans:
                chans = [x for x in (vance, okafor) if x.mobile()] or chans
            if sp == "lone":
                if lis.mobile() and lis not in chans and not self.alpha_busy:
                    self.goto(lis, vigil_exile)
                    if lis.ap > 0:
                        sim.act_steady(lis)
            else:
                # The Marked must stand by the effigy (Sever the Bond).
                m = sim.spec(sim.marked) if sim.marked else None
                if sp == "marked_near" and m and m.mobile() \
                        and m not in chans:
                    if self.goto(m, anchor, adj=True) and m.ap > 0:
                        sim.act_steady(m)
                if lis.mobile() and lis not in chans and lis is not m \
                        and not getattr(self, "alpha_busy", False):
                    if self.goto(lis, anchor, adj=True) and lis.ap > 0:
                        sim.act_steady(lis)
        all_in = True
        for s in chans:
            if not self.goto(s, anchor, adj=True):
                all_in = False
        if not all_in:
            return
        for s in chans:
            if s.ap >= 2:
                ok, why = sim.act_channel(s)
                if not ok and s.ap > 0:
                    sim.act_steady(s)

    def guard(self, s):
        """Warden holds the anchor-room approach with salt, then steadies."""
        sim = self.sim
        anchor = sim.contract.anchor
        if "salt" in s.items:
            doors = [p for p, k in sim.site.kind.items() if k == "door"
                     and any(sim.site.room((p[0] + dx, p[1] + dy)) ==
                             sim.site.room(anchor)
                             for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)))]
            spot = None
            for d in doors:
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    q = (d[0] + dx, d[1] + dy)
                    if sim.site.room(q) == sim.site.room(anchor) \
                            and q not in sim.site.salt_lines \
                            and sim.site.walkable(q):
                        spot = q
                        break
                if spot:
                    break
            if spot and self.goto(s, spot) and s.ap > 0 and s.pos == spot:
                sim.act_place(s, "salt")
                return
        if self.goto(s, anchor, adj=True) and s.ap > 0:
            sim.act_steady(s)

    # ------------------------------------------------------------- danger

    def hunt_safety(self):
        sim = self.sim
        rite = sim.working_rite()
        for s in sim.squad:
            if not s.mobile():
                continue
            # Channel through the Hunt: the rite ending IS the escape
            # (01 §8.3 — completion ends any active Hunt instantly).
            if rite and sim.rite_ready()[0] \
                    and (rite["special"] == "all_channel" or s.cls == "Ritualist"):
                if sim.site.chebyshev(s.pos, sim.contract.anchor) > 1:
                    self.goto(s, sim.contract.anchor, adj=True)
                if s.ap >= 2 and \
                        sim.site.chebyshev(s.pos, sim.contract.anchor) <= 1:
                    sim.act_channel(s)
                continue
            # Past the Dread-floor ratchet there is no quiet left to wait
            # for (01 §5.3) — ferry the last reagents through the Hunt.
            missing, _ = self.missing_reagents()
            carried_needed = [i for i in s.items if i in missing]
            if carried_needed and sim.anchor_confirmed \
                    and sim.dread_floor >= 50:
                if s.hidden:
                    sim.act_unhide(s)
                if self.goto(s, sim.contract.anchor, adj=True) and s.ap > 0:
                    sim.act_place(s, carried_needed[0])
                continue
            if s.hidden:
                continue
            ok, _ = sim.act_hide(s)
            if ok:
                continue
            # Flee: put distance and a door between us and it.
            far = max(FLEE_SPOTS,
                      key=lambda p: sim.site.chebyshev(p, sim.gpos))
            self.goto(s, far)
            if s.ap > 0:
                sim.act_steady(s)

    # ------------------------------------------------------------- extract

    def van_tile(self, s):
        """A van tile this specialist can actually stand on."""
        for p in self.sim.site.room_tiles("Van"):
            if s.pos == p or self.free(p, s):
                return p
        return (12, 17)

    def extract(self):
        sim = self.sim
        alpha = sim.alpha
        carrier = next((s for s in sim.squad if s.carrying == "alpha"), None)
        rescuer = None
        if sim.banished and not alpha["rescued"] and carrier is None:
            mobile = [s for s in sim.squad if s.mobile()]
            if mobile:
                rescuer = min(mobile, key=lambda s:
                              sim.site.chebyshev(s.pos, alpha["pos"]))
                s = rescuer
                if self.goto(s, alpha["pos"], adj=True) and s.ap > 0:
                    sim.act_lift(s)
                    if s.carrying == "alpha":
                        carrier = s
        for s in sim.squad:
            if not s.mobile() or s is rescuer and s is not carrier:
                continue
            if s is carrier:
                if self.goto(s, self.van_tile(s)) and s.ap > 0 \
                        and sim.site.room(s.pos) == "Van":
                    sim.act_lower(s)
            else:
                self.goto(s, self.van_tile(s))


def run_auto(sim, verbose=False):
    bot = Bot(sim)
    sim.start_player_phase()
    while not sim.over:
        bot.take_turn()
        sim.advance()
    return sim
