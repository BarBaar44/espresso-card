/*
 * Espresso Card
 * A small Lovelace tile for an espresso machine on a smart plug: off,
 * warming up (with a countdown and progress) or ready (with how long it has
 * been on), worked out from the plug's switch and its power reading.
 *
 * Detection, from measured sessions of the owner's machine:
 *   warming up: the heater draws ~1,040 W without a break for about 14 min
 *               (the first reading after switch-on is still standby)
 *   ready:      the first reading below 50 W after the heater ran; from then on
 *               short thermostat pulses and reheat blocks after a shot are
 *               still "ready" (shown as a small heating hint at most)
 * An optional `state` entity (Off / Warming up / Ready) overrides all of it.
 *
 * Tap and hold go through Home Assistant's own action handler (hass-action);
 * the card never hardcodes a service call.
 *
 * https://github.com/BarBaar44/espresso-card  (MIT)
 */

// Everything sits in one block so the top-level names cannot clash with the
// sister cards when the files are loaded as classic scripts.
{
const VERSION = "0.2.2";

const ESPRESSO_HOLD_MS = 500;
const ESPRESSO_MOVE_PX = 10;
const ESPRESSO_TICK_MS = 30000; // countdown and "on for" stay current
// At switch-on the plug first reports standby (0 to 70 W); the heater shows from the
// second reading, about 10 s later. Until the heater is seen, a low reading is not "ready".
const ESPRESSO_HEATER_GRACE_MS = 30000;
// Thermostat pulses are single 5 s readings; a reheat after a shot runs for minutes.
const ESPRESSO_HEAT_HINT_MS = 15000;
const ESPRESSO_HEAT_HINT_READINGS = 3;

const ESPRESSO_DEFAULTS = {
  name: "Espresso",
  warmup_minutes: 14, // estimated time to temperature, for countdown and progress
  warmup_timeout: 20, // after this many minutes it is never "warming up" any more
  ready_below: 50, // W: the first reading below this after switch-on means ready
  heating_above: 900, // W: the heater is on
  entities: {
    switch: "switch.espresso_switch",
    power: "sensor.espresso_switch_current_consumption",
    state: null, // optional template sensor: Off / Warming up / Ready
  },
};

/* colors key -> CSS variable and default. */
const ESPRESSO_COLORS = {
  warming: ["--ec-warming", "var(--amber-color, #ffc107)"],
  ready: ["--ec-ready", "var(--green-color, #4caf50)"],
  heating: ["--ec-heating", "var(--orange-color, #ff9800)"],
  off: ["--ec-off", "var(--disabled-color, #9e9e9e)"],
  error: ["--ec-error", "var(--error-color, #db4437)"],
};

/* Words a `state` sensor may use, lower case, to the card's three states. */
const ESPRESSO_STATE_WORDS = {
  off: "off",
  "warming up": "warming", warming_up: "warming", warming: "warming", "heating up": "warming", heating_up: "warming",
  ready: "ready", on: "ready",
};

const ESPRESSO_BAD = ["unknown", "unavailable", "none", ""];
const espressoNum = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v));
const espressoKey = (v) => String(v == null ? "" : v).trim().toLowerCase();

