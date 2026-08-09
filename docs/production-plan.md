# Bravo Team — vom Prototyp zum kommerziellen Early-Access-Titel

*Revision 2 — Engine-Entscheidung revidiert, X-COM-Aktionsebene ergänzt.*

## Kontext

Bravo Team existiert heute als **Design-Paket plus zwei Wegwerf-Prototypen**. Das Design ist ungewöhnlich vollständig (11 Dokumente, 3.479 Zeilen, mit `[LOCKED]`/`[OPEN]`-Kanon). Der Code ist es nicht: Die Regel-Engine existiert **zweimal** — 2.361 Zeilen Python unter `prototype/bravo_sim/` und ein 1.046-zeiliger JavaScript-Zwilling in `prototype/web/field-console.html` (Zeilen 358–1402). Die beiden driften bereits an neun konkreten Stellen auseinander, die RNGs sind verschieden (dasselbe „Seed 7" ist in beiden Builds ein anderes Spiel), es gibt kein Build-System, keine CI, kein `LICENSE`, keine Speicherfunktion — und die Fassung, die Spieler anfassen, hat **null Tests**.

Das Produktziel ist ein verkaufsfähiger **Steam-Early-Access-Titel**, Premium, solo mit KI-Assistenz, mit allen 12 Geistern.

Zwei Anforderungen sind seit Revision 1 dazugekommen und ändern den Plan substanziell:

- **Eine Aktionsebene im Sinne von X-COM.** Das Spiel soll nicht nur Deduktion sein, sondern taktisch gespielt werden.
- **Grafik- und Sound-Ansprüche der Spieler.** Handgeschriebenes three.js erreicht das nicht in vertretbarer Zeit.

Beides zusammen kippt die Engine-Entscheidung aus Revision 1.

---

## Die Engine-Entscheidung, revidiert: Unity 6 + C#

**Revision 1 empfahl, auf dem Web-Stack weiterzubauen — das ziehe ich zurück.** Die Begründung damals war „behalte, was validiert ist". Validiert ist aber die **Regellogik**, und die ist vollständig portabel. Der Renderer (~1.300 Zeilen handgeschriebenes three.js) ist es nicht, und genau er müsste für Animation, VFX und Audioqualität ohnehin neu gebaut werden.

**Der entscheidende Punkt: Der Portierungsaufwand war schon eingeplant.** Revision 1 sah vor, die doppelte Regel-Engine in *eine* Sprache zu überführen. Ob das Ziel TypeScript oder C# heißt, ist ein marginaler Unterschied — nicht ein fundamentaler. Die Engine-Entscheidung kostet also im Wesentlichen nur den Renderer, und der ist bei den neuen Anforderungen ohnehin fällig.

**Warum Unity 6:**

| Grund | Konkret |
|---|---|
| **Offizielle MCP-Integration** | Unity liefert ein eigenes MCP-Package. Claude kann Szenen inspizieren, Assets verwalten, Skripte editieren, Editor-Aktionen auslösen und Tests laufen lassen — nicht nur Code schreiben. Das war bisher das stärkste Argument *gegen* eine Engine bei KI-gestützter Solo-Entwicklung, und es ist weg. |
| **Asset Store** | Der eigentliche Hebel gegen „Spieler sind anspruchsvoll bei Grafik und Sound": Produktionswert **kaufen** statt herstellen. Animationen, VFX, Audio-Bibliotheken, Shader. Für einen Solo-Dev ist das der Unterschied zwischen „sieht nach Prototyp aus" und „sieht nach Produkt aus". |
| **Lizenz unkritisch** | Runtime Fee ist gestrichen. Unity Personal ist kostenlos bis **200.000 $** Umsatz, Splash Screen in Unity 6 optional. Ein EA-Solo-Titel liegt lange darunter. |
| **Das Design-Paket wird wieder gültig** | `docs/design/09-tech-architecture.md` spezifiziert bereits Unity 6 LTS + URP + C#, inklusive Determinismus-Regeln und Content-Pipeline. Statt das Kapitel zu ersetzen, wird es umgesetzt. |
| **Animation und Kamera** | Mecanim, Timeline und Cinemachine sind genau das, was die X-COM-Aktionsbeats brauchen (Reaktionsschlag mit Kameraschnitt). Handgeschrieben ist das Monatsarbeit. |

**Die Absicherung gegen Unity:** Unity hat die Branche mit der Runtime Fee einmal verbrannt. Deshalb wird der Regelkern als **engine-agnostische C#-Klassenbibliothek ohne eine einzige `UnityEngine`-Referenz** gebaut — exakt so, wie doc 09 §2.1 es fordert. Godot 4 unterstützt C#. Ein Engine-Wechsel würde damit nur den Renderer kosten, nicht das Spiel. Das ist keine theoretische Vorsicht: Es ist dieselbe Disziplin, die den aktuellen Fork überhaupt erst hätte verhindern können.

**Unreal wäre falsch.** Höchste Fidelity, aber für ein rundenbasiertes Top-Down-Spiel massiv überdimensioniert, C++/Blueprint statt C#, 5 % Royalty über 1 Mio. $. Der Fidelity-Vorsprung zahlt sich bei einer Kamera aus, die von schräg oben auf eine Diorama-Szene schaut, kaum aus.

**Was aus dem Web-Build wird:** Er bleibt bis zum Unity-Vertical-Slice das spielbare Artefakt und Marketing-Vehikel — und er ist die lebende Referenz, gegen die der C#-Kern verifiziert wird. Danach wird er eingefroren, nicht weiterentwickelt.

---

## Die X-COM-Aktionsebene

### Das Problem, das gelöst werden muss

X-COMs taktische Grammatik ist um **Gegner töten** herum gebaut. Bravo Teams Geist **kann nicht getötet werden** — das ist Kanon und zugleich die IP-Abgrenzung zu Phasmophobia. Man kann Deckung und Overwatch also nicht einfach anschrauben.

Die Lösung: X-COMs Grammatik nicht kopieren, sondern **übersetzen** — von *Schaden austeilen* nach *Verweigern, Verzögern, Überleben*. Jedes X-COM-Verb bekommt ein Bravo-Team-Gegenstück, und fast alle davon existieren im Design bereits in Rohform.

### Die Übersetzungstabelle

| X-COM | Bravo Team | Existiert bereits? |
|---|---|---|
| **Overwatch** | **Ward Watch** — Restliche AP halten einen Sichtsektor. Betritt der Geist ihn in der Geisterphase, löst eine Reaktion aus: Bannstoß, gebrochener Ansturm, erzwungener Umweg. | Neu — **das wichtigste einzelne Element** |
| Deckung (halb/voll) | **Deckung und geweihter Boden** — Schwere Möbel geben Deckungswerte mit X-COMs Schild-Pips. Salzlinien sind „Deckung, die man baut". | Möbel blockieren bereits LOS; Salzlinien existieren |
| Trefferchance in Prozent | **Sichtbare Strike-Chance** — Während einer Hunt zeigt jeder Spezialist in der Sichtlinie des Geistes seine Trefferwahrscheinlichkeit, modifiziert durch Deckung, Distanz, Steadied und Wards. | Hunt-Odds werden bereits sichtbar angezeigt |
| Fähigkeiten mit Cooldown | **Klassen-Actives** — 3 pro Klasse | In `docs/design/04-squad-and-gear.md` bereits vollständig designt |
| Suppression | **Binding** — Der Warden bindet den Geist für eine Phase, Kosten: 2 AP und Dread | Neu |
| Pod-Aktivierung | **Hunt Prelude** — die eine Phase Vorwarnung | Existiert |
| Zerstörbare Deckung | **Der Collapse** — Schutt blockiert Kacheln, Licht fällt aus | Existiert |
| Evac-Timer | **Der 10-Runden-Countdown** | Existiert |

**Ward Watch ist der Kern.** Heute ist die Geisterphase passives Bangen: Man endet den Zug und hofft. Ward Watch verwandelt sie in eine **Wette** — genau die Spannung, die X-COMs Overwatch erzeugt. Man gibt Bewegung auf, um einen Korridor zu verriegeln, und erfährt erst in der Geisterphase, ob es die richtige Wette war. Das ist der stärkste Zugewinn an Spielgefühl im ganzen Plan und er kostet mechanisch wenig, weil das 2-AP-System und die Sichtlinien schon stehen.

### Die Regel, die verhindert, dass beide Spiele verwässern

Ein Deduktionsspiel mit angeschraubter Taktik wird beides halb. Deshalb ein **sauberer Phasenschnitt**:

- **Ruhephase = Detektivspiel.** Deduktion, Journal, Suchen, Rite vorbereiten. Keine Kampfverben, keine Deckungsanzeige.
- **Hunt und Collapse = X-COM.** Deckung, Ward Watch, Fähigkeiten, sichtbare Zahlen, Reaktionsbeats.

Das gibt dem Spiel zwei klar getrennte Rhythmen und repariert nebenbei die schwächste Stelle des aktuellen Designs: Die Hunt ist heute „verstecken und beten". Künftig ist sie das, was man am meisten fürchtet **und** am liebsten spielt.

### Was die Aktionsebene an Präsentation braucht

X-COMs Overwatch-Schuss lebt vom Kameraschnitt, dem Sound und der eingeblendeten Zahl. Genau dafür wird die Engine gekauft: Cinemachine für den Reaktionsbeat, Timeline für die Fähigkeits-Choreografie, ein echtes Audio-Bus-System für den Aufprall. Das ist der Punkt, an dem sich die Engine-Entscheidung konkret auszahlt.

---

## Zielbild: Was im EA-Build steckt

| Bereich | EA-Umfang | Verschoben |
|---|---|---|
| Geister | **12** (bereits designt und im Prototyp implementiert) | Die 4 Post-Launch-Geister als Update-Kadenz |
| Sites | **2** (Gorse End Farm M + 5 Vesper Close S/Tutorial) | Die L-Site wird das erste große EA-Update |
| Klassen | **4** (Ritualist, Warden, Scout, Medic) | — |
| Aktionsebene | Ward Watch, Deckung, sichtbare Strike-Chance, 3 Actives pro Klasse, Binding | Fortgeschrittene Combos, Reaktionsketten |
| Spezialisten | **5** | 5 weitere |
| Items | **14** von 24 | Composure-Consumables, Duplikat-Sensoren |
| Schwierigkeit | Alle 5 Stufen inkl. Blackout | — |
| Meta | Contract Board, Standing, Codex, Roster, Ökonomie, Debrief | Research Board, Advisors, Seasons |
| Monetarisierung | **Keine.** Einmalkauf. | `docs/design/08-*` komplett |

> **Abweichung von der ursprünglichen Auswahl:** 4 Klassen statt 3, und 2 Sites statt 3. Der Medic trägt den Alpha heraus und der Collapse macht genau das zum Signature-Moment — streichen spart wenig und kostet viel. Die dritte Site fällt stattdessen, weil Level-Design bei Solo-Entwicklung der teuerste Posten ist und der Aktionsebene der Vorrang gebührt.

**Der Replay-Motor ist nicht die Geisterzahl, sondern das Misidentifikations-System.** Deduktions-Content wird *permanent verbraucht*: Wer einmal weiß, woran man einen Hantu erkennt, weiß es für immer. Was sich erneuert, ist der falsche Recon-Report auf Veteran+ und das Fehlen jeder ID auf Blackout. Die Aktionsebene hilft hier zusätzlich, weil taktische Situationen sich anders als Rätsel *nicht* verbrauchen.

---

## Was der Markt vorgibt

1. **Der EA-Launch *ist* der Launch.** Nur 20 % von 225 untersuchten Titeln verdienten zu 1.0 mehr als während Early Access; der Median der ersten 30 Tage nach 1.0 liegt bei 40 % des ersten EA-Monats. Nichts Gutes zurückhalten.
2. **Wishlists vor dem EA-Launch sind die entscheidende Größe.** 5.000 ist die Untergrenze, 7.000+ ein solider Plan, ~12 % wandeln in Day-One-Käufe.
3. **68–88 % der Wishlists kommen von Leuten, die die Demo nie gespielt haben** — das **Capsule-Art ist der höchste ROI im Projekt**.
4. **Shadows of Doubt ist die Warnung:** dasselbe Profil (Solo, prozedural, Deduktion, Single-Player, EA), von ~90 % auf 81 % gesackt, weil die Generierung repetitive und unlösbare Fälle produzierte.
5. **Othercide ist die Genre-Warnung:** rundenbasierte Horror-Taktik, IGN 9/10, Publisher — trotzdem nur ~2.500–5.000 Reviews.

**Positionierung:** gegen *The Case of the Golden Idol*, *Strange Horticulture*, *Darkest Dungeon* — nicht gegen Phasmophobia. Der Aufhänger ist die **Aufräumtrupp**-Fantasie. Mit der Aktionsebene rückt *Darkest Dungeon* und *XCOM* als Vergleichsanker nach vorn, was für die Store-Seite besser trägt als reine Deduktion.

---

## Technische Spur

### Phase 0 — Fundament (Wochen 1–3)

- `LICENSE` (proprietär) und `NOTICE`. **Blocker für kommerziellen Vertrieb, existiert heute nicht.**
- Unity-6-Projekt, URP, C#, .NET-Solution mit getrennten Projekten.
- Unity MCP anbinden, damit Claude den Editor bedienen kann.
- Git LFS für Binärassets. CI (GitHub Actions): `build → test`.

Zielstruktur:

```
src/HV.Sim/          Regelkern. Reines C#, KEINE UnityEngine-Referenz. Deterministisch.
src/HV.Sim.Tests/    xUnit — die 13 Invarianten + Golden Replays
src/HV.Bot/          Autoplay-Policy + Monte-Carlo-Farm (dotnet CLI)
unity/               Unity-Projekt. Nur View, Input und Präsentation.
archive/             Python- und Web-Prototyp, eingefroren als Referenz
```

### Phase 1 — Einen Regelkern bauen (Wochen 3–12)

**Der wichtigste Posten des Plans.** Heute kostet jede Änderung doppelt und landet an einer Stelle.

1. Den SIM-Block aus `prototype/web/field-console.html:358–1402` nach `HV.Sim` in C# portieren. Die JS-Seite ist die Referenz, nicht Python — sie ist neuer und enthält Fixes, die Python nie bekam.
2. Die **9 bekannten Divergenzen** einzeln entscheiden und dokumentieren. Kritisch: Python verliert beim Suchen mit vollen Händen das Item und macht Contracts still unlösbar (Fix nur in JS); `strike()` ist in Python einweg, in JS ein Toggle mit Neuberechnung.
3. **Ganzzahl-/Festkomma-Arithmetik statt Floats**, wie doc 09 §2.3 fordert. Jede Wahrscheinlichkeitsgrenze wird neu abgeleitet — das ist Balance-Arbeit, keine mechanische Umschreibung.
4. **Command/Event-Grenze.** Heute greift die UI **224-mal** direkt in Sim-Interna. Künftig `Sim.Apply(cmd) → SimEvent[]` plus explizites Read-Model. Voraussetzung für Speichern, Replay und die Golden-Tests.
5. `Snapshot()` / `Restore()` / `StateHash()`.
6. Die **13 Checks aus `prototype/bravo_sim/selftest.py`** als echte xUnit-Invarianten. Die statistischen Behauptungen (`assert ban >= 4` von 6 Seeds) gehören in die Farm, nicht in die Testsuite — sonst werden sie beim ersten Balancing stummgeschaltet.
7. `bot.py` (633 Zeilen) nach `HV.Bot` portieren und dabei die **hartkodierten Kartenkoordinaten** (`SWEEP_TARGETS`, `SALT_SPOTS`, `FLEE_SPOTS`) durch kartenagnostische Zielsuche ersetzen — sonst zerbricht die Balance-Farm an Site 2.

### Phase 2 — Aktionsebene entwerfen und im Kern verankern (Wochen 10–18)

- Ward Watch, Deckungswerte, sichtbare Strike-Chance, Binding und die 12 Klassen-Actives als Commands und Events im Regelkern — **vor** jeder Präsentation.
- Der Bot lernt die neuen Verben. Ohne das ist die Balance-Farm blind für die halbe Taktik.
- Monte-Carlo-Neubalancierung: Die Aktionsebene verschiebt jede Hunt-Überlebenskurve.
- **Design-Prüfung:** Die Ruhephase darf keine Kampfverben anbieten. Wird als Test formuliert.

### Phase 3 — Content-Pipeline (Wochen 14–22)

Ziel: **Ein neuer Geist ist eine Datendatei, kein Eingriff an zehn Codestellen.** Heute kostet Geist #13 Änderungen in `data.py`, `world.py`, `contracts.py`, **acht Methoden in `sim.py`**, `bot.py` und `ui.py` — und dann alles nochmal in JS.

- Geist = Behaviour-Pack (`tells`, `tellEmitters`, `movement`, `huntProfile`, `rite`, `backfire`) mit deklarativen Emittern statt der 184-zeiligen 12-fach-Verzweigung in `_interaction()`.
- Site = Datenformat, damit Site 2 keinen Code braucht.
- **Alle Tuning-Konstanten in einen versionierten Katalog** — heute sind Composure-Deltas, Schaden, Wahrnehmungsradien und jede Wahrscheinlichkeit Inline-Literale in beiden Sprachen, `MOVE/SPRINT/CARRY_MOVE` sogar dreifach unabhängig deklariert.
- **Alle Spielertexte in ID-basierte Tabellen** — nachträglich würde das jede Regeldatei anfassen.
- Build-brechende Validatoren für alle Content-Dateien.

### Phase 4 — Meta-Ebene und Persistenz (Wochen 18–26)

Heute gibt es **kein Speichern** — ein Reload verliert den Contract, entgegen der eigenen README-Zusage.

- Save = Command-Log + periodischer Snapshot, pro Zug geschrieben. Kein Speichern-Knopf (Design-Kanon).
- Meta-Save: Standing, Codex, Roster, Geld, Freischaltungen.
- Office-Hub reduziert: Contract Board, Roster, Codex, Debrief. Standing (6 Stufen) schaltet Schwierigkeiten, Sites und Hires frei.
- Codex = 48 Tells + 12 Backfire-Signaturen als 60-Felder-Fortschritt, gefüllt nur aus bestätigten Feldbeweisen.

### Phase 5 — Präsentation (Wochen 22–34)

Hier wird die Engine-Entscheidung eingelöst.

- Szene, Beleuchtung und Materialien in URP. Die Diorama-Kamera und der Cutaway-Wand-Spec aus `docs/design/10-art-audio-narrative.md` sind bereits detailliert beschrieben.
- **Asset Store gezielt einkaufen:** Charakteranimationen, VFX für Fähigkeiten und Bann, Audio-Bibliotheken. Das ist der Budgetposten, der „anspruchsvolle Spieler" beantwortet.
- Cinemachine für die Reaktionsbeats, Timeline für Fähigkeits-Choreografie.
- Audio über FMOD oder Unity-Audio-Busse — die prozedurale Modalsynthese aus dem Web-Build ist als Designreferenz gut, als Shipping-Audio zu dünn.
- FTUE-Politur: Die ersten zehn Minuten entscheiden über die Review.
- Barrierefreiheit: Farbfehlsichtigkeit, Textgröße, Motion-Reduktion, Assist-Toggles.

### Phase 6 — Produktreife und Steam (Wochen 30–40)

- Steamworks: Achievements, Cloud Saves, Rich Presence.
- Settings, Rebinding, Fenstermodi, Auflösungsskalierung.
- Crash-Reporting (Sentry) — ein Solo-Dev erfährt sonst nichts von Abstürzen.
- **Design-Schulden aus `prototype/FINDINGS.md` einarbeiten.** Blocker: **F1 — der spät erkannte Demon ist mit 1/6 Bann-Rate bei 45 Runden praktisch unspielbar**, und er ist ausgerechnet das Marquee-Szenario des Kanons.
- **Den Collapse kanonisieren.** Er existiert nur in `docs/design/01-core-gameplay.md:278–291`, fehlt in Glossar und Loop-Diagramm, seine Punktwerte (+120/−200) fehlen in der eigenen Scoring-Tabelle, und §8.3 sagt an anderer Stelle das Gegenteil („Dread friert ein, die Site wird still"). Er ist inzwischen das beste Element des Spiels.

---

## Kommerzielle Spur (parallel ab Monat 4)

| Monat | Schritt |
|---|---|
| 4 | **Steam-Seite live.** Capsule-Art beauftragen (~500–2.000 €) — wichtigster Einzelposten des Budgets. |
| 4–5 | **Wishlist-Diagnose:** erste zwei Wochen messen. 100 = Bronze, 500 = Silber, 1.200 = Gold. Unter 100 heißt: Positionierung oder Capsule ändern — **jetzt**, nicht nach einem weiteren Jahr Bauzeit. |
| 5–10 | Devlog-Kadenz. Taktik- und Detektiv-Kuratoren. Die Aktionsebene liefert deutlich bessere GIFs als reine Deduktion — das ist marketingrelevant. |
| 11 | **Demo veröffentlichen — deutlich vor Next Fest.** Titel, die das tun, holen ~2,5× so viele Wishlists. |
| 12–13 | **Steam Next Fest.** Multiplikator, kein Zündfunke: mit <1.000 Wishlists holt man im Median ~460. |
| 14–18 | **EA-Launch** bei ≥7.000 Wishlists. Preis **16,99 €**, 1.0 später **21,99 €**. |

**Steam-Mechaniken:** Nach einer Preiserhöhung sind **30 Tage lang keine Rabatte erlaubt**. Und Steam heftet seit Februar 2025 **automatisch einen „verlassen"-Hinweis** an EA-Titel ohne Build oder News-Post binnen 12 Monaten — die Community-Erwartung ist deutlich enger. **Alle 6–8 Wochen ein Build oder Post** ist Betriebsanforderung.

---

## Der ehrliche Preis dieser Revision

Engine-Wechsel plus Aktionsebene passen **nicht** in die ursprünglichen 9–12 Monate. Realistisch sind **14–18 Monate** bis EA. Was das erkauft: ein Spiel, das gegen aktuelle Produktionsstandards antreten kann, statt gegen sie zu verlieren — und eine taktische Ebene, die sich im Gegensatz zu Rätseln nicht verbraucht.

Der Puffer, falls es enger wird, in dieser Reihenfolge: die zweite Site fällt (EA startet mit einer), dann Binding, dann zwei der vier Klassen. **Ward Watch und die sichtbare Strike-Chance fallen nie** — ohne sie gibt es keine Aktionsebene, nur Dekoration.

---

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| **Der Engine-Wechsel frisst die Zeitersparnis auf** | Der Regelkern ist engine-agnostisches C# und wird gegen den eingefrorenen Web-Build verifiziert. Der Renderer ist die einzige echte Neuarbeit. |
| **Aktionsebene verwässert das Deduktionsspiel** | Sauberer Phasenschnitt: Ruhephase = Detektiv, Hunt/Collapse = X-COM. Als Test formuliert, nicht als Vorsatz. |
| **Deduktions-Content verbraucht sich permanent** | Replay-Motor ist misID/Blackout, nicht die Geisterliste. Taktik verbraucht sich nicht. |
| **Prozedurale Unlösbarkeit** (der Shadows-of-Doubt-Tod) | Nächtliche Solvability-Farm in CI: *jeder* generierte Contract muss lösbar sein, sonst bricht der Build. |
| **Unity ändert erneut die Lizenz** | Regelkern ohne `UnityEngine`-Referenz; Godot 4 spricht C#. Ein Wechsel kostet den Renderer, nicht das Spiel. |
| **Enge Nische** (Othercide) | Gegen Golden Idol/Darkest Dungeon positionieren. Preis am unteren Rand. |
| **Mediane Marktergebnisse sind ernüchternd** | Die Wishlist-Diagnose in Monat 4–5 ist ein echtes Go/No-Go-Tor, kein Ritual. |

---

## Verifikation

```bash
dotnet build && dotnet test              # 13 Invarianten + Golden Replays grün
dotnet run --project src/HV.Bot -- --contracts 10000
                                          # Bänder pro Geist/Stufe eingehalten,
                                          # 100 % Solvability, sonst Exit 1
# Unity: Play Mode Tests + Build-Pipeline über Unity MCP angestoßen
```

Abnahmekriterien:

1. **Genau eine Regel-Engine.** Die Hunt-Logik existiert an *einer* Stelle.
2. **Determinismus:** gleicher Seed + gleiches Command-Log ⇒ identischer `StateHash()`, als Golden-Test in CI.
3. **`HV.Sim` enthält keine einzige `UnityEngine`-Referenz** — per Test erzwungen.
4. **Ein neuer Geist ist eine Datendatei** — nachgewiesen an einem der vier Post-Launch-Geister ohne Code-Änderung.
5. **Solvability-Gate:** 10.000 Contracts, kein einziger unlösbar.
6. **Ward Watch funktioniert im Kern**, nicht nur in der Präsentation: Der Bot nutzt es und die Farm zeigt eine messbar veränderte Hunt-Überlebensrate.
7. **Speichern überlebt einen Reload** mitten im Contract, inklusive Journal-Zustand.
8. **Balance-Bänder:** Standard ≥ 11/12 Geister bannbar, **der Demon über 1/6**.
9. **Steam-Build startet** auf einer sauberen Windows-VM.

---

## Zuerst anfangen

Phase 0 blockiert alles andere und ist in Tagen erledigt: `LICENSE` und `NOTICE`, Unity-6-Projekt, Solution-Struktur mit `HV.Sim` als reinem C#-Projekt, Unity MCP angebunden, CI. Danach sofort Phase 1 — der doppelte Regelkern kostet jeden Tag doppelt, und die Steam-Seite soll in Monat 4 live gehen, damit der Markt antwortet, bevor der Großteil der Bauzeit investiert ist.
