// Tests for espresso-card.js in a simulated browser. Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
const src = fs.readFileSync(path.join(__dirname, "..", "espresso-card.js"), "utf8");
w.eval(src);
w.eval(src); // loading twice as a classic script must not throw (no top-level name clashes)
const Card = w.customElements.get("espresso-card");
assert(Card, "registered");

const SW = "switch.espresso_switch";
const PW = "sensor.espresso_switch_current_consumption";
const MIN = 60000;
const ago = (min) => new Date(Date.now() - min * MIN).toISOString();
const st = (state, last_changed = ago(0)) => ({ state: String(state), attributes: {}, last_changed, last_updated: last_changed });

/* Plug on since `on` minutes ago (or off), drawing `w` watts. */
const states = (o = {}) => ({
  [SW]: o.on === undefined ? st("off", ago(120)) : st("on", ago(o.on)),
  [PW]: st(o.w ?? 0),
  ...(o.extra || {}),
});
const hass = (s, callWS) => ({ states: s, language: "en", locale: { language: "en" }, config: { time_zone: "UTC" }, callWS });

const cards = [];
function render(s, config = {}, callWS) {
  const c = new Card();
  w.document.body.appendChild(c);
  cards.push(c);
  c.setConfig(config);
  c.hass = hass(s, callWS);
  return c;
}
/* A new reading on the same card, keeping the switch's last_changed. */
function feed(c, watts, extra = {}) {
  const prev = c.hass.states;
  c.hass = hass({ ...prev, [PW]: st(watts), ...extra }, c.hass.callWS);
}
function read(c) {
  const e = c._el;
  const long = (el) => (el.querySelector(".long") ? el.querySelector(".long").textContent : el.textContent);
  const short = (el) => (el.querySelector(".short") ? el.querySelector(".short").textContent : el.textContent);
  return {
    status: long(e.status),
    statusShort: short(e.status),
    words: long(e.words),
    wordsShort: short(e.words),
    colour: e.card.style.getPropertyValue("--c"),
    warming: e.card.classList.contains("warming"),
    ready: e.card.classList.contains("ready"),
    pour: e.icon.classList.contains("show-pour"),
    heat: e.heat.classList.contains("show"),
    bar: e.fill.style.width,
    title: e.card.title,
  };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise((r) => setTimeout(r, 0));

test("off: plug off", () => {
  const r = read(render(states()));
  assert.strictEqual(r.status, "Off");
  assert.strictEqual(r.words, "");
  assert.strictEqual(r.colour, "var(--ec-off)");
  assert(!r.warming && !r.ready && !r.pour && !r.heat);
});

test("warming up: countdown, ready time and progress", () => {
  const r = read(render(states({ on: 3, w: 1040 })));
  assert.strictEqual(r.status, "Warming up");
  assert(r.warming);
  assert.strictEqual(r.colour, "var(--ec-warming)");
  assert(/^11 min · \d\d:\d\d$/.test(r.words), r.words); // 14 - 3
  assert.strictEqual(r.bar, "21%"); // 3 / 14
  assert.strictEqual(r.statusShort, "Warming");
  assert.strictEqual(r.wordsShort, "11 min");
  assert(/^Ready around \d\d:\d\d$/.test(r.title), r.title);
});

test("warming up: progress caps at 99 % and says soon past the estimate", () => {
  const r = read(render(states({ on: 16, w: 1040 })));
  assert.strictEqual(r.status, "Warming up");
  assert.strictEqual(r.bar, "99%");
  assert(r.words.startsWith("soon"), r.words);
});

test("ready after the drop, also before 14 minutes", () => {
  const c = render(states({ on: 13, w: 1050 }));
  assert.strictEqual(read(c).status, "Warming up");
  feed(c, 2.6);
  const r = read(c);
  assert.strictEqual(r.status, "Ready");
  assert(r.ready && r.pour && !r.heat);
  assert.strictEqual(r.colour, "var(--ec-ready)");
  assert.strictEqual(r.words, "on for 13 min");
});

test("a pulse while ready stays ready, without the heating hint", () => {
  const c = render(states({ on: 14, w: 1040 }));
  feed(c, 2.6);
  feed(c, 950); // single thermostat pulse at about 16 min, still inside the 20 min window
  let r = read(c);
  assert.strictEqual(r.status, "Ready");
  assert(!r.heat, "one 5 s pulse is not a reheat");
  feed(c, 180);
  r = read(c);
  assert.strictEqual(r.status, "Ready");
  assert(!r.heat, "180 W is not heating");
  feed(c, 2.5);
  assert(!read(c).heat);
});

test("a reheat block shows Reheating and the hint after 3 readings, Ready at once after", () => {
  const c = render(states({ on: 30, w: 2.6 }));
  feed(c, 1030);
  feed(c, 1045);
  assert(!read(c).heat, "2 readings (10 s) is not yet a reheat");
  for (const v of [1040, 1050, 1035, 1042, 1038, 1046, 1041, 1039, 1044, 1037]) feed(c, v); // the rest of a 1-minute block
  let r = read(c);
  assert.strictEqual(r.status, "Reheating");
  assert(r.heat);
  feed(c, 2.6);
  r = read(c);
  assert(!r.heat);
  assert.strictEqual(r.status, "Ready");
});

test("the heating hint also shows after 15 s, even when readings repeat", () => {
  const c = render(states({ on: 30, w: 2.6 }));
  feed(c, 1040);
  assert(!read(c).heat);
  c._heatSince -= 16000; // the same value for 16 s gives no new state object, only time passes
  c._update();
  assert(read(c).heat);
  assert.strictEqual(read(c).status, "Reheating");
});

test("a reheat block after 40 minutes stays ready, also on a fresh page", () => {
  const c = render(states({ on: 40, w: 1010 }));
  let r = read(c);
  assert.strictEqual(r.status, "Ready");
  assert.strictEqual(r.words, "on for 40 min");
  feed(c, 1025);
  feed(c, 1040);
  r = read(c);
  assert.strictEqual(r.status, "Reheating");
  assert(r.heat);
});

test("ready shows hours and minutes", () => {
  const r = read(render(states({ on: 72, w: 2.6 })));
  assert.strictEqual(r.words, "on for 1 h 12 m");
  assert.strictEqual(r.wordsShort, "on 1h 12m");
});

test("a new switch-on starts a new session", () => {
  const c = render(states({ on: 15, w: 2.6 }));
  assert.strictEqual(read(c).status, "Ready");
  c.hass = hass({ [SW]: st("off"), [PW]: st(0) });
  assert.strictEqual(read(c).status, "Off");
  c.hass = hass({ [SW]: st("on", ago(1)), [PW]: st(1040) });
  assert.strictEqual(read(c).status, "Warming up");
});

test("after a page load, history with the drop turns a reheat into ready", async () => {
  let asked = null;
  const callWS = async (msg) => {
    asked = msg;
    return { [PW]: [{ s: "1040", lu: (Date.now() - 18 * MIN) / 1000 }, { s: "2.6", lu: (Date.now() - 4 * MIN) / 1000 }, { s: "1000", lu: Date.now() / 1000 }] };
  };
  const c = render(states({ on: 18, w: 1000 }), {}, callWS);
  assert.strictEqual(read(c).status, "Warming up"); // until the history answers
  await tick();
  await tick();
  assert.strictEqual(asked.type, "history/history_during_period");
  assert.deepStrictEqual([...asked.entity_ids], [PW]);
  assert.strictEqual(read(c).status, "Ready");
});

test("switch-on: the standby reading before the heater is not ready", () => {
  const c = render({ [SW]: st("on", ago(0)), [PW]: st(0) }); // left over from off
  assert.strictEqual(read(c).status, "Warming up");
  feed(c, 2.6); // first reading after switch-on, ~5 s
  assert.strictEqual(read(c).status, "Warming up");
  feed(c, 1040); // the heater, ~10 s
  assert.strictEqual(read(c).status, "Warming up");
  feed(c, 1052);
  feed(c, 2.6); // at temperature
  assert.strictEqual(read(c).status, "Ready");
});

test("switch-on: other standby values in the first reading (17.3 W, 69 W) are not ready either", () => {
  for (const first of [0.5, 17.3, 69.0]) {
    const c = render({ [SW]: st("on", ago(0)), [PW]: st(0) });
    feed(c, first);
    feed(c, 1040);
    assert.strictEqual(read(c).status, "Warming up", String(first));
  }
});

test("page load: history with standby, heater and drop is ready; standby alone is not", async () => {
  const at = (min) => (Date.now() - min * MIN) / 1000;
  const rows = [{ s: "0.0", lu: at(16) }, { s: "2.6", lu: at(15.9) }, { s: "1040", lu: at(15.8) }, { s: "2.6", lu: at(2) }, { s: "1010", lu: at(0.1) }];
  const c = render(states({ on: 16, w: 1010 }), {}, async () => ({ [PW]: rows }));
  await tick();
  await tick();
  assert.strictEqual(read(c).status, "Ready");

  // Only standby then the heater still running: warming up, the early 2.6 W does not count.
  const warm = [{ s: "0.0", lu: at(6) }, { s: "2.6", lu: at(5.9) }, { s: "1040", lu: at(5.8) }];
  const d = render(states({ on: 6, w: 1040 }), {}, async () => ({ [PW]: warm }));
  await tick();
  await tick();
  assert.strictEqual(read(d).status, "Warming up");
  feed(d, 2.6); // the heater was seen in the history, so the live drop counts
  assert.strictEqual(read(d).status, "Ready");
});

test("a page opened mid-session on standby shows ready, not warming up", () => {
  assert.strictEqual(read(render(states({ on: 16, w: 2.6 }))).status, "Ready");
});

test("history without a drop keeps warming up, asked once per session", async () => {
  let calls = 0;
  const callWS = async () => {
    calls++;
    return { [PW]: [{ s: "1040", lu: (Date.now() - 5 * MIN) / 1000 }] };
  };
  const c = render(states({ on: 5, w: 1040 }), {}, callWS);
  await tick();
  feed(c, 1045);
  await tick();
  assert.strictEqual(read(c).status, "Warming up");
  assert.strictEqual(calls, 1);
});

test("state role overrides the heuristic", () => {
  const extra = (v) => ({ "sensor.espresso_state": st(v) });
  const cfg = { entities: { state: "sensor.espresso_state" } };
  // Power says warming, the template sensor says ready.
  let r = read(render(states({ on: 5, w: 1040, extra: extra("Ready") }), cfg));
  assert.strictEqual(r.status, "Ready");
  // Power says ready, the template sensor says warming up: countdown from switch-on.
  r = read(render(states({ on: 5, w: 2.6, extra: extra("Warming up") }), cfg));
  assert.strictEqual(r.status, "Warming up");
  assert(r.words.startsWith("9 min"), r.words);
  // Off wins even with the plug on.
  r = read(render(states({ on: 5, w: 2.6, extra: extra("Off") }), cfg));
  assert.strictEqual(r.status, "Off");
  // An unavailable template sensor falls back to the heuristic.
  r = read(render(states({ on: 30, w: 2.6, extra: extra("unavailable") }), cfg));
  assert.strictEqual(r.status, "Ready");
});

test("thresholds and minutes are configurable", () => {
  const cfg = { warmup_minutes: 10, warmup_timeout: 12, ready_below: 20, heating_above: 1500 };
  assert.strictEqual(read(render(states({ on: 5, w: 1040 }), cfg)).status, "Ready"); // 1040 is not above 1500
  const r = read(render(states({ on: 5, w: 1600 }), cfg));
  assert.strictEqual(r.status, "Warming up");
  assert.strictEqual(r.bar, "50%");
  const c = render(states({ on: 5, w: 1600 }), cfg);
  feed(c, 30); // not below 20: no latch, between thresholds counts as ready but the next heat block warms again
  feed(c, 1600);
  assert.strictEqual(read(c).status, "Warming up");
});

test("no power entity: time only", () => {
  const cfg = { entities: { power: null } };
  assert.strictEqual(read(render(states({ on: 5 }), cfg)).status, "Warming up");
  assert.strictEqual(read(render(states({ on: 15 }), cfg)).status, "Ready");
});

test("unavailable plug", () => {
  const r = read(render({ [SW]: st("unavailable"), [PW]: st("unavailable") }));
  assert.strictEqual(r.status, "Unavailable");
});

test("tap toggles the plug, hold opens more-info, through hass-action", () => {
  const c = render(states());
  const got = [];
  c.addEventListener("hass-action", (e) => got.push(e.detail));
  c._run(c._config.tap_action, "tap");
  c._run(c._config.hold_action, "hold");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), [
    { config: { entity: SW, tap_action: { action: "toggle" } }, action: "tap" },
    { config: { entity: SW, hold_action: { action: "more-info" } }, action: "hold" },
  ]);
});

