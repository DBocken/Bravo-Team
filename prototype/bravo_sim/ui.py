"""Console UI: map renderer, briefing, status, and the interactive command
loop for playing a contract by hand."""

from . import data
from .world import FARMHOUSE


def render_map(sim):
    site = sim.site
    grid = [list(row) for row in FARMHOUSE]
    for p, line in site.salt_lines.items():
        grid[p[1]][p[0]] = "s" if line["state"] == "intact" else ","
    for p in site.lanterns:
        grid[p[1]][p[0]] = "*"
    for p, open_ in site.door_open.items():
        grid[p[1]][p[0]] = "/" if open_ else "+"
    if sim.anchor_confirmed:
        a = sim.contract.anchor
        grid[a[1]][a[0]] = "A"
    if not sim.alpha["rescued"] and sim.alpha["carried_by"] is None:
        p = sim.alpha["pos"]
        grid[p[1]][p[0]] = "x"
    for s in sim.squad:
        c = s.initials[0]
        if s.downed or s.dead:
            c = c.lower()
        grid[s.pos[1]][s.pos[0]] = c
    if sim.hunt and any(x.mobile() and not x.hidden and
                        sim.site.los(x.pos, sim.gpos) for x in sim.squad):
        grid[sim.gpos[1]][sim.gpos[0]] = "G"
    return "\n".join("".join(r) for r in grid)


def status(sim):
    lines = []
    hunt = "HUNT!" if sim.hunt else ("PRELUDE" if sim.prelude else "")
    pct = ""
    if not sim.hunt and not sim.prelude:
        thr = 40 if sim.contract.true_ghost == "demon" else \
            sim.gdef["hunt_threshold"]
        sub = 30 if sim.contract.true_ghost == "demon" else 50
        if sim.dread >= thr:
            pct = f" · next Hunt check {max(0, sim.dread - sub)}%"
    lines.append(f"— Round {sim.round} · Dread {sim.dread} "
                 f"(floor {sim.dread_floor}){pct} {hunt}")
    wid = sim.journal.working_id
    wname = data.GHOSTS[wid]["name"] if wid else "(none — file the ID)"
    lines.append(f"  Working ID: {wname} · Rite: "
                 f"{data.GHOSTS[wid]['rite']['name'] if wid else '—'} · "
                 f"banked {sim.channel_banked}")
    for s in sim.squad:
        state = "DEAD" if s.dead else ("DOWN" if s.downed else
                                       ("hidden" if s.hidden else ""))
        rat = " RATTLED" if s.rattled and s.mobile() else ""
        inv = ",".join(data.REAGENT_NAMES[i] for i in s.items) or "—"
        lines.append(f"  {s.name:7} {s.cls:9} HP {max(0, s.hp):2} "
                     f"Comp {s.composure:3} AP {s.ap} @{s.pos} "
                     f"{state}{rat} [{inv}]")
    return "\n".join(lines)


def briefing(sim):
    out = ["=" * 64,
           f"CONTRACT — Medium farmhouse · {sim.contract.difficulty.upper()}"]
    out += sim.contract.report
    out.append("=" * 64)
    return "\n".join(out)


def journal_view(sim):
    j = sim.journal
    out = ["FIELD JOURNAL"]
    if not j.entries:
        out.append("  (empty)")
    for i, e in enumerate(j.entries):
        out.append(f"  {i:2}. {e.row()}")
    live = j.candidates()
    names = ", ".join(data.GHOSTS[k]["name"] for k in live) or "NONE"
    out.append(f"  Candidates consistent with Confirmed evidence: {names}")
    if j.impossible():
        out.append("  !! Inconsistent journal — somebody logged a bad read.")
    return "\n".join(out)


HELP = """commands (specialists: v=Vance o=Okafor l=Lis; tiles: x,y):
  map | status | journal | report | help | end
  move <s> <x,y>      sprint <s> <x,y>     door <s> <x,y>
  hide <s> | unhide <s> | steady <s>
  interact <s> <furnace|breaker|light|search|inspect|salt_check|crate> [x,y]
  take <s> <item>     place <s> <item>     channel <s>
  pickup <s> <x,y>    lift <s> | lower <s>
  challenge <ghost>   (hantu demon mare jinn wraith yurei
                       poltergeist banshee revenant shade draugr dybbuk)
  auto                (hand this contract to the bot)
"""


def parse_tile(tok):
    x, y = tok.split(",")
    return int(x), int(y)


def play(sim):
    from .bot import Bot
    print(briefing(sim))
    print(HELP)
    bot = None
    sim.start_player_phase()
    while not sim.over:
        print(render_map(sim))
        print(status(sim))
        if bot:
            bot.take_turn()
        else:
            while True:
                try:
                    raw = input("> ").strip()
                except EOFError:
                    return
                if not raw:
                    continue
                t = raw.split()
                cmd = t[0].lower()
                try:
                    if cmd == "end":
                        break
                    elif cmd == "auto":
                        bot = Bot(sim)
                        break
                    elif cmd == "help":
                        print(HELP)
                    elif cmd == "map":
                        print(render_map(sim))
                    elif cmd == "status":
                        print(status(sim))
                    elif cmd == "journal":
                        print(journal_view(sim))
                    elif cmd == "report":
                        print(briefing(sim))
                    elif cmd == "challenge":
                        print(sim.act_challenge(t[1])[1])
                    else:
                        s = sim.spec(t[1])
                        if s is None:
                            print("who?")
                            continue
                        if cmd == "move":
                            print(sim.act_move(s, parse_tile(t[2]))[1])
                        elif cmd == "sprint":
                            print(sim.act_move(s, parse_tile(t[2]), True)[1])
                        elif cmd == "door":
                            print(sim.act_door(s, parse_tile(t[2]))[1])
                        elif cmd == "hide":
                            print(sim.act_hide(s)[1])
                        elif cmd == "unhide":
                            print(sim.act_unhide(s)[1])
                        elif cmd == "steady":
                            print(sim.act_steady(s)[1])
                        elif cmd == "interact":
                            pos = parse_tile(t[3]) if len(t) > 3 else None
                            print(sim.act_interact(s, t[2], pos)[1])
                        elif cmd == "take":
                            print(sim.take_from_crate(s, t[2])[1])
                        elif cmd == "place":
                            print(sim.act_place(s, t[2])[1])
                        elif cmd == "channel":
                            print(sim.act_channel(s)[1])
                        elif cmd == "pickup":
                            print(sim.act_pickup(s, parse_tile(t[2]))[1])
                        elif cmd == "lift":
                            print(sim.act_lift(s)[1])
                        elif cmd == "lower":
                            print(sim.act_lower(s)[1])
                        else:
                            print("unknown command — try `help`")
                except (IndexError, ValueError):
                    print("bad arguments — try `help`")
        mark = len(sim.log_lines)
        sim.advance()
        for line in sim.log_lines[mark:]:
            print(line)
    finish(sim)


def finish(sim):
    print()
    print(f"CONTRACT OVER — {str(sim.outcome).upper()}")
    total, lines = sim.debrief()
    for ln in lines:
        print("  " + ln)
    print(f"  PAYOUT: {total}")
