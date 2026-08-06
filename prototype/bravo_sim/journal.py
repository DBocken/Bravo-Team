"""The Field Journal (03-recon-and-misidentification.md §3).

Entry states: Suspected -> Confirmed by corroboration or instrument logging;
False entries (Rattled observers, 01 §7.3) render identically to true ones and
are revealed only at Debrief. Striking quarantines an entry from filtering.
"""

from . import data


class Entry:
    def __init__(self, turn, observer, atom, text, state="Suspected",
                 hidden_false=False, instrument=False):
        self.turn = turn
        self.observer = observer
        self.atom = atom
        self.text = text
        self.state = state          # Suspected | Confirmed
        self.hidden_false = hidden_false
        self.instrument = instrument
        self.struck = False

    def row(self):
        chip = self.state
        tag = self.observer
        s = "STRUCK " if self.struck else ""
        return f"T{self.turn:<3} [{tag:^10}] {self.text}  <{s}{chip}>"


class Journal:
    def __init__(self, claimed):
        self.entries = []
        self.claimed = claimed        # ghost key or None (Blackout)
        self.working_id = claimed
        self.challenges = 0

    def log(self, turn, observer, atom, hidden_false=False, instrument=False):
        text = data.ATOM_TEXT.get(atom, atom)
        state = "Confirmed" if instrument else "Suspected"
        e = Entry(turn, observer, atom, text, state, hidden_false, instrument)
        self.entries.append(e)
        if not instrument:
            self._corroborate(atom)
        return e

    def _corroborate(self, atom):
        """A second, unstruck sighting of the same atom Confirms all its
        entries (03 §3.1: 'second observation of the same behavior')."""
        live = [e for e in self.entries if e.atom == atom and not e.struck]
        if len(live) >= 2:
            for e in live:
                e.state = "Confirmed"

    def strike(self, idx):
        if 0 <= idx < len(self.entries):
            self.entries[idx].struck = True

    def confirmed_atoms(self):
        return sorted({e.atom for e in self.entries
                       if e.state == "Confirmed" and not e.struck})

    def candidates(self):
        return data.candidates(self.confirmed_atoms())

    def impossible(self):
        """The pity detector (03 §3.2): filtering dimmed all tiles."""
        return not self.candidates()

    def verification_atoms(self, new_id, against):
        """Confirmed atoms that discriminate new_id from `against`."""
        if against is None:
            # Blackout filing: verified when evidence narrows to exactly new_id.
            return self.confirmed_atoms() if self.candidates() == [new_id] else []
        return [a for a in self.confirmed_atoms()
                if data.discriminates(a, new_id, against)]

    def challenge(self, turn, new_id):
        """Returns (fee, verified). First challenge free; -50 each after."""
        old = self.working_id
        backfire = any(a == f"backfire_{new_id}" for a in self.confirmed_atoms())
        verified = backfire or len(self.verification_atoms(new_id, old)) >= 2
        fee = 50 if self.challenges >= 1 else 0
        self.challenges += 1
        self.working_id = new_id
        return fee, verified

    def false_entries(self):
        return [e for e in self.entries if e.hidden_false]

    def clean(self):
        """Clean Journal bonus: no unstruck false entries at debrief."""
        return not any(e.hidden_false and not e.struck for e in self.entries)
