"""Self-contained test suite (no pytest dependency): `python -m bravo_sim --selftest`.

Covers the invariants the design documents promise: grid/sound/LOS rules
(01 §4), Dread and Hunt math (01 §5–6), misID generation drawing only from
confusion pairs (03 §2.2), Backfire-as-clue (03 §5), Journal corroboration
and false-Tell handling (03 §3, 01 §7.3), determinism (09), and end-to-end
bot completion across seeds and difficulties.
"""

from . import data
from .bot import run_auto
from .contracts import Contract
from .sim import Sim
from .world import Site

CHECKS = []


def check(name):
    def deco(fn):
        CHECKS.append((name, fn))
        return fn
    return deco


@check("map parses and every room is reachable from the van")
def _map():
    site = Site()
    start = site.room_tiles("Van")[0]
    for room in ["Kitchen", "Pantry", "Mudroom", "Bedroom", "Cellar", "Hall",
                 "Bathroom", "Living", "Foyer", "Study"]:
        tiles = site.room_tiles(room)
        assert tiles, f"{room} has no tiles"
        target = next(t for t in tiles if site.furn.get(t) is None)
        assert site.path(start, target, for_ghost=True) is not None, \
            f"{room} unreachable"


@check("walls block LOS; open doors and windows pass it")
def _los():
    site = Site()
    assert not site.los((2, 2), (2, 6))          # kitchen -> cellar via wall
    assert site.los((8, 6), (14, 6))             # along the hall
    d = (6, 4)
    assert not site.los((6, 3), (6, 5))          # closed door blocks
    site.door_open[d] = True
    assert site.los((6, 3), (6, 5))              # open door passes


@check("sound attenuates -1/tile and -3 per closed door; walls block")
def _sound():
    site = Site()
    heard = site.loudness_at((8, 6), 5)
    assert heard[(8, 6)] == 5
    assert heard.get((12, 6)) == 1               # 4 tiles down the hall
    assert (2, 2) not in heard                   # kitchen behind wall+door
    site.door_open[(6, 4)] = True
    heard2 = site.loudness_at((6, 5), 5)
    assert (6, 3) in heard2                      # through the open door


@check("hunt checks: generic at Dread>=60, Demon from 40 (d100<=Dread-30)")
def _hunt_math():
    s = Sim(seed=3, force_ghost="wraith")
    s.dread = 59
    assert s._hunt_check() is False              # not eligible below 60
    s2 = Sim(seed=3, force_ghost="demon")
    s2.dread = 39
    assert s2._hunt_check() is False
    s2.dread = 95
    fired = any(s2._hunt_check() for _ in range(30))
    assert fired                                 # 65% per roll, doubled


@check("misID draws only the signature partner; standard is always correct")
def _misid():
    for seed in range(40):
        c = Contract(seed, "standard")
        assert c.claimed == c.true_ghost
    for seed in range(60):
        c = Contract(seed, "veteran", force_misid=True)
        assert c.claimed == data.GHOSTS[c.true_ghost]["partner"]
        assert c.misid


@check("wrong Rite backfires: +15 Dread, signature auto-Confirmed, true ID")
def _backfire():
    s = Sim(seed=5, difficulty="veteran", force_misid=True,
            force_ghost="demon")                 # claimed Hantu, true Demon
    assert s.journal.working_id == "hantu"
    d0 = s.dread
    s._backfire()
    assert s.dread == d0 + 15
    assert "backfire_demon" in s.journal.confirmed_atoms()
    assert s.journal.candidates() == ["demon"]
    fee, verified = s.journal.challenge(s.round, "demon")
    assert verified and fee == 0                 # backfire alone verifies


@check("journal: corroboration confirms; struck entries stop filtering")
def _journal():
    from .journal import Journal
    j = Journal("hantu")
    j.log(1, "LI", "light_kill")
    assert j.candidates() == data.GHOST_KEYS     # Suspected filters nothing
    j.log(2, "VA", "light_kill")
    assert j.confirmed_atoms() == ["light_kill"]
    assert j.candidates() == ["mare"]
    j.strike(0)
    j.strike(1)
    assert j.candidates() == data.GHOST_KEYS     # quarantined


@check("verification needs >=2 discriminating Confirmed atoms")
def _verify():
    from .journal import Journal
    j = Journal("hantu")
    j.log(1, "LI", "temp_flat")
    j.log(2, "VA", "temp_flat")
    fee, verified = j.challenge(3, "demon")
    assert not verified                          # one discriminator only
    j2 = Journal("hantu")
    j2.log(1, "LI", "temp_flat")
    j2.log(2, "VA", "temp_flat")
    j2.log(3, "SALT LINE", "salt_scatter", instrument=True)
    fee, verified = j2.challenge(4, "demon")
    assert verified and fee == 0


@check("a Rattled observer can log a false Tell, hidden until debrief")
def _rattled():
    hit = False
    for seed in range(30):
        s = Sim(seed=seed, force_ghost="yurei")
        v = s.spec("Lis")
        v.composure = 10                          # force Rattled
        v.pos = (20, 6)
        for _ in range(12):
            s.round += 1
            s._interaction()
        if s.journal.false_entries():
            e = s.journal.false_entries()[0]
            assert e.state in ("Suspected", "Confirmed")
            hit = True
            break
    assert hit, "no false Tell produced in 30 seeded attempts"


@check("determinism: same seed, same transcript")
def _determinism():
    a = run_auto(Sim(seed=11, difficulty="veteran"))
    b = run_auto(Sim(seed=11, difficulty="veteran"))
    assert a.log_lines == b.log_lines
    assert a.outcome == b.outcome and a.debrief() == b.debrief()


@check("bot completes contracts on every difficulty without crashing")
def _bot_all():
    outcomes = {}
    for diff in ["standard", "veteran", "nightmare", "blackout"]:
        for seed in range(1, 7):
            s = run_auto(Sim(seed=seed, difficulty=diff))
            assert s.over and s.outcome in ("banished", "withdraw", "failed",
                                            "timeout")
            outcomes.setdefault(diff, []).append(s.outcome)
    ban = outcomes["standard"].count("banished")
    assert ban >= 4, f"standard banish rate too low: {outcomes['standard']}"


@check("bot handles every ghost on standard (rite paths all work)")
def _bot_ghosts():
    wins = 0
    for ghost in data.GHOST_KEYS:
        for seed in (1, 2, 3):
            s = run_auto(Sim(seed=seed, force_ghost=ghost))
            assert s.over
            if s.outcome == "banished":
                wins += 1
                break
        else:
            raise AssertionError(f"bot never banished the {ghost} in 3 seeds")
    assert wins == len(data.GHOST_KEYS)


@check("bot survives forced misID on veteran and re-identifies")
def _bot_misid():
    solved = 0
    for ghost in data.GHOST_KEYS:
        done = False
        for seed in (1, 2, 3, 4):
            s = run_auto(Sim(seed=seed, difficulty="veteran",
                             force_misid=True, force_ghost=ghost))
            assert s.over
            if s.outcome == "banished":
                assert s.journal.working_id == ghost, \
                    "banished without committing the true ID?"
                done = True
                break
        if done:
            solved += 1
    assert solved >= 10, f"misID solved for only {solved}/12 ghosts"


def run():
    failures = 0
    for name, fn in CHECKS:
        try:
            fn()
            print(f"  ok  {name}")
        except Exception as exc:  # noqa: BLE001 — report and continue
            failures += 1
            print(f"FAIL  {name}: {type(exc).__name__}: {exc}")
    print(f"{len(CHECKS) - failures}/{len(CHECKS)} checks passed")
    return 1 if failures else 0
