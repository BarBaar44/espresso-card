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

test("a pulse while ready stays ready, with the heating hint", () => {
  const c = render(states({ on: 14, w: 1040 }));
  feed(c, 2.6);
  feed(c, 950); // single thermostat pulse at about 16 min, still inside the 20 min window
  let r = read(c);
  assert.strictEqual(r.status, "Ready");
  assert(r.heat);
  feed(c, 180);
  r = read(c);
  assert.strictEqual(r.status, "Ready");
  assert(!r.heat, "180 W is not heating");
  feed(c, 2.5);
  assert(!read(c).heat);
});

test("a reheat block after 40 minutes stays ready, also on a fresh page", () => {
  const r = read(render(states({ on: 40, w: 1010 })));
  assert.strictEqual(r.status, "Ready");
  assert(r.heat);
  assert.strictEqual(r.words, "on for 40 min");
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
  const r = read(c);
  assert.strictEqual(r.status, "Ready");
  assert(r.heat);
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
  assert(r.heat);
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
