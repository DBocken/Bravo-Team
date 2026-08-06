"""CLI entry point.

  python -m bravo_sim --auto --seed 7 --difficulty veteran   # watch the bot
  python -m bravo_sim --play --seed 7                        # play by hand
  python -m bravo_sim --selftest                             # run the tests
"""

import argparse

from .sim import Sim
from . import ui


def main():
    ap = argparse.ArgumentParser(prog="bravo_sim")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--difficulty", default="standard",
                    choices=["standard", "veteran", "nightmare", "blackout"])
    ap.add_argument("--auto", action="store_true",
                    help="let the bot play; print the transcript")
    ap.add_argument("--play", action="store_true", help="interactive play")
    ap.add_argument("--misid", action="store_true",
                    help="force a misidentified Recon Report")
    ap.add_argument("--ghost", default=None,
                    help="force the true ghost (hantu demon mare jinn wraith yurei)")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        from . import selftest
        raise SystemExit(selftest.run())

    sim = Sim(seed=args.seed, difficulty=args.difficulty,
              force_misid=True if args.misid else None,
              force_ghost=args.ghost)
    if args.play:
        ui.play(sim)
        return
    # default: auto
    from .bot import run_auto
    print(ui.briefing(sim))
    run_auto(sim)
    for line in sim.log_lines:
        print(line)
    print()
    print(ui.journal_view(sim))
    ui.finish(sim)


if __name__ == "__main__":
    main()
