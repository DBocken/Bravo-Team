# Field Console — the playable web prototype

A single self-contained HTML file: one contract of Bravo Team, playable in a
browser with no server, no network and no assets on disk. Textures are drawn
to canvases at load, audio is synthesised in WebAudio, and three.js is
vendored inline. It runs from `file://`.

This is a **prototype**, not the product. It exists to prove the loop and to
be the reference the production engine is verified against.

## Layout

```
src/part-head.html    markup, CSS, and the rules engine between
                      /*SIM-BEGIN*/ and /*SIM-END*/ — opens a <script>
                      tag it deliberately does not close
src/part-ui3d.js      three.js renderer, interface and audio — closes it
vendor/three.*.js     substituted into the /*THREE_LIB*/ placeholder
build.mjs             assembles the three into field-console.html
field-console.html    the built artifact (committed — it is what people play)
tools/                verification
```

The sources are split so that the diff of a gameplay change is a gameplay
change, and not 600 KB of vendored library scrolling past. **Edit the files
under `src/`, never `field-console.html`** — it is generated and will be
overwritten.

## Build

```bash
node build.mjs            # writes field-console.html
node build.mjs --check    # fails if the artifact is stale; run before committing
```

The build refuses to produce a file that reaches out to a network host, and
it verifies the vendored library still carries its licence header.

## Verify

```bash
node tools/test-sim.cjs          # rules engine, no browser needed
node tools/verify-client.mjs     # scene, audio, interface, keyboard, fog
node tools/fuzz.mjs              # random real actions across several seeds
```

`test-sim.cjs` lifts the `/*SIM-BEGIN*/…/*SIM-END*/` block straight out of the
built artifact and exercises it in Node — map reachability, line of sight and
sound propagation, misidentification draws, backfire signatures, a scripted
rite, 60-round random play across all twelve ghosts, and the challenge flow.

The browser tools need `playwright-core` and a Chromium. Point at one with
`PW_CHROMIUM=/path/to/chrome` if it is not at the dev-container default.

`tools/imagestat.mjs` decodes a PNG and reports mean luminance, RMS contrast,
edge energy and luminance percentiles. It is how the colour-management fix was
measured rather than eyeballed:

```bash
node tools/imagestat.mjs shot.png 380,250,900,650   # x0,y0,x1,y1 crop
```

## Known limitations

These are deliberate for a prototype and are addressed by the production plan
in `docs/production-plan.md`:

- **The rules engine exists twice.** This file and `prototype/bravo_sim/`
  implement the same specification in two languages, with different random
  number generators — the same seed is a different contract in each. They have
  already diverged in nine known places.
- **No persistence.** A reload loses the contract.
- **No meta layer.** No contract board, standing, codex or economy.
- **One site, three specialists**, both hardcoded.
- Ghost behaviour is branching code rather than data, so a thirteenth ghost
  costs edits in roughly ten places — twice over.