/* The machine, front view (warming up and off). Drawn here: mdi has no espresso machine. */
const ESPRESSO_MACHINE = `<rect x="2" y="2" width="20" height="6.5" rx="1.5"/><rect x="2" y="8.5" width="3" height="11.5"/><rect x="19" y="8.5" width="3" height="11.5"/><rect x="9" y="8.5" width="6" height="2.2"/><rect x="8" y="10.7" width="8" height="1.8" rx=".9"/><path d="M9 15h5.5v2.4a2 2 0 0 1-2 2h-1.5a2 2 0 0 1-2-2z"/><rect x="2" y="20" width="20" height="2" rx="1"/>`;
/* Portafilter dripping into a cup that fills (ready). */
const ESPRESSO_DRIP = "M9 13.4c.9 1.2 1.3 1.9 1.3 2.4a1.3 1.3 0 0 1-2.6 0c0-.5.4-1.2 1.3-2.4z";
const ESPRESSO_POUR = `<defs><clipPath id="ec-cup-in"><path d="M5.6 17h6.8v2.4a1.8 1.8 0 0 1-1.8 1.8h-3.2a1.8 1.8 0 0 1-1.8-1.8z"/></clipPath></defs><path d="M2.5 3h12v2.8a6 6 0 0 1-12 0z"/><rect x="14" y="4" width="8.5" height="2.2" rx="1.1" transform="rotate(18 14 5.1)"/><rect x="7.8" y="11.6" width="2.4" height="1.6" rx=".4"/><path class="drip d1" d="${ESPRESSO_DRIP}"/><path class="drip d2" d="${ESPRESSO_DRIP}"/><g class="cup"><g clip-path="url(#ec-cup-in)"><rect class="liquid" x="5" y="16.5" width="8" height="5"/></g><path fill="none" stroke="currentColor" stroke-width="1.3" d="M4.9 16.6h8.2v2.9a2.3 2.3 0 0 1-2.3 2.3h-3.6a2.3 2.3 0 0 1-2.3-2.3z"/><path d="M13.5 17.2h1a1.6 1.6 0 0 1 0 3.2h-1.2v-1.2h1.2a.4.4 0 0 0 0-.8h-1z"/></g>`;

const ESPRESSO_STYLE = `
  :host {
${Object.values(ESPRESSO_COLORS).map(([v, d]) => `    ${v}: ${d};`).join("\n")}
    --ec-soft: var(--secondary-background-color, rgba(127,127,127,.15));
  }
  ha-card {
    height: 100%; box-sizing: border-box; padding: 16px 6px 0; overflow: hidden; position: relative;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    container-type: inline-size;
    cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none; touch-action: manipulation;
  }
  ha-card.pressed { opacity: .7; }
  ha-card:focus-visible { box-shadow: 0 0 0 2px var(--primary-color); }

  /* Centred like a Mushroom tile: the 36px icon, the name and (when off) the status sit
     exactly level with one next to it. Off: name baseline 44px and status 20px above the
     bottom edge; on, the name stays put and status and detail follow it closely. */
  .top { display: flex; justify-content: center; }
  .icon {
    width: 36px; height: 36px; border-radius: 50%; flex: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent);
    transition: background-color .3s, color .3s;
  }
  .icon svg { width: 24px; height: 24px; display: block; overflow: visible; fill: currentColor; }
  .stack { position: relative; width: 24px; height: 24px; }
  .stack svg { position: absolute; inset: 0; }
  .stack .base { opacity: .35; }
  .stack .fill { clip-path: inset(calc((1 - var(--p, 0)) * 100%) 0 0 0); }
  .icon .machine, .icon .pour { display: none; }
  .icon.show-machine .machine, .icon.show-pour .pour { display: block; }
  .heat { display: none; position: absolute; top: 8px; right: 8px; color: var(--ec-heating); }
  .heat.show { display: flex; }
  .heat ha-icon { --mdc-icon-size: 16px; display: flex; }

  .text { min-width: 0; width: 100%; margin-top: 9px; }
  .name { font-size: 14px; font-weight: 500; line-height: 18px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status, .detail { font-size: 12px; line-height: 16px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .err .status { color: var(--ec-error); }
  .nodetail .detail { display: none; }
  .nodetail .status { margin-top: 8px; }
  .detail { display: flex; align-items: center; justify-content: center; gap: 6px; height: 16px; font-variant-numeric: tabular-nums; }
  .detail .words { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .bar { display: none; flex: 1; min-width: 16px; height: 4px; border-radius: 2px; background: var(--ec-soft); overflow: hidden; }
  .bar i { display: block; height: 100%; width: 0; background: var(--c); border-radius: 2px; transition: width .4s; }
  .warming .bar { display: block; }
  .warming .detail .words { flex: none; }
  /* Narrow tiles (3 columns on a phone) get the short words, wider ones the long. */
  .long { display: none; }
  @container (min-width: 90px) {
    .short { display: none; }
    .long { display: inline; }
  }

  /* Warming up: a slow pulse around the icon and a shimmer on the filling machine. */
  .warming .icon { animation: ec-pulse 2s ease-out infinite; }
  .warming .stack .fill { animation: ec-shimmer 2.4s ease-in-out infinite; }
  @keyframes ec-pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 40%, transparent); }
    100% { box-shadow: 0 0 0 8px transparent; }
  }
  @keyframes ec-shimmer { 50% { filter: brightness(1.35); } }

  /* Ready: drops fall, the cup fills and dips on each drop. */
  .drip { opacity: 0; transform-box: fill-box; }
  .ready .drip { animation: ec-drip 1.2s ease-in infinite; }
  .ready .d2 { animation-delay: .6s; }
  .ready .cup { animation: ec-bob .6s ease-in-out .42s infinite; }
  .liquid { transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(.8); }
  .ready .liquid { animation: ec-fill 4.8s linear infinite; }
  /* Reheating: the pour stands still (no drops, cup at rest) until the heater stops. */
  .ready.reheat .drip, .ready.reheat .cup, .ready.reheat .liquid { animation: none; }
  @keyframes ec-drip {
    0% { transform: translateY(-1px); opacity: 0; }
    10% { opacity: 1; }
    75% { transform: translateY(1.6px); opacity: 1; }
    85%, 100% { transform: translateY(2px); opacity: 0; }
  }
  @keyframes ec-bob { 0%, 100% { transform: translateY(0); } 20% { transform: translateY(.7px); } 50% { transform: translateY(-.2px); } }
  @keyframes ec-fill { 0% { transform: scaleY(.1); } 85%, 100% { transform: scaleY(1); } }

  @media (prefers-reduced-motion: reduce) {
    .icon, .icon *, .bar i { animation: none !important; transition: none !important; }
    .drip { opacity: 0 !important; }
    .liquid { transform: scaleY(.8) !important; }
  }
`;

class EspressoCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._seen = Object.create(null);
    this._ids = [];
    this._tick = null;
    this._session = null; // switch-on moment of the session the card is watching
    this._readyAt = null; // when the power first dropped below ready_below in that session
    this._historyAsked = null; // session for which the power history was requested
    this._resetSession(null);
  }

  /* Per-session memory: the ready moment, whether the heater ran, the current heat block. */
  _resetSession(session) {
    this._session = session;
    this._readyAt = null;
    this._historyAsked = null;
    this._heaterSeen = false;
    this._heatSince = null; // first reading of the current run above heating_above
    this._heatReadings = 0; // readings in that run
    this._lastPower = undefined; // the power state object last counted as a reading
    clearTimeout(this._heatTimer);
    this._heatTimer = null;
  }

  static getConfigElement() {
    return document.createElement("espresso-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    const c = config || {};
    const known = ["type", "name", "entities", "warmup_minutes", "warmup_timeout", "ready_below", "heating_above",
      "tap_action", "hold_action", "colors", "grid_options", "layout_options", "view_layout", "visibility", "card_mod"];
    for (const k of Object.keys(c)) {
      if (!known.includes(k)) throw new Error(`Unknown option '${k}'. Known: ${known.slice(1, 11).join(", ")}`);
    }
    const ent = c.entities == null ? {} : c.entities;
    if (typeof ent !== "object" || Array.isArray(ent)) throw new Error("entities must be a map, e.g. switch: switch.my_plug");
    for (const [k, v] of Object.entries(ent)) {
      if (!(k in ESPRESSO_DEFAULTS.entities)) {
        throw new Error(`entities: unknown role '${k}'. Known: ${Object.keys(ESPRESSO_DEFAULTS.entities).join(", ")}`);
      }
      if (v !== null && (typeof v !== "string" || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(v))) {
        throw new Error(`entities.${k}: '${v}' is not an entity id (null switches it off)`);
      }
    }
    const entities = { ...ESPRESSO_DEFAULTS.entities, ...ent };
    if (!entities.switch) throw new Error("entities.switch is required");

    const number = (k, min) => {
      const v = c[k] == null ? ESPRESSO_DEFAULTS[k] : espressoNum(c[k]);
      if (v === null || v < min) throw new Error(`${k} must be a number of at least ${min}`);
      return v;
    };
    const warmup = number("warmup_minutes", 1);
    const timeout = number("warmup_timeout", 1);
    const below = number("ready_below", 0);
    const above = number("heating_above", 0);
    if (timeout < warmup) throw new Error("warmup_timeout must not be shorter than warmup_minutes");
    if (above <= below) throw new Error("heating_above must be higher than ready_below");
    if (c.colors != null && (typeof c.colors !== "object" || Array.isArray(c.colors))) {
      throw new Error("colors must be a map, e.g. ready: green");
    }

    this._config = {
      name: c.name || ESPRESSO_DEFAULTS.name,
      entities,
      warmup: warmup * 60000,
      timeout: timeout * 60000,
      below,
      above,
      tap_action: c.tap_action || { action: "toggle" },
      hold_action: c.hold_action || { action: "more-info" },
      colors: c.colors || {},
    };
    this._applyColors(this._config.colors);
    this._ids = Object.values(entities).filter(Boolean);
    this._seen = Object.create(null);
    this._resetSession(null);
    this._build();
    if (this._hass) this._update();
  }

  _applyColors(colors) {
    Object.keys(colors).forEach((k) => {
      if (!ESPRESSO_COLORS[k]) console.warn(`espresso-card: unknown colors key "${k}". Known: ${Object.keys(ESPRESSO_COLORS).join(", ")}`);
    });
    Object.entries(ESPRESSO_COLORS).forEach(([k, [v]]) => {
      const val = typeof colors[k] === "string" && colors[k].trim() ? colors[k].trim() : null;
      if (val) this.style.setProperty(v, val);
      else this.style.removeProperty(v);
    });
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    let changed = first;
    for (const id of this._ids) {
      const s = hass.states[id];
      if (s !== this._seen[id]) {
        this._seen[id] = s;
        changed = true;
      }
    }
    if (changed) this._update();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => this._update(), ESPRESSO_TICK_MS);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
    clearTimeout(this._heatTimer);
    this._heatTimer = null;
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: 3, rows: 2, min_columns: 3, min_rows: 2 };
  }

  /* ---- DOM, built once per config ---------------------------------------- */

  _build() {
    this.shadowRoot.innerHTML = `
      <style>${ESPRESSO_STYLE}</style>
      <ha-card role="button" tabindex="0">
        <div class="top">
          <div class="icon">
            <div class="stack machine"><svg class="base" viewBox="0 0 24 24">${ESPRESSO_MACHINE}</svg><svg class="fill" viewBox="0 0 24 24">${ESPRESSO_MACHINE}</svg></div>
            <svg class="pour" viewBox="0 0 24 24">${ESPRESSO_POUR}</svg>
          </div>
          <div class="heat" title="Heating"><ha-icon icon="mdi:fire"></ha-icon></div>
        </div>
        <div class="text">
          <div class="name"></div>
          <div class="status"></div>
          <div class="detail"><div class="bar"><i></i></div><span class="words"></span></div>
        </div>
      </ha-card>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this._el = {
      card: $("ha-card"), icon: $(".icon"), stack: $(".stack"), heat: $(".heat"), name: $(".name"),
      status: $(".status"), fill: $(".bar i"), words: $(".detail .words"),
    };
    this._el.name.textContent = this._config.name;
    this._bindPress(this._el.card);
  }

  /* ---- actions ------------------------------------------------------------ */

  _bindPress(el) {
    let timer = null;
    let start = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      start = null;
      el.classList.remove("pressed");
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      start = { x: e.clientX, y: e.clientY };
      el.classList.add("pressed");
      timer = setTimeout(() => {
        timer = null;
        held = true;
        el.classList.remove("pressed");
        this._run(this._config.hold_action, "hold");
      }, ESPRESSO_HOLD_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > ESPRESSO_MOVE_PX) cancel();
    });
    el.addEventListener("pointerup", () => {
      if (!start) return;
      const wasHeld = held;
      cancel();
      if (!wasHeld) this._run(this._config.tap_action, "tap");
    });
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      this._run(this._config.tap_action, "tap");
    });
  }

  /* Hands an action to Home Assistant's own handler, like built-in cards do. */
  _run(conf, kind) {
    if (!conf || conf.action === "none") return;
    window.dispatchEvent(new CustomEvent("haptic", { detail: kind === "hold" ? "medium" : "light" }));
    const config = { entity: this._config.entities.switch };
    config[kind === "hold" ? "hold_action" : "tap_action"] = conf;
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true, composed: true, detail: { config, action: kind },
    }));
  }

  /* ---- state -------------------------------------------------------------- */

  _s(role) {
    const id = this._config.entities[role];
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  _power() {
    const s = this._s("power");
    return s && !ESPRESSO_BAD.includes(espressoKey(s.state)) ? espressoNum(s.state) : null;
  }

  /*
   * What the machine is doing: { kind: off | warming | ready | unavailable, onAt, heating }.
   * The ready moment is latched per session (switch-on), so thermostat pulses and
   * reheat blocks after a shot never turn a ready machine back into "warming up".
   */
  _detect(now) {
    const sw = this._s("switch");
    const swState = sw ? espressoKey(sw.state) : "unavailable";
    const onAt = sw && swState === "on" ? Date.parse(sw.last_changed) : NaN;
    const power = this._power();

    // A new session starts at every switch-on.
    const session = swState === "on" ? sw.last_changed : null;
    if (session !== this._session) this._resetSession(session);

    // Count each new power reading once (the tick and other entities re-run this too).
    const reading = this._s("power");
    if (session && reading !== this._lastPower) {
      this._lastPower = reading;
      if (power !== null && power > this._config.above) {
        this._heaterSeen = true;
        if (this._heatSince === null) this._heatSince = now;
        this._heatReadings++;
      } else {
        this._heatSince = null;
        this._heatReadings = 0;
        // Ready is the first drop below ready_below after the heater ran, never the standby reading at switch-on.
        if (this._heaterSeen && power !== null && power < this._config.below && this._readyAt === null) this._readyAt = now;
      }
    }

    let kind;
    const override = this._s("state");
    const word = override && ESPRESSO_STATE_WORDS[espressoKey(override.state)];
    if (word) {
      kind = word;
    } else if (swState === "off") {
      kind = "off";
    } else if (swState !== "on") {
      kind = "unavailable";
    } else {
      const age = isNaN(onAt) ? Infinity : now - onAt;
      const early = age < this._config.timeout;
      if (this._readyAt !== null) kind = "ready";
      else if (power === null) kind = age < this._config.warmup ? "warming" : "ready"; // no power reading: time only
      else if (early && power > this._config.above) kind = "warming";
      else if (early && !this._heaterSeen && age < ESPRESSO_HEATER_GRACE_MS) kind = "warming"; // heater about to start
      else kind = "ready";
      if (kind === "warming" && power !== null && power > this._config.above) this._checkHistory(onAt);
    }

    // The hint needs a run of readings above heating_above: a single thermostat pulse never shows it.
    let heating = false;
    clearTimeout(this._heatTimer);
    this._heatTimer = null;
    if (kind === "ready" && power !== null && power > this._config.above && this._heatSince !== null) {
      const due = this._heatSince + ESPRESSO_HEAT_HINT_MS;
      heating = this._heatReadings >= ESPRESSO_HEAT_HINT_READINGS || now >= due;
      if (!heating && this.isConnected) this._heatTimer = setTimeout(() => this._update(), due - now + 50);
    }
    return { kind, onAt: isNaN(onAt) ? null : onAt, heating };
  }

  /*
   * After a page load the card has not seen the drop itself. If the machine looks
   * like it is warming up, ask HA once per session for the power since switch-on.
   * Walked in order: first the heater (above heating_above), then the first reading
   * below ready_below after it. Found both: this is a reheat, the machine is ready.
   * The standby reading at switch-on comes before the heater and never counts.
   */
  _checkHistory(onAt) {
    const session = this._session;
    const id = this._config.entities.power;
    if (!id || isNaN(onAt) || this._historyAsked === session || !this._hass || typeof this._hass.callWS !== "function") return;
    this._historyAsked = session;
    Promise.resolve()
      .then(() => this._hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(onAt).toISOString(),
        entity_ids: [id],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      }))
      .then((res) => {
        if (this._session !== session || this._readyAt !== null) return;
        const rows = (res && res[id]) || [];
        let heater = false;
        for (const r of rows) {
          const v = espressoNum(r.s !== undefined ? r.s : r.state);
          const t = r.lu !== undefined ? r.lu * 1000 : Date.parse(r.last_updated || r.last_changed);
          if (v === null) continue;
          if (v > this._config.above) heater = true;
          else if (heater && v < this._config.below) {
            this._heaterSeen = true;
            this._readyAt = isNaN(t) ? Date.now() : t;
            this._update();
            return;
          }
        }
        if (heater) this._heaterSeen = true;
      })
      .catch(() => {}); // no history: the time limit still ends the warm-up
  }

  _lang() {
    const h = this._hass;
    return (h && h.locale && h.locale.language) || (h && h.language) || "en";
  }

  _clock(ms) {
    const tz = this._hass && this._hass.config && this._hass.config.time_zone;
    const opts = { hour: "2-digit", minute: "2-digit", hour12: false };
    try {
      return new Intl.DateTimeFormat(this._lang(), tz ? { ...opts, timeZone: tz } : opts).format(new Date(ms));
    } catch (_) {
      return new Intl.DateTimeFormat("en-GB", opts).format(new Date(ms));
    }
  }

  /* "25 min", "1 h 12 m"; short: "25 min", "1h 12m" */
  _duration(ms, short) {
    const m = Math.max(0, Math.floor(ms / 60000));
    if (m < 60) return `${m} min`;
    return short ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)} h ${m % 60} m`;
  }

  /* Plain text, or a short and a long version; CSS shows the one that fits. */
  _text(el, short, long) {
    const key = long && long !== short ? `${short}\u0000${long}` : short;
    if (el._shown === key) return;
    el._shown = key;
    if (long && long !== short) {
      el.innerHTML = '<span class="short"></span><span class="long"></span>';
      el.firstChild.textContent = short;
      el.lastChild.textContent = long;
    } else {
      el.textContent = short;
    }
  }

  _update() {
    if (!this._hass || !this._el) return;
    const e = this._el;
    const now = Date.now();
    const st = this._detect(now);
    const k = st.kind;

    const colour = k === "warming" ? "warming" : k === "ready" ? "ready" : "off";
    e.card.style.setProperty("--c", `var(${ESPRESSO_COLORS[colour][0]})`);
    e.card.classList.toggle("warming", k === "warming");
    e.card.classList.toggle("ready", k === "ready");
    e.card.classList.toggle("reheat", k === "ready" && st.heating);
    e.card.classList.toggle("err", k === "unavailable");
    e.card.classList.toggle("nodetail", k === "off" || k === "unavailable");
    e.icon.classList.toggle("show-pour", k === "ready");
    e.icon.classList.toggle("show-machine", k !== "ready");
    e.heat.classList.toggle("show", st.heating);

    let status;
    let statusLong = null;
    let words = "";
    let wordsLong = null;
    let title = "";
    let progress = 0;
    if (k === "warming") {
      status = "Warming";
      statusLong = "Warming up";
      if (st.onAt !== null) {
        const eta = st.onAt + this._config.warmup;
        const left = eta - now;
        progress = Math.min(0.99, Math.max(0, (now - st.onAt) / this._config.warmup));
        const count = left > 59000 ? `${Math.ceil(left / 60000)} min` : left > 0 ? "<1 min" : "soon";
        words = count;
        wordsLong = `${count} · ${this._clock(eta)}`;
        title = `Ready around ${this._clock(eta)}`;
      }
    } else if (k === "ready") {
      status = st.heating ? "Working" : "Ready"; // ready again once the reheat block ends
      if (st.onAt !== null) {
        words = `on ${this._duration(now - st.onAt, true)}`;
        wordsLong = `on for ${this._duration(now - st.onAt)}`;
      }
      if (st.heating) title = "Heating";
    } else if (k === "off") {
      status = "Off";
    } else {
      status = "Unavailable";
    }
    this._text(e.status, status, statusLong);
    this._text(e.words, words, wordsLong);
    e.stack.style.setProperty("--p", k === "warming" ? String(progress) : "1"); // off: the whole machine in grey
    e.fill.style.width = `${Math.round(progress * 100)}%`;
    e.card.title = title;
    e.card.setAttribute("aria-label", `${this._config.name}: ${status}${title ? `, ${title.toLowerCase()}` : ""}`);
  }
}

