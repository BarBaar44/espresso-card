# Espresso Card: notes for working on this repo

HACS dashboard card (Lovelace) for the owner's espresso machine on a smart plug. Owner: BarBaar44 (Bb). Sister repos with the same conventions: [appliance-card](https://github.com/BarBaar44/appliance-card) (the reference), [vacuum-card](https://github.com/BarBaar44/vacuum-card), [room-card](https://github.com/BarBaar44/room-card), [tesla-model3-card](https://github.com/BarBaar44/tesla-model3-card) and [Heating-Control-Card](https://github.com/BarBaar44/Heating-Control-Card).

## Files

| File | Purpose |
|---|---|
| `espresso-card.js` | The whole card: plain custom element, no build step, no dependencies. `ESPRESSO_DEFAULTS` holds the owner's entities and thresholds, `ESPRESSO_COLORS` the colours, `ESPRESSO_MACHINE` / `ESPRESSO_POUR` the two drawn icons. |
| `tests/espresso-card.test.js` | jsdom tests: off, warming up with countdown, ready after the drop, pulse and reheat while ready, history check after reload, state override, thresholds, actions, config errors. `npm test`. |
| `hacs.json` | HACS manifest (HA 2024.11+). |
| `README.md` | User docs, also the HACS info page. Keep the option, entity, decision and colour tables in sync with the code. |
| `CHANGELOG.md` | One `## vX.Y.Z` section per release; the Release workflow uses it as the release notes. |
| `shot.png` | README image, linked by absolute raw URL so it renders in HACS. |
| `espresso.yaml` | Minimal and full example configs. |

## Measured behaviour (7 sessions, 9 to 16 Oct 2026)

* Off: plug off, 0 W.
* Warming up: about 1,040 W (1,010 to 1,075) without a break for 13.7 to 14.4 min.
* Ready: the first reading below 50 W after switch-on (standby about 2.6 W).
* While ready: single 5 s thermostat pulses of 50 to 1,000 W, and 1 to 5 min reheat blocks at about 1,000 W after a shot or steaming. Still ready.
* Sessions last about 2 to 3.5 hours.

## Rules to keep

* The ready moment is latched per session (keyed on the switch's `last_changed`). Without the latch, a pulse or a shot within 20 min of switch-on reads as "warming up" again. Do not drop it.
* After a page load the card has not seen the drop. When it would show warming up, it asks `history/history_during_period` once per session for the power since switch-on; any reading below `ready_below` latches ready. A failed call is ignored (the timeout still ends the warm-up).
* A valid `state` entity value always wins; other values fall back to the detection.
* Progress caps at 99% until the machine is actually ready.
* The card never hardcodes service calls: tap (`toggle`) and hold (`more-info`) go through `hass-action`.
* Layout: 3 columns by 2 rows (84px wide on a 360px phone section, 124px on 520px desktop), 120px high. Text has a short and a long version (`.short` / `.long`), switched by a container query at 90px; measure in a real browser (Playwright) after any text or layout change. Nothing may truncate at 84px.
* mdi has no espresso machine: both icons are drawn inline SVG. The ready animation (drops, cup filling and dipping) and the warming pulse and shimmer stop under reduced motion.
* Re-render only when one of the card's own entities changes, plus a 30 s refresh for the countdown and duration. DOM built once per config, updated in place.
* The whole file sits in one block scope so its top-level names cannot clash with sister cards loaded as classic scripts; `const VERSION` stays on its own line for the Release workflow.

## Releasing

1. Bump `VERSION`, add the CHANGELOG section, commit, push to `main`, check Validate is green.
2. The owner pushes the `vX.Y.Z` tag. **Never tag or release without the owner's explicit go.** Claude sessions here cannot push tags or create releases anyway.
3. Changes marked "no release yet" go to `main` without a version bump.
