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
    ap.add_argument("--stats", type=int, metavar="N",
                    help="Monte Carlo: run N seeds per difficulty, print a "
                         "balance table (09-tech-architecture.md, in miniature)")
    args = ap.parse_args()

    if args.selftest:
        from . import selftest
        raise SystemExit(selftest.run())

    if args.stats:
        run_stats(args.stats)
        return

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


def run_stats(n):
    from .bot import run_auto
    print(f"Monte Carlo balance farm — {n} seeds per difficulty\n")
    header = f"{'difficulty':<10} {'banish':>7} {'withdraw':>9} {'failed':>7} " \
             f"{'timeout':>8} {'avg rds':>8} {'avg payout':>11} " \
             f"{'misID':>6} {'solved':>7}"
    print(header)
    print("-" * len(header))
    for diff in ["standard", "veteran", "nightmare", "blackout"]:
        outcomes, rounds, payouts = [], [], []
        misid, misid_solved = 0, 0
        for seed in range(1, n + 1):
            s = run_auto(Sim(seed=seed, difficulty=diff))
            outcomes.append(s.outcome)
            rounds.append(s.round)
            payouts.append(s.debrief()[0])
            if s.contract.misid:
                misid += 1
                if s.outcome == "banished" and \
                        s.journal.working_id == s.contract.true_ghost:
                    misid_solved += 1
        c = outcomes.count
        print(f"{diff:<10} {c('banished'):>7} {c('withdraw'):>9} "
              f"{c('failed'):>7} {c('timeout'):>8} "
              f"{sum(rounds) / len(rounds):>8.1f} "
              f"{sum(payouts) / len(payouts):>11.0f} "
              f"{misid:>6} {misid_solved:>7}")
    print("\n(misID counts apply to veteran/nightmare rolls; 'solved' = "
          "banished under the corrected ID.)")


if __name__ == "__main__":
    main()