/* ------------------------------------------------------------------------ */
/* Visual editor                                                            */
/* ------------------------------------------------------------------------ */

/*
 * Built on HA's own <ha-form>. Every field shows the value in use, defaults
 * included; only values that differ from the defaults are written to the
 * YAML. Clearing an optional entity switches that part off (null); clearing
 * the switch or a number goes back to its default. Options the editor does
 * not show (grid_options, ...) are kept.
 */

const ESPRESSO_ENTITY_FIELDS = [
  ["switch", "Plug switch (required)", ["switch", "input_boolean", "light"]],
  ["power", "Power reading", ["sensor"]],
  ["state", "State sensor (optional: Off, Warming up, Ready)", ["sensor", "input_select", "select"]],
];
const ESPRESSO_REQUIRED = ["switch"];

const ESPRESSO_NUMBER_FIELDS = [
  ["warmup_minutes", "Warm-up time", 1, 60, "min"],
  ["warmup_timeout", "Never warming up after", 1, 120, "min"],
  ["ready_below", "Ready below", 0, 3000, "W"],
  ["heating_above", "Heater on above", 0, 3000, "W"],
];

const ESPRESSO_EDITOR_SCHEMA = [
  { name: "name", selector: { text: {} } },
  {
    type: "expandable",
    name: "entities",
    title: "Entities",
    icon: "mdi:power-plug",
    expanded: true,
    schema: ESPRESSO_ENTITY_FIELDS.map(([role, , domains]) => ({
      name: role,
      selector: { entity: { filter: { domain: domains } } },
    })),
  },
  {
    type: "expandable",
    name: "",
    title: "Detection",
    icon: "mdi:flash",
    schema: [{
      type: "grid",
      name: "",
      schema: ESPRESSO_NUMBER_FIELDS.map(([k, , min, max, unit]) => ({
        name: k,
        selector: { number: { min, max, step: 1, mode: "box", unit_of_measurement: unit } },
      })),
    }],
  },
  {
    type: "expandable",
    name: "",
    title: "Actions",
    icon: "mdi:gesture-tap",
    schema: [
      { name: "tap_action", selector: { ui_action: { default_action: "toggle" } } },
      { name: "hold_action", selector: { ui_action: { default_action: "more-info" } } },
    ],
  },
  {
    type: "expandable",
    name: "colors",
    title: "Colours",
    icon: "mdi:palette",
    schema: [{
      type: "grid",
      name: "",
      schema: Object.keys(ESPRESSO_COLORS).map((k) => ({ name: k, selector: { text: {} } })),
    }],
  },
];