test("re-renders only for its own entities", () => {
  const c = render(states({ on: 5, w: 1040 }));
  let n = 0;
  const orig = c._update.bind(c);
  c._update = () => { n++; orig(); };
  c.hass = hass({ ...c.hass.states, "light.other": st("on") });
  assert.strictEqual(n, 0);
  feed(c, 1041);
  assert.strictEqual(n, 1);
});

test("config errors", () => {
  const bad = [
    [{ entitys: {} }, /Unknown option 'entitys'/],
    [{ entities: { plug: "switch.x" } }, /unknown role 'plug'/],
    [{ entities: { power: "not an id" } }, /not an entity id/],
    [{ entities: { switch: null } }, /switch is required/],
    [{ warmup_minutes: "abc" }, /warmup_minutes must be a number/],
    [{ warmup_minutes: 25 }, /warmup_timeout must not be shorter/],
    [{ ready_below: 1000 }, /heating_above must be higher/],
  ];
  for (const [cfg, re] of bad) assert.throws(() => new Card().setConfig(cfg), re);
});


test("editor: defaults shown, only changes written, round trip", async () => {
  const Editor = w.customElements.get("espresso-card-editor");
  assert(Editor, "editor registered");
  assert.equal(Card.getConfigElement().tagName.toLowerCase(), "espresso-card-editor");

  const minimal = { type: "custom:espresso-card", grid_options: { columns: 3, rows: 2 } };
  const d0 = Editor.toData(minimal);
  assert.equal(d0.name, "Espresso");
  assert.equal(d0.entities.switch, SW);
  assert.equal(d0.entities.power, PW);
  assert.equal(d0.entities.state, "");
  assert.equal(d0.warmup_minutes, 14);
  assert.equal(d0.heating_above, 900);
  assert.deepEqual(Editor.toConfig(d0, minimal), minimal, "unchanged writes nothing new");

  // changed and cleared entities, numbers, a state sensor
  const d1 = Editor.toData(minimal);
  d1.entities.power = "";
  d1.entities.state = "sensor.espresso_state";
  d1.warmup_minutes = 12;
  d1.ready_below = 50;
  const c1 = Editor.toConfig(d1, minimal);
  assert.deepEqual(c1.entities, { power: null, state: "sensor.espresso_state" });
  assert.equal(c1.warmup_minutes, 12);
  assert.equal("ready_below" in c1, false, "default number not written");
  assert.deepEqual(Editor.toConfig(Editor.toData(c1), c1), c1, "round trip");

  // the required switch and a cleared number fall back to the default
  const d2 = Editor.toData(minimal);
  d2.entities.switch = "";
  d2.warmup_timeout = undefined;
  assert.deepEqual(Editor.toConfig(d2, minimal), minimal);

  // name, actions, colours
  const full = {
    type: "custom:espresso-card", name: "Rocket", entities: { switch: "switch.rocket" }, heating_above: 800,
    tap_action: { action: "more-info" }, hold_action: { action: "none" }, colors: { ready: "teal" },
  };
  assert.deepEqual(Editor.toConfig(Editor.toData(full), full), full);
  const d3 = Editor.toData(full);
  d3.colors.ready = " ";
  assert.equal(Editor.toConfig(d3, full).colors, undefined, "empty colour dropped");

  // every config the editor writes is accepted by the card
  new Card().setConfig(c1);
  new Card().setConfig(Editor.toConfig(Editor.toData(full), full));

  // with a stub ha-form: renders and passes changes on
  if (!w.customElements.get("ha-form")) w.customElements.define("ha-form", class extends w.HTMLElement {});
  const ed = new Editor();
  const got = [];
  ed.addEventListener("config-changed", (e) => got.push(e.detail.config));
  ed.setConfig(minimal);
  w.document.body.appendChild(ed);
  await new Promise((r) => setTimeout(r, 0));
  const form = ed.querySelector("ha-form");
  assert(form, "ha-form rendered");
  assert.equal(form.data.entities.power, PW);
  assert.equal(form.computeLabel({ name: "heating_above" }), "Heater on above");
  form.dispatchEvent(new w.CustomEvent("value-changed", { detail: { value: { ...form.data, name: "Rocket" } } }));
  assert.deepEqual(got[0], { ...minimal, name: "Rocket" });
  ed.remove();
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${name}\n     ${err.message}`);
    }
  }
  cards.forEach((c) => c.remove());
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
