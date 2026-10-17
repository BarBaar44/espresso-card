# Espresso Card: notes for working on this repo

HACS dashboard card (Lovelace) for the owner's espresso machine on a smart plug. Owner: BarBaar44 (Bb). Sister repos with the same conventions: [appliance-card](https://github.com/BarBaar44/appliance-card) (the reference), [vacuum-card](https://github.com/BarBaar44/vacuum-card), [room-card](https://github.com/BarBaar44/room-card), [tesla-model3-card](https://github.com/BarBaar44/tesla-model3-card) and [Heating-Control-Card](https://github.com/BarBaar44/Heating-Control-Card).

## Files

| File | Purpose |
|---|---|
| `espresso-card.js` | The whole card: plain custom element, no build step, no dependencies. `ESPRESSO_DEFAULTS` holds the owner's entities and thresholds, `ESPRESSO_COLORS` the colours, `ESPRESSO_MACHINE` / `ESPRESSO_POUR` the two drawn icons. |
| `tests/espresso-card.test.js` | jsdom tests: off, warming up with countdown, ready after the drop, pulse and reheat while ready, history check after reload, state override, thresholds, actions, config errors, editor round trips. `npm test`. |
| `hacs.json` | HACS manifest (HA 2024.11+). |
| `README.md` | User docs, also the HACS info page. Keep the option, entity, decision and colour tables in sync with the code. |
| `CHANGELOG.md` | One `## vX.Y.Z` section per release; the Release workflow uses it as the release notes. |
| `shot.png` | README image, linked by absolute raw URL so it renders in HACS. |
| `espresso.yaml` | Minimal and full example configs. |

## Measured behaviour (8 sessions, 9 to 16 Oct 2026)

* Off: plug off, 0 W.
* Switch-on: the power sensor still reads 0 W, the first reading after it (~5 s) is standby (0.5 to 69 W), the heater shows from the second reading (~10 s).
* Warming up: about 1,040 W (1,010 to 1,075) without a break for 13.7 to 14.4 min.
* Ready: the first reading below 50 W after the heater ran (standby about 2.6 W).
* While ready: single 5 s thermostat pulses of 50 to 1,000 W, and 1 to 5 min reheat blocks at about 1,000 W after a shot or steaming. Still ready.
* Sessions last about 2 to 3.5 hours.

## Rules to keep

* The ready moment is latched per session (keyed on the switch's `last_changed`). Without the latch, a pulse or a shot within 20 min of switch-on reads as "warming up" again. Do not drop it.
* A drop below `ready_below` only counts after the heater was seen (above `heating_above`) in the session: the standby reading right after switch-on is not ready. Each power state object counts once as a reading (`_lastPower`), so the tick does not count readings twice.
* Before the heater is seen the card shows warming up for at most `ESPRESSO_HEATER_GRACE_MS` (30 s) after switch-on, not until `warmup_timeout`: otherwise a page opened on a ready machine, or the reset `last_changed` after an HA restart, would read "warming up" for 20 min.
* After a page load the card has not seen the drop. When it shows warming up with the heater on, it asks `history/history_during_period` once per session for the power since switch-on and walks it in order: heater first, then the first reading below `ready_below`. A failed call is ignored (the timeout still ends the warm-up).
* The heating hint needs 3 readings in a row above `heating_above` or 15 s (a timer re-renders at 15 s), and hides on the first lower reading. Single thermostat pulses never show it. While it shows, the status reads "Reheating" and the pour animation stands still (class `reheat`); still the ready state: green, "on for", ready icon.
* Visual editor (`EspressoCardEditor`, on `ha-form`): fields show the defaults; only non-defaults are written; a cleared optional entity is written as `null`, a cleared switch or number falls back to the default (the card needs them); unknown keys are kept. Keep `ESPRESSO_ENTITY_FIELDS` and `ESPRESSO_NUMBER_FIELDS` in sync with `ESPRESSO_DEFAULTS`.
* A valid `state` entity value always wins; other values fall back to the detection.
* Progress caps at 99% until the machine is actually ready.
* The card never hardcodes service calls: tap (`toggle`) and hold (`more-info`) go through `hass-action`.
* Centred layout, level with the Mushroom tile next to it (measured in Bb's dashboard): 36px icon 17px from the card top, name baseline 44px above the card bottom in every state. Off and unavailable hide the detail line and put the status baseline at 20px, level with the Mushroom status; on, status and detail follow under the name (detail 8px from the bottom). The reheat flame sits absolute top right. The off icon is the full machine in grey.
* Browser renders: the `ha-card` stub must not set `display` inline, or it overrides the card's flex layout and the render lies.
* Layout: 3 columns by 2 rows (84px wide on a 360px phone section, 124px on 520px desktop), 120px high. Text has a short and a long version (`.short` / `.long`), switched by a container query at 90px; measure in a real browser (Playwright) after any text or layout change. Nothing may truncate at 84px.
* mdi has no espresso machine: both icons are drawn inline SVG. The ready animation (drops, cup filling and dipping) and the warming pulse and shimmer stop under reduced motion.
* Re-render only when one of the card's own entities changes, plus a 30 s refresh for the countdown and duration. DOM built once per config, updated in place.
* The whole file sits in one block scope so its top-level names cannot clash with sister cards loaded as classic scripts; `const VERSION` stays on its own line for the Release workflow.

## Releasing

1. Bump `VERSION`, add the CHANGELOG section, commit, push to `main`, check Validate is green.
2. The owner pushes the `vX.Y.Z` tag. **Never tag or release without the owner's explicit go.** Claude sessions here cannot push tags or create releases anyway.
3. Changes marked "no release yet" go to `main` without a version bump.