const ESPRESSO_EDITOR_LABELS = {
  name: "Name",
  tap_action: "Tap action",
  hold_action: "Hold action",
  warming: "warming up",
  heating: "heating hint",
  error: "unavailable",
  ...Object.fromEntries(ESPRESSO_ENTITY_FIELDS.map(([k, label]) => [k, label])),
  ...Object.fromEntries(ESPRESSO_NUMBER_FIELDS.map(([k, label]) => [k, label])),
};

class EspressoCardEditor extends HTMLElement {
  /* config -> form data: defaults filled in, null shown as empty. */
  static toData(config) {
    const ent = config.entities || {};
    const entities = {};
    for (const role of Object.keys(ESPRESSO_DEFAULTS.entities)) {
      const v = role in ent ? ent[role] : ESPRESSO_DEFAULTS.entities[role];
      entities[role] = v || "";
    }
    const data = {
      name: config.name == null ? ESPRESSO_DEFAULTS.name : config.name,
      entities,
      tap_action: config.tap_action,
      hold_action: config.hold_action,
      colors: { ...(config.colors || {}) },
    };
    for (const [k] of ESPRESSO_NUMBER_FIELDS) {
      const v = espressoNum(config[k]);
      data[k] = v == null ? ESPRESSO_DEFAULTS[k] : v;
    }
    return data;
  }

