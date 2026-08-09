"""Site model: grid, rooms, line of sight, sound, light, temperature.

Implements 01-core-gameplay.md §4 (grid rules) and the environmental spec
referenced from 05-maps-and-environments.md, for one handcrafted Medium site:
the farmhouse used in the worked vignette (01 §11).

Map legend: '#' wall · '.' floor · '+' door (closed) · 'w' window · 'T' tall
furniture · 't' low furniture (searchable) · 'H' hiding spot · 'F' furnace ·
'B' breaker · 'V' van zone · ' ' void.
"""

FARMHOUSE = [
    "########################",
    "#......#....#......#...#",
    "w......+....+......+...w",
    "#....t.#...H#..F.B.#H..#",
    "######+###+###+######+##",
    "#....#..........#......#",
    "#.H..+..........+......w",
    "#.T..#...t.t....#......#",
    "###########+############",
    "#......#.......#.......#",
    "w......+.......+.......w",
    "#..t.H.#.......#..T.t..#",
    "#......#.......#H......#",
    "###########+############",
    "         VVVVVV         ",
    "         VVVVVV         ",
    "         VVVVVV         ",
    "          VVVV          ",
]

ROOM_RECTS = {
    "Kitchen":  (1, 1, 6, 3),
    "Pantry":   (8, 1, 11, 3),
    "Mudroom":  (13, 1, 18, 3),
    "Bedroom":  (20, 1, 22, 3),
    "Cellar":   (1, 5, 4, 7),
    "Hall":     (6, 5, 15, 7),
    "Bathroom": (17, 5, 22, 7),
    "Living":   (1, 9, 6, 12),
    "Foyer":    (8, 9, 14, 12),
    "Study":    (16, 9, 22, 12),
    "Van":      (10, 17, 13, 17),
}

# Start temperatures (deg C). Cold <= 8, warm >= 20 (02-ghost-roster.md, Hantu).
ROOM_TEMPS = {
    "Kitchen": 14, "Pantry": 12, "Mudroom": 12, "Bedroom": 10, "Cellar": 4,
    "Hall": 13, "Bathroom": 13, "Living": 15, "Foyer": 14, "Study": 13,
    "Van": 12,
}
COLD_AT, WARM_AT = 8, 20

# Rooms with a light fixture; True = on at contract start (Alpha left in a hurry).
ROOM_FIXTURES = {
    "Kitchen": True, "Pantry": False, "Mudroom": False, "Bedroom": False,
    "Hall": True, "Bathroom": False, "Living": False, "Foyer": True,
    "Study": False,
}

WINDOWS = [(0, 2), (23, 2), (23, 6), (0, 10), (23, 10)]

# Per-ghost Anchor candidate tiles (placement logic per 02-ghost-roster.md).
ANCHOR_SPOTS = {
    "hantu":       [(1, 5), (4, 7)],     # coldest room: the cellar
    "demon":       [(8, 12), (14, 9)],   # pact-object near the threshold: foyer
    "mare":        [(22, 1), (22, 3)],   # the den nest: bedroom
    "jinn":        [(13, 1), (18, 1)],   # beside wiring: mudroom
    "wraith":      [(17, 9), (22, 12)],  # omen-object: study
    "yurei":       [(22, 5), (17, 7)],   # tether in the water room: bathroom
    "poltergeist": [(1, 12), (6, 9)],    # its favorite clutter: the living room
    "banshee":     [(1, 10), (6, 11)],   # the effigy stands in the living room
    "revenant":    [(8, 1), (10, 1)],    # burial plot staged off the pantry
    "shade":       [(9, 3), (8, 3)],     # hearth-side comfort object, pantry
    "draugr":      [(16, 9), (21, 12)],  # the disturbed barrow: study cache
    "dybbuk":      [(20, 1), (21, 3)],   # vessel-object beside the bodies
}

ALPHA_SPOTS = [(21, 2), (1, 7), (20, 12)]

