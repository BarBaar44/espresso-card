# Changelog

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
