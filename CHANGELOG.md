# Changelog

## v0.2.0

### Added
* **Visual editor:** name, the switch, power and state entities, the detection thresholds (warm-up time, timeout, ready below, heater on above), tap and hold actions and colours. Every field shows the value in use, defaults included. Clearing the power or state entity switches it off; clearing the switch or a number goes back to its default. Only values that differ from the defaults are written to the YAML, and options the editor does not show are kept.

### Changed
* **Reheating:** while the reheat flame shows (after a shot or steaming), the status reads "Reheating" instead of "Ready". It goes back to "Ready" on the first lower reading, together with the flame.

## v0.1.2

### Changed
* **Centred layout**, like a Mushroom tile: icon, name and status are centred in every state. The icon is 36px, at the same place as a Mushroom tile's icon.
* **Level with a Mushroom tile next to it**, such as the Cat Feeder: the name sits at the same height in every state, so it no longer moves when the machine switches on. When off, "Off" is level with the other tile's status too. When on, the status and the countdown or "on for" follow right under the name.
* The reheat flame moved to the top right corner.

## v0.1.1

Fixes found by checking v0.1.0 against 8 real sessions.

### Fixed
* **"Ready" right at switch-on:** the plug's first reading after switch-on is still standby (0 to 70 W); the heater shows about 10 s later. That reading was taken as the drop to ready. Ready now only counts after the heater has run in the session, both live and in the history check after a page load (walked in order: heater first, then the drop). Within the first 30 s, before the heater starts, the card shows Warming up.
* **Heating hint flickered** on single 5 s thermostat pulses. The flame now needs the heater on for 15 s or 3 readings in a row, and goes as soon as the power drops.
* **Off:** the machine icon showed at a third of its strength, and the text sat a line above the bottom edge. Now the full icon in grey, and "Off" on the bottom line like the other cards.

### Changed
* README: "On for" restarting after a Home Assistant restart is documented under Known limits.

## v0.1.0

First release. A small tile for an espresso machine on a smart plug, in the style of the Vacuum, Appliance, Tesla Model 3 and Heating Control cards.

### Added
* **Off, Warming up, Ready**, detected from the plug's switch and power: warming up while the heater draws above `heating_above` (900 W) within `warmup_timeout` (20 min) of switch-on; ready from the first reading below `ready_below` (50 W). The drop is remembered per session, so thermostat pulses and reheat blocks after a shot stay "Ready". After a page reload the card checks the power history once.
* **Warming up:** countdown from switch-on plus `warmup_minutes` (14), with the ready time on wider tiles, and a progress bar that stops at 99% until the machine is ready. The machine icon fills with colour as it heats.
* **Ready:** how long it has been on ("on for 1 h 12 m"), a portafilter dripping into a filling cup, and a small flame while it reheats.
* Optional `state` entity (Off / Warming up / Ready) that overrides the detection.
* Tap toggles the plug, hold opens more-info, both through Home Assistant's own action handler and configurable.
* Every entity overridable, `power: null` for time only; every colour configurable with `colors`.
* Fits 3 columns by 2 rows in a sections view, short words on narrow tiles. All animations stop under reduced motion.