  /* form data -> config: only what differs from the defaults. */
  static toConfig(data, previous) {
    const config = { type: "custom:espresso-card" };
    const handled = ["type", "name", "entities", "tap_action", "hold_action", "colors",
      ...ESPRESSO_NUMBER_FIELDS.map(([k]) => k)];
    for (const [k, v] of Object.entries(previous || {})) {
      if (!handled.includes(k)) config[k] = v;
    }
    if (data.name != null && data.name !== ESPRESSO_DEFAULTS.name) config.name = data.name;
    const entities = {};
    for (const [role, def] of Object.entries(ESPRESSO_DEFAULTS.entities)) {
      const v = (data.entities || {})[role];
      if (!v) {
        if (def && !ESPRESSO_REQUIRED.includes(role)) entities[role] = null;
      } else if (v !== def) entities[role] = v;
    }
    if (Object.keys(entities).length) config.entities = entities;
    for (const [k] of ESPRESSO_NUMBER_FIELDS) {
      const v = espressoNum(data[k]);
      if (v != null && v !== ESPRESSO_DEFAULTS[k]) config[k] = v;
    }
    if (data.tap_action && Object.keys(data.tap_action).length) config.tap_action = data.tap_action;
    if (data.hold_action && Object.keys(data.hold_action).length) config.hold_action = data.hold_action;
    const colors = {};
    for (const [k, v] of Object.entries(data.colors || {})) {
      if (typeof v === "string" && v.trim()) colors[k] = v.trim();
    }
    if (Object.keys(colors).length) config.colors = colors;
    return config;
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  connectedCallback() {
    this._loadForm().then(() => this._render());
  }

  /* ha-form is lazy loaded by HA; load it through a built-in card's editor. */
  async _loadForm() {
    if (customElements.get("ha-form")) return;
    try {
      const helpers = await window.loadCardHelpers();
      const card = await helpers.createCardElement({ type: "entities", entities: [] });
      if (card.constructor.getConfigElement) await card.constructor.getConfigElement();
    } catch (_) {
      /* rendered as soon as HA has loaded it */
    }
    await customElements.whenDefined("ha-form");
  }

  _render() {
    if (!this._config || !customElements.get("ha-form")) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = ESPRESSO_EDITOR_SCHEMA;
      this._form.computeLabel = (s) => ESPRESSO_EDITOR_LABELS[s.name] || s.name.replace(/_/g, " ");
      this._form.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        const config = EspressoCardEditor.toConfig(e.detail.value, this._config);
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = EspressoCardEditor.toData(this._config);
  }
}

if (!customElements.get("espresso-card")) {
  customElements.define("espresso-card", EspressoCard);
}
if (!customElements.get("espresso-card-editor")) {
  customElements.define("espresso-card-editor", EspressoCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "espresso-card")) {
  window.customCards.push({
    type: "espresso-card",
    name: "Espresso Card",
    description: "Espresso machine on a smart plug: off, warming up with a countdown, or ready, detected from its power use.",
    preview: true,
    documentationURL: "https://github.com/BarBaar44/espresso-card",
  });
}

console.info(`%c ESPRESSO-CARD %c ${VERSION} `, "background:#795548;color:#fff", "");
}
