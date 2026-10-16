# Espresso Card

![Espresso Card](https://raw.githubusercontent.com/BarBaar44/espresso-card/main/shot.png)

A small Lovelace tile for an espresso machine on a smart plug: **Off**, **Warming up** with a countdown and progress bar, or **Ready** with how long it has been on. Worked out from the plug's switch and its power reading, no template sensors needed. One JavaScript file, no build step, no dependencies, no card_mod, no Jinja.

* **Warming up:** the machine fills with colour as it heats, with a progress bar and the minutes left ("9 min"; wider tiles add the ready time, "9 min · 14:16"). Progress stops at 99% until the machine is really ready.
* **Ready:** a portafilter drips into a filling cup; "on 25 min", "on for 1 h 12 m".
* **Heating hint:** a small flame while a ready machine reheats (after a shot or steaming). It stays "Ready": the machine is usable.
* Fits 3 columns by 2 rows in a sections view (about 120px high) and works wider too. All animations stop under reduced motion.

## Install

HACS > three dots > Custom repositories > add `https://github.com/BarBaar44/espresso-card`, type **Dashboard**. Install, then reload the browser.

Needs HA 2024.11 or newer.

## Use

```yaml
type: custom:espresso-card
```

That uses the default entities. Another plug:

```yaml
type: custom:espresso-card
name: Gaggia
entities:
  switch: switch.coffee_plug
  power: sensor.coffee_plug_power
```

More in [espresso.yaml](espresso.yaml).

### Options

| Option           | Default                                      |
| ---------------- | -------------------------------------------- |
| `name`           | `Espresso`                                   |
| `entities`       | see below                                    |
| `warmup_minutes` | `14`: expected time to temperature, for the countdown and progress |
| `warmup_timeout` | `20`: after this many minutes it never reads "warming up" again |
| `ready_below`    | `50` W: the first reading below this after switch-on means ready |
| `heating_above`  | `900` W: the heater is on                    |
| `tap_action`     | `toggle` the switch                          |
| `hold_action`    | `more-info` on the switch                    |
| `colors`         | see below                                    |

A misspelled option or entity role shows an error card instead of being ignored.

### Entities

| Role     | Default                                       |                                         |
| -------- | --------------------------------------------- | --------------------------------------- |
| `switch` | `switch.espresso_switch`                      | required; its last change is the switch-on moment |
| `power`  | `sensor.espresso_switch_current_consumption`  | `null`: time only (warming up for `warmup_minutes`) |
| `state`  | none                                          | optional sensor with `Off`, `Warming up` or `Ready`; when set and valid it decides, the rest is fallback |

### How it decides

| State      | When                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| Off        | switch off                                                                |
| Warming up | switch on, power above `heating_above`, on for less than `warmup_timeout`, and the power has not dropped below `ready_below` since switch-on |
| Ready      | switch on and not warming up                                              |

The drop below `ready_below` is remembered for the rest of the session. That is what keeps thermostat pulses and reheat blocks early in a session from looking like a new warm-up. After a page reload in the middle of a warm-up window, the card asks Home Assistant's history once whether the drop already happened.

A `state` sensor with another value (or unavailable) is ignored, so the card falls back to its own detection.

### Colours

`colors` keys, each any CSS colour or theme variable: `warming` (amber), `ready` (green), `heating` (orange, the flame), `off` (grey), `error` (the unavailable text). Each also exists as a `--ec-*` theme variable.

```yaml
colors:
  ready: "#8d6e63"
```

## Notes

* Built from 7 measured sessions of one machine: about 1,040 W without a break for 13.7 to 14.4 minutes, then about 2.6 W standby, with short thermostat pulses and 1 to 5 minute reheat blocks after a shot. Another machine may need other numbers.
* "On for" counts from the switch's last change. Home Assistant resets that on a restart, or when the plug was briefly unavailable, so after either the duration restarts.

## Licence

MIT