# Searchable furniture: tile -> list of yields (popped in order, 1 per search).
SEARCH_YIELDS = {
    (5, 3):   ["salt", "votive", "woven_effigy"],
    (2, 7):   ["brazier_coals", "lamp_oil", "iron_filings"],
    (9, 7):   ["salt", "cleansing_bundle", "votive"],
    (11, 7):  ["votive", "brazier_coals", "salt"],
    (3, 11):  ["votive", "lamp_oil", "woven_effigy"],
    (18, 11): ["grave_soil", "grave_soil", "iron_filings"],
    (20, 11): ["grave_soil", "grave_soil", "iron_filings"],
}
# When the true ghost is the Demon, its name-fragments spawn in these searches
# (02-ghost-roster.md Naming rite; spawn rules simplified for the prototype).
FRAGMENT_TILES = [(18, 11), (20, 11)]

FURNACE_POS = (15, 3)
BREAKER_POS = (17, 3)
FRONT_DOOR = (11, 13)

DIRS8 = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
DIRS4 = [(0, -1), (-1, 0), (1, 0), (0, 1)]


class Site:
    """Parsed, mutable site state."""

    def __init__(self):
        self.w = len(FARMHOUSE[0])
        self.h = len(FARMHOUSE)
        self.kind = {}       # (x,y) -> 'wall'|'floor'|'door'|'window'|'van'|'void'
        self.furn = {}       # (x,y) -> 'tall'|'low'|'hide'
        self.door_open = {}  # (x,y) -> bool
        self.window_open = {p: False for p in WINDOWS}
        self.room_of = {}
        for y, row in enumerate(FARMHOUSE):
            for x, ch in enumerate(row):
                p = (x, y)
                if ch == "#":
                    self.kind[p] = "wall"
                elif ch == "w":
                    self.kind[p] = "window"
                elif ch == "+":
                    self.kind[p] = "door"
                    self.door_open[p] = False
                elif ch == "V":
                    self.kind[p] = "van"
                elif ch == " ":
                    self.kind[p] = "void"
                else:
                    self.kind[p] = "floor"
                    if ch == "T":
                        self.furn[p] = "tall"
                    elif ch == "t":
                        self.furn[p] = "low"
                    elif ch == "H":
                        self.furn[p] = "hide"
        for name, (x0, y0, x1, y1) in ROOM_RECTS.items():
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if self.kind.get((x, y)) in ("floor", "van"):
                        self.room_of[(x, y)] = name
        self.temp = dict(ROOM_TEMPS)
        self.fixture_on = dict(ROOM_FIXTURES)
        self.fixture_dead_until = {}   # room -> round (Backfire riders)
        self.breaker_on = True
        self.breaker_locked_until = 0  # round until which breaker state is locked
        self.furnace_on = False
        self.search_left = {p: list(v) for p, v in SEARCH_YIELDS.items()}
        self.salt_lines = {}           # (x,y) -> {'state': 'intact'|'scoured', 'record': atom|None}
        self.floor_items = {}          # (x,y) -> [dropped items] (01 §8.1)
        self.rubble = set()            # tiles lost to the collapse
        self.lanterns = []             # lit lantern tiles (radius 2 Lit)
        self.jammed_doors = set()

    # -- geometry ---------------------------------------------------------

    def in_bounds(self, p):
        return 0 <= p[0] < self.w and 0 <= p[1] < self.h

    def walkable(self, p, for_ghost=False):
        if p in self.rubble:
            return False
        k = self.kind.get(p)
        if k in ("floor", "van"):
            return self.furn.get(p) != "tall" or for_ghost
        if k == "door":
            return self.door_open[p] or for_ghost
        return False

    def room(self, p):
        return self.room_of.get(p)

    def room_tiles(self, name):
        return [p for p, r in self.room_of.items() if r == name]

    def chebyshev(self, a, b):
        return max(abs(a[0] - b[0]), abs(a[1] - b[1]))

    # -- line of sight (01 §4.2) -----------------------------------------

    def blocks_los(self, p):
        k = self.kind.get(p)
        if k == "wall":
            return True
        if k == "door" and not self.door_open[p]:
            return True
        if self.furn.get(p) == "tall":
            return True
        return False  # windows and open doors pass LOS

    def los(self, a, b):
        """Tile-center raycast (Bresenham); endpoints never block themselves."""
        x0, y0 = a
        x1, y1 = b
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            if (x0, y0) == (x1, y1):
                return True
            if (x0, y0) != a and self.blocks_los((x0, y0)):
                return False
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    # -- sound (01 §4.6): -1 per tile, -3 per closed door, walls block ----

    def loudness_at(self, src, noise):
        """Dijkstra flood-fill; returns {tile: perceived loudness >= 1}."""
        import heapq
        best = {src: 0}
        heap = [(0, src)]
        out = {}
        while heap:
            cost, p = heapq.heappop(heap)
            if cost > best.get(p, 1e9):
                continue
            if noise - cost >= 1:
                out[p] = noise - cost
            for dx, dy in DIRS8:
                q = (p[0] + dx, p[1] + dy)
                k = self.kind.get(q)
                if k in ("wall", "void", None):
                    continue
                if k == "window" and not self.window_open.get(q, False):
                    continue
                step = 1
                if k == "door" and not self.door_open[q]:
                    step = 4  # 1 tile + 3 closed-door penalty
                nc = cost + step
                if noise - nc < 0:
                    continue
                if nc < best.get(q, 1e9):
                    best[q] = nc
                    heapq.heappush(heap, (nc, q))
        return out

    # -- light (01 §4.5) --------------------------------------------------

    def powered(self, room):
        return self.breaker_on and self.fixture_on.get(room, False)

    def light_level(self, p, rnd=0):
        """'lit' | 'dim' | 'dark' for a floor tile."""
        room = self.room(p)
        if room == "Van":
            return "lit"
        if room and self.powered(room) and rnd >= self.fixture_dead_until.get(room, 0):
            return "lit"
        for lp in self.lanterns:
            if self.chebyshev(p, lp) <= 2:
                return "lit"
        for dx, dy in DIRS8:
            q = (p[0] + dx, p[1] + dy)
            qr = self.room(q)
            if qr and qr != "Van" and self.powered(qr) and rnd >= self.fixture_dead_until.get(qr, 0):
                return "dim"
            if any(self.chebyshev(q, lp) <= 2 for lp in self.lanterns) and self.walkable(q):
                return "dim"
        return "dark"

    # -- temperature (05; Hantu coupling per 02) --------------------------

    def tick_temperature(self, ghost_room=None, ghost_is_hantu=False):
        for name in self.temp:
            if name == "Van":
                continue
            t = self.temp[name]
            if self.furnace_on:
                t = min(21, t + 2)
            open_window_here = any(
                self.window_open[wp] and self.room_adjacent_to_window(name, wp)
                for wp in WINDOWS
            )
            if open_window_here:
                t = max(4, t - 1)
            if ghost_is_hantu and name == ghost_room and not self.furnace_on:
                # Occupied rooms cool at double rate (HT-3) — but a running
                # furnace outpaces it: restoring heat IS the Warming Rite.
                t = max(2, t - 2)
            self.temp[name] = t

    def room_adjacent_to_window(self, name, wp):
        for dx, dy in DIRS4:
            if self.room((wp[0] + dx, wp[1] + dy)) == name:
                return True
        return False

    # -- pathfinding ------------------------------------------------------

    def path(self, start, goal, blocked=(), for_ghost=False,
             through_walls=False, doors_ok=False):
        """BFS shortest path (Chebyshev steps). Returns list of tiles after
        start, or None. Ghosts (for_ghost) pass closed doors and tall
        furniture but never the van; doors_ok is specialist route PLANNING —
        closed doors passable (they will be opened), everything else strict.
        through_walls is the Wraith."""
        from collections import deque
        if start == goal:
            return []
        blocked = set(blocked)
        q = deque([start])
        prev = {start: None}
        while q:
            p = q.popleft()
            for dx, dy in DIRS8:
                n = (p[0] + dx, p[1] + dy)
                if n in prev or not self.in_bounds(n):
                    continue
                if through_walls:
                    if self.kind.get(n) in ("void", None):
                        continue
                    if self.kind.get(n) == "van":
                        continue  # the van is beyond the tether (01 §10.3)
                else:
                    passable = self.walkable(n, for_ghost=for_ghost) or \
                        (doors_ok and self.kind.get(n) == "door")
                    if not passable:
                        continue
                    if for_ghost and self.kind.get(n) == "van":
                        continue
                    if n in blocked and n != goal:
                        continue
                prev[n] = p
                if n == goal:
                    out = [n]
                    while prev[out[-1]] != start:
                        out.append(prev[out[-1]])
                    return list(reversed(out))
                q.append(n)
        return None
