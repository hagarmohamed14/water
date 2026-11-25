/* =====================================================================
   WATER TANK DIGITAL TWIN : core (data model, simulation, alarms, adapters)
   ===================================================================== */
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pad2 = n => String(n).padStart(2, '0');
const hms = t => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); };
const fnum = (n, d) => (n == null || !isFinite(n)) ? '--' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d });
const ago = t => { if (!t) return 'never'; const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? s.toFixed(0) + ' s ago' : s < 3600 ? Math.floor(s / 60) + ' min ago' : Math.floor(s / 3600) + ' h ago'; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

/* ---------- plant constants ---------- */
const TANK = { cap: 10000, H: 2.0, R: Math.sqrt(5 / Math.PI), y0: 1.0 };   // 5 m2 x 2 m = 10 m3
const PUMP_Q = 5.0;       // L/s per running pump (18 m3/h)
const VALVE_K = 3.4;      // L/s per fully open valve per sqrt(m of head)
const MOTOR_FLA = 10.5, MOTOR_OVL = 11.5;

const COMPS = {
  tank: { name: 'Water Tank T-101', short: 'Tank', loc: 'Centre of the installation, on the support skid.' },
  level: { name: 'Level Sensor LT-101', short: 'Level Sensor', loc: 'Tank roof, centre nozzle. Probe hangs inside the tank.' },
  temp: { name: 'Temperature Sensor TT-101', short: 'Temp. sensor', loc: 'Tank shell, lower front, 0.3 m above the floor plate.' },
  pump1: { name: 'Pump 1', short: 'Pump 1', loc: 'Pump skid, left position (front).' },
  pump2: { name: 'Pump 2', short: 'Pump 2', loc: 'Pump skid, centre position (front).' },
  pump3: { name: 'Pump 3', short: 'Pump 3', loc: 'Pump skid, right position (front).' },
  valve1: { name: 'Outlet Valve VLV-1', short: 'VLV-1', loc: 'Outlet manifold, branch nearest the tank (back right).' },
  valve2: { name: 'Outlet Valve VLV-2', short: 'VLV-2', loc: 'Outlet manifold, middle branch (back right).' },
  valve3: { name: 'Outlet Valve VLV-3', short: 'VLV-3', loc: 'Outlet manifold, outer branch (back right).' }
};

/* ---------- normalized I/O model ---------- */
const IO = [];
const IOMAP = {};
function defIO(d) { IO.push(d); IOMAP[d.id] = d; }
defIO({ id: 'LT101', type: 'AI', label: 'Water level transmitter LT-101', unit: 'm', rawLo: 4, rawHi: 20, engLo: 0, engHi: 2.0, dec: 3, comp: 'level' });
defIO({ id: 'TT101', type: 'AI', label: 'Water temperature TT-101 (optional)', unit: '°C', rawLo: 4, rawHi: 20, engLo: 0, engHi: 50, dec: 1, comp: 'temp', optional: true });
defIO({ id: 'FT101', type: 'AI', label: 'Inlet flow FT-101 (optional)', unit: 'L/s', rawLo: 4, rawHi: 20, engLo: 0, engHi: 30, dec: 2, comp: 'tank', optional: true });
defIO({ id: 'FT102', type: 'AI', label: 'Outlet flow FT-102 (optional)', unit: 'L/s', rawLo: 4, rawHi: 20, engLo: 0, engHi: 30, dec: 2, comp: 'tank', optional: true });
for (let i = 1; i <= 3; i++) defIO({ id: 'IT20' + i, type: 'AI', label: 'Pump ' + i + ' motor current (optional)', unit: 'A', rawLo: 4, rawHi: 20, engLo: 0, engHi: 20, dec: 2, comp: 'pump' + i, optional: true });
for (let i = 1; i <= 3; i++) defIO({ id: 'P' + i + '_RUN', type: 'DI', label: 'Pump ' + i + ' running feedback', comp: 'pump' + i, on: 'Running', off: 'Stopped' });
for (let i = 1; i <= 3; i++) defIO({ id: 'P' + i + '_FLT', type: 'DI', label: 'Pump ' + i + ' fault feedback', comp: 'pump' + i, on: 'FAULT', off: 'Healthy', bad: true });
for (let i = 1; i <= 3; i++) defIO({ id: 'V' + i + '_ZSO', type: 'DI', label: 'Valve ' + i + ' open limit (ZSO)', comp: 'valve' + i, on: 'Open', off: '-' });
for (let i = 1; i <= 3; i++) defIO({ id: 'V' + i + '_ZSC', type: 'DI', label: 'Valve ' + i + ' closed limit (ZSC)', comp: 'valve' + i, on: 'Closed', off: '-' });
defIO({ id: 'LSL101', type: 'DI', label: 'Low-level switch LSL-101', comp: 'tank', on: 'LOW', off: 'Normal', bad: true });
defIO({ id: 'LSH101', type: 'DI', label: 'High-level switch LSH-101', comp: 'tank', on: 'HIGH', off: 'Normal', bad: true });
defIO({ id: 'ESTOP', type: 'DI', label: 'Emergency stop', comp: null, on: 'ACTIVE', off: 'Healthy', bad: true });
defIO({ id: 'MCC_TRIP', type: 'DI', label: 'Motor protection trip (MCC)', comp: null, on: 'TRIPPED', off: 'Healthy', bad: true });
for (let i = 1; i <= 3; i++) defIO({ id: 'P' + i + '_START', type: 'DO', label: 'Pump ' + i + ' start/stop command', comp: 'pump' + i, on: 'START', off: 'STOP' });
for (let i = 1; i <= 3; i++) defIO({ id: 'V' + i + '_OPEN', type: 'DO', label: 'Valve ' + i + ' open command', comp: 'valve' + i, on: 'OPEN', off: '-' });
for (let i = 1; i <= 3; i++) defIO({ id: 'V' + i + '_CLOSE', type: 'DO', label: 'Valve ' + i + ' close command', comp: 'valve' + i, on: 'CLOSE', off: '-' });

const RAW_AI_RANGE = [-2, 30];
const toEng = (d, raw) => d.engLo + (raw - d.rawLo) / (d.rawHi - d.rawLo) * (d.engHi - d.engLo);
const toRaw = (d, eng) => d.rawLo + (eng - d.engLo) / (d.engHi - d.engLo) * (d.rawHi - d.rawLo);

/* ---------- application state ---------- */
const app = {
  mode: 'sim', offlineSince: 0, lastSrc: null, lastDataTs: 0, staleMs: 5000,
  limits: { high: 90, low: 25, crit: 10 }, t0: performance.now()
};
const procT = () => (app.mode === 'sim' ? sim.tProc : (performance.now() - app.t0) / 1000);

/* ---------- tag store with validation ---------- */
const store = {
  t: {}, rx: 0, rej: 0, lastRej: '', tsFix: 0,
  init() { IO.forEach(d => { this.t[d.id] = { v: null, ts: 0, q: 'none', src: null }; }); },
  clear() { this.init(); },
  /* returns true when accepted */
  set(id, raw, ts, src, q) {
    const d = IOMAP[id];
    if (!d) { this.rej++; this.lastRej = 'Unknown tag "' + id + '"'; return false; }
    let v = raw;
    if (d.type === 'AI') {
      v = typeof raw === 'string' ? parseFloat(raw) : raw;
      if (typeof v !== 'number' || !isFinite(v)) { this.rej++; this.lastRej = id + ': not a number (' + raw + ')'; return false; }
      if (v < RAW_AI_RANGE[0] || v > RAW_AI_RANGE[1]) { this.rej++; this.lastRej = id + ': raw ' + v + ' outside plausible range'; return false; }
    } else {
      if (typeof raw === 'string') { const s = raw.trim().toLowerCase(); v = (s === '1' || s === 'true' || s === 'on') ? true : (s === '0' || s === 'false' || s === 'off') ? false : null; }
      else if (typeof raw === 'number') v = raw !== 0; else if (typeof raw !== 'boolean') v = null;
      if (v === null) { this.rej++; this.lastRej = id + ': not a boolean (' + raw + ')'; return false; }
    }
    const now = Date.now();
    let t = Number(ts);
    if (!isFinite(t) || t <= 0) t = now;
    else if (t < 1e11) t *= 1000;                 // seconds -> ms
    if (t > now + 5000) { t = now; this.tsFix++; } // timestamp from the future
    this.t[id] = { v, ts: t, q: q || 'good', src };
    this.rx++; app.lastDataTs = now; app.lastSrc = src;
    return true;
  },
  read(id) {
    const d = IOMAP[id], e = this.t[id];
    const r = { id, v: e.v, ts: e.ts, src: e.src, q: 'none', eng: null };
    if (e.v === null) return r;
    let q = e.q;
    if (d.type === 'AI') {
      r.eng = toEng(d, e.v);
      if (q === 'good') { if (e.v < 3.6 || e.v > 21) q = 'bad'; else if (e.v < 3.8 || e.v > 20.5) q = 'uncertain'; }
    }
    if ((app.mode === 'offline' || Date.now() - e.ts > app.staleMs) && q !== 'bad') q = 'stale';
    r.q = q;
    return r;
  }
};
store.init();

/* =====================================================================
   PROCESS SIMULATION  (never writes in LIVE mode; every value is tagged SIM)
   ===================================================================== */
const SCENARIOS = {
  normal: { label: 'Normal operation', level: 72, demand: [1, 0, 1], order: [0, 2, 1], pumpsOn: [0, 2] },
  peak: { label: 'Peak demand (all outlets open)', level: 60, demand: [1, 1, 1], order: [0, 1, 2] },
  night: { label: 'Low demand (night)', level: 80, demand: [1, 0, 0], order: [1, 0, 2] },
  fill: { label: 'Fill to high level', level: 82, demand: [0, 0, 0], order: [0, 1, 2], pumpsOn: [0, 1] },
  srcloss: { label: 'Source supply lost (level falls)', level: 52, demand: [1, 1, 1], order: [0, 1, 2], apply: s => { s.sourceOk = false; } },
  p2fail: { label: 'Pump 2 failure', level: 42, demand: [1, 0, 1], order: [1, 0, 2], apply: s => { s.pumps[1].failAt = s.tProc + 40; } },
  p3ovl: { label: 'Pump 3 overload', level: 42, demand: [1, 0, 1], order: [2, 0, 1], apply: s => { s.pumps[2].forceOvl = true; } },
  v3stuck: { label: 'Valve 3 stuck open', level: 70, demand: [1, 0, 0], order: [0, 2, 1], apply: s => { s.valves[2].pos = 1; s.valves[2].stuck = true; } },
  sensor: { label: 'Level sensor disconnected', level: 66, demand: [1, 0, 1], order: [0, 2, 1], apply: s => { s.sensorOpen = true; } },
  comm: { label: 'Communication loss', level: 66, demand: [1, 0, 1], order: [0, 2, 1], apply: s => { s.commLoss = true; } },
  opc: { label: 'OPC UA server failure', level: 66, demand: [1, 0, 1], order: [0, 2, 1], apply: s => { s.opcFail = true; } },
  modbus: { label: 'Modbus TCP failure', level: 66, demand: [1, 0, 1], order: [0, 2, 1], apply: s => { s.mbFail = true; } }
};

const sim = {
  active: true, speed: 6, scenario: 'normal', tProc: 0, vol: 7200, temp: 24.5,
  order: [0, 2, 1], demand: [1, 0, 1], qin: 0, qout: 0, outTotal: 0, estop: false, mccTrip: false,
  sourceOk: true, sensorOpen: false, commLoss: false, opcFail: false, mbFail: false, wasRunning: true,
  pumps: [0, 1, 2].map(() => ({ cmd: false, run: false, startTimer: 0, fault: false, failAt: 0, forceOvl: false, ovlT: 0, amps: 0, auto: true, starts: 0 })),
  valves: [0, 1, 2].map(() => ({ cmdO: false, pos: 0, stuck: false, auto: true })),
  pct() { return this.vol / TANK.cap * 100; },
  head() { return this.vol / TANK.cap * TANK.H; },
  resetFaults() {
    this.pumps.forEach(p => { p.fault = false; p.failAt = 0; p.forceOvl = false; p.ovlT = 0; });
    this.valves.forEach(v => { v.stuck = false; });
    this.sourceOk = true; this.sensorOpen = false; this.commLoss = false; this.opcFail = false; this.mbFail = false;
    this.estop = false; this.mccTrip = false;
  },
  applyScenario(key) {
    const sc = SCENARIOS[key]; if (!sc) return;
    this.resetFaults(); this.scenario = key;
    this.vol = sc.level / 100 * TANK.cap;
    this.order = sc.order.slice(); this.demand = sc.demand.slice();
    this.pumps.forEach(p => { p.auto = true; p.cmd = false; p.run = false; p.startTimer = 0; p.amps = 0; });
    this.valves.forEach((v, i) => { v.auto = true; v.pos = this.demand[i] ? 1 : 0; v.cmdO = !!this.demand[i]; });
    this.control(true);
    this.pumps.forEach(p => { p.run = p.cmd && !p.fault; p.startTimer = p.run ? 2 : 0; });
    if (sc.pumpsOn) sc.pumpsOn.forEach(i => { this.pumps[i].cmd = true; this.pumps[i].run = true; this.pumps[i].startTimer = 2; });
    this.wasRunning = this.pumps.some(p => p.cmd);
    if (sc.apply) sc.apply(this);
  },
  control(init) {
    const P = this.pumps, V = this.valves, pct = this.pct();
    if (this.estop || this.mccTrip) P.forEach(p => { p.cmd = false; });
    else {
      const START = [55, 40, 25], STOP = [85, 80, 70];
      const ord = this.order.filter(i => !P[i].fault);
      ord.forEach((i, k) => {
        const p = P[i]; if (!p.auto) return;
        if (pct <= START[k]) p.cmd = true;
        if (pct >= STOP[k]) p.cmd = false;
      });
      P.forEach(p => { if (p.fault && p.auto) p.cmd = false; });
      if (pct >= 98) P.forEach(p => { p.cmd = false; });           // high-high interlock
      const anyAuto = this.order.some(i => P[i].auto && !P[i].fault);
      const running = P.some(p => p.cmd);
      if (!init && this.wasRunning && !running && anyAuto) this.order.push(this.order.shift());   // alternate lead pump
      this.wasRunning = running;
    }
    V.forEach((v, i) => {
      if (!v.auto) return;
      let want = !!this.demand[i];
      if (pct <= 3) want = false;                                    // low-low outlet cut-off
      v.cmdO = want;
    });
  },
  sub(h) {
    this.control(false);
    const P = this.pumps, V = this.valves;
    P.forEach((p, i) => {
      const can = p.cmd && !p.fault && !this.estop && !this.mccTrip;
      if (can) { p.startTimer += h; if (!p.run && p.startTimer >= 1.5) { p.run = true; p.starts++; } }
      else { p.startTimer = 0; p.run = false; }
      if (p.failAt && this.tProc >= p.failAt && p.cmd) { p.fault = true; p.failAt = 0; p.run = false; }
      if (p.forceOvl && p.run) { p.ovlT += h; if (p.ovlT > 70) { p.fault = true; p.run = false; } } else if (!p.forceOvl) p.ovlT = 0;
      const base = 9.6 + Math.sin(this.tProc * 0.7 + i) * 0.12;
      const tgt = p.run ? (p.forceOvl ? Math.min(13.9, 9.6 + p.ovlT * 0.12) : base) : 0;
      p.amps += (tgt - p.amps) * (1 - Math.exp(-h / (p.run ? 2.5 : 0.6)));
      if (p.amps < 0.02) p.amps = 0;
    });
    V.forEach(v => { if (!v.stuck) { const tgt = v.cmdO ? 1 : 0; const st = h / 20; v.pos = v.pos < tgt ? Math.min(tgt, v.pos + st) : Math.max(tgt, v.pos - st); } });
    const nRun = P.filter(p => p.run).length;
    this.qin = this.sourceOk ? nRun * PUMP_Q : 0;
    const head = this.head();
    this.qout = V.reduce((a, v) => a + v.pos * VALVE_K * Math.sqrt(Math.max(head, 0)), 0);
    this.vol = clamp(this.vol + (this.qin - this.qout) * h, 0, TANK.cap);
    this.outTotal += this.qout * h;
    this.temp += (23.8 + Math.sin(this.tProc / 400) * 1.2 - this.temp) * (h / 600);
  },
  step(dtReal) {
    const dt = dtReal * this.speed; this.tProc += dt;
    let rem = dt; while (rem > 1e-6) { const h = Math.min(rem, 0.5); this.sub(h); rem -= h; }
  },
  publish() {
    if (this.commLoss) return;
    const now = Date.now(), S = 'SIM', set = (id, v) => store.set(id, v, now, S);
    const noise = () => (Math.random() - 0.5);
    if (!this.opcFail && !this.mbFail) {
      const eng = this.head();
      set('LT101', this.sensorOpen ? 0.2 : toRaw(IOMAP.LT101, eng) + noise() * 0.012);
      set('TT101', toRaw(IOMAP.TT101, this.temp) + noise() * 0.01);
      set('FT101', toRaw(IOMAP.FT101, this.qin) + noise() * 0.02);
      set('FT102', toRaw(IOMAP.FT102, this.qout) + noise() * 0.02);
      this.pumps.forEach((p, i) => {
        set('IT20' + (i + 1), toRaw(IOMAP['IT20' + (i + 1)], p.amps) + noise() * 0.01);
        set('P' + (i + 1) + '_RUN', p.run);
        set('P' + (i + 1) + '_FLT', p.fault);
      });
      this.valves.forEach((v, i) => { set('V' + (i + 1) + '_ZSO', v.pos > 0.97); set('V' + (i + 1) + '_ZSC', v.pos < 0.03); });
      set('LSL101', this.pct() <= 8); set('LSH101', this.pct() >= 92);
      set('ESTOP', this.estop); set('MCC_TRIP', this.mccTrip);
    }
    this.pumps.forEach((p, i) => set('P' + (i + 1) + '_START', p.cmd));
    this.valves.forEach((v, i) => { set('V' + (i + 1) + '_OPEN', v.cmdO); set('V' + (i + 1) + '_CLOSE', !v.cmdO); });
  }
};
sim.applyScenario('normal');

/* =====================================================================
   DERIVED TWIN STATE (what the 3D model and the panels render)
   ===================================================================== */
const S = {
  src: 'SIM', hasLevel: false, levelOk: false, levelM: 0, levelPct: 0, volL: 0, tempC: null, qin: null, qout: null,
  pumps: [0, 1, 2].map(() => ({ known: false, run: false, fault: false, cmd: null, amps: null, q: 'none' })),
  valves: [0, 1, 2].map(() => ({ known: false, pos: 0.5, zso: false, zsc: false, cmdO: null, cmdC: null, state: 'unknown' })),
  lsl: false, lsh: false, estop: false, mcc: false, lt: null, sensorBad: false, dataValid: false, transportLost: false
};
const runtime = { run: [0, 0, 0], starts: [0, 0, 0], prevRun: [false, false, false], outTotalL: 0, hasFlow: false };

function deriveState(dt) {
  const R = id => store.read(id);
  const lt = R('LT101'); S.lt = lt; S.stale = lt.q === 'stale';
  let latestField = 0; IO.forEach(d => { if (d.type !== 'DO') { const e = store.t[d.id]; if (e.v !== null && e.ts > latestField) latestField = e.ts; } });
  S.dataValid = app.mode !== 'offline' && latestField > 0 && (Date.now() - latestField) < app.staleMs && !(app.mode === 'sim' && sim.commLoss);
  S.src = app.mode === 'sim' ? 'SIM' : (app.mode === 'offline' ? (app.lastSrc || '--') : 'LIVE');
  const hasVal = lt.v !== null;
  S.sensorBad = hasVal && (lt.q === 'bad');
  S.levelOk = hasVal && lt.q !== 'bad' && lt.q !== 'none';
  if (hasVal && !S.sensorBad) {
    S.hasLevel = true;
    S.levelM = clamp(lt.eng, 0, TANK.H * 1.02);
    S.levelPct = S.levelM / TANK.H * 100; S.volL = S.levelPct / 100 * TANK.cap;
  }
  if (!hasVal) S.hasLevel = S.hasLevel && app.mode === 'offline';
  const tt = R('TT101'); S.tempC = (tt.v !== null && tt.q !== 'bad') ? tt.eng : null;
  const f1 = R('FT101'), f2 = R('FT102');
  S.qin = (f1.v !== null && f1.q !== 'bad') ? Math.max(0, f1.eng) : null;
  S.qout = (f2.v !== null && f2.q !== 'bad') ? Math.max(0, f2.eng) : null;
  for (let i = 0; i < 3; i++) {
    const n = i + 1, p = S.pumps[i], run = R('P' + n + '_RUN'), flt = R('P' + n + '_FLT'), cmd = R('P' + n + '_START'), cur = R('IT20' + n);
    p.known = run.v !== null; p.run = run.v === true; p.fault = flt.v === true; p.cmd = cmd.v; p.q = run.q;
    p.amps = (cur.v !== null && cur.q !== 'bad') ? cur.eng : null;
    const v = S.valves[i], zo = R('V' + n + '_ZSO'), zc = R('V' + n + '_ZSC'), co = R('V' + n + '_OPEN'), cc = R('V' + n + '_CLOSE');
    v.zso = zo.v === true; v.zsc = zc.v === true; v.cmdO = co.v; v.cmdC = cc.v;
    v.known = zo.v !== null && zc.v !== null;
    if (!v.known) v.state = 'unknown';
    else if (v.zso && v.zsc) v.state = 'fault';
    else if (v.zso) v.state = 'open'; else if (v.zsc) v.state = 'closed'; else v.state = 'travel';
    if (app.mode === 'sim') { if (S.dataValid) v.pos = sim.valves[i].pos; }
    else v.pos = v.state === 'open' ? 1 : v.state === 'closed' ? 0 : 0.5;
  }
  S.lsl = R('LSL101').v === true; S.lsh = R('LSH101').v === true;
  S.estop = R('ESTOP').v === true; S.mcc = R('MCC_TRIP').v === true;
  // runtime counters (process time in simulation, wall clock in live)
  if (app.mode !== 'offline' && S.dataValid && dt > 0) {
    for (let i = 0; i < 3; i++) {
      if (S.pumps[i].run) runtime.run[i] += dt;
      if (S.pumps[i].run && !runtime.prevRun[i]) runtime.starts[i]++;
      runtime.prevRun[i] = S.pumps[i].run;
    }
    if (S.qout != null) runtime.outTotalL += S.qout * dt;
  }
}

/* =====================================================================
   COMMUNICATION MODEL
   ===================================================================== */
const PROTOS = ['TCP/IP', 'WSS', 'MQTT', 'OPC UA', 'Modbus TCP'];
const DEF_PORT = { 'WSS': 8443, 'MQTT': 8884, 'OPC UA': 4840, 'Modbus TCP': 502, 'TCP/IP': 5020 };
const PROTO_COLOR = { 'WSS': '#3ad7ff', 'MQTT': '#b58bff', 'OPC UA': '#36e08a', 'Modbus TCP': '#ffbf3d', 'TCP/IP': '#7fb4ff' };
const NODE_PROTOS = {
  softpac: ['WSS', 'MQTT', 'OPC UA', 'Modbus TCP', 'TCP/IP'],
  opc: ['OPC UA', 'Modbus TCP'],
  field: ['Modbus TCP', 'TCP/IP']
};
const LINK_PROTOS = { L1: PROTOS.slice(), L2: ['OPC UA', 'Modbus TCP', 'TCP/IP'], L3: ['Modbus TCP', 'TCP/IP'] };

function defaultOpcMap() { const m = {}; IO.forEach(d => { m[d.id] = 'ns=2;s=WaterTank.' + d.id; }); return m; }
function defaultMqttBase() { return 'plant/tank1'; }
function defaultModbusMap() {
  const m = []; let hr = 0, di = 0, co = 0;
  IO.filter(d => d.type === 'AI').forEach(d => { m.push({ tag: d.id, area: 'holding', addr: hr, type: 'float32' }); hr += 2; });
  IO.filter(d => d.type === 'DI').forEach(d => { m.push({ tag: d.id, area: 'discrete', addr: di++, type: 'bool' }); });
  IO.filter(d => d.type === 'DO').forEach(d => { m.push({ tag: d.id, area: 'coil', addr: co++, type: 'bool' }); });
  return m;
}
const comm = {
  nodes: {
    softpac: { name: 'SoftPAC Runtime + HMI', short: 'SoftPAC + HMI', ip: '192.168.10.10', port: 8443, desc: 'Soft PLC runtime and operator HMI. Aggregates all process data.' },
    switch: { name: 'Industrial Ethernet Switch', short: 'Ethernet Switch', ip: '192.168.10.2', port: 161, desc: 'Managed industrial switch. Carries traffic only; diagnostics via SNMP port.' },
    opc: { name: 'OPC UA Server / CRD', short: 'OPC UA Server / CRD', ip: '192.168.10.20', port: 4840, desc: 'OPC UA server on the remote device controller. Maps field I/O to nodes.' },
    field: { name: 'Field Devices (I/O)', short: 'Field Devices', ip: '192.168.10.30', port: 502, desc: 'Level transmitter, switches, pump starters, valve actuators via remote I/O.' }
  },
  links: {
    L1: { a: 'softpac', b: 'switch', protocol: 'OPC UA' },
    L2: { a: 'switch', b: 'opc', protocol: 'OPC UA' },
    L3: { a: 'opc', b: 'field', protocol: 'Modbus TCP' }
  },
  tap: { node: 'softpac', protocol: 'WSS' },
  allowCommands: false,
  cfg: {
    'WSS': { path: '/twin', token: '', subproto: '' },
    'MQTT': { path: '/mqtt', clientId: 'twin-' + Math.random().toString(16).slice(2, 8), user: '', pass: '', base: defaultMqttBase(), qos: 0 },
    'OPC UA': { gateway: '', security: 'None', user: '', pass: '', interval: 500, nodes: defaultOpcMap() },
    'Modbus TCP': { gateway: '', unit: 1, pollMs: 500, wordOrder: 'big', map: defaultModbusMap() },
    'TCP/IP': { gateway: '', format: 'json', cmdTemplate: 'SET {tag} {value}\\n' }
  }
};
(function loadCfg() {
  const s = lsGet('wt-twin-cfg-v2'); if (!s) return;
  try {
    ['softpac', 'switch', 'opc', 'field'].forEach(k => { if (s.nodes && s.nodes[k]) { comm.nodes[k].ip = String(s.nodes[k].ip || comm.nodes[k].ip); comm.nodes[k].port = Number(s.nodes[k].port) || comm.nodes[k].port; } });
    if (s.links) Object.keys(comm.links).forEach(k => { if (s.links[k] && LINK_PROTOS[k].includes(s.links[k])) comm.links[k].protocol = s.links[k]; });
    if (s.tap && NODE_PROTOS[s.tap.node] && NODE_PROTOS[s.tap.node].includes(s.tap.protocol)) comm.tap = s.tap;
    if (s.cfg) Object.keys(comm.cfg).forEach(k => { if (s.cfg[k]) Object.assign(comm.cfg[k], s.cfg[k], { pass: '', token: '' }); });
    comm.allowCommands = false;
  } catch (e) { /* ignore corrupt config */ }
})();
function saveCfg() {
  const cfg = JSON.parse(JSON.stringify(comm.cfg));
  Object.keys(cfg).forEach(k => { delete cfg[k].pass; delete cfg[k].token; });
  lsSet('wt-twin-cfg-v2', { nodes: comm.nodes, links: Object.fromEntries(Object.entries(comm.links).map(([k, v]) => [k, v.protocol])), tap: comm.tap, cfg });
}
function validateEndpoint(ip, port) {
  const h = String(ip).trim();
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const host = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  if (!h) return 'Enter an IP address or host name.';
  if (!ipv4.test(h) && !host.test(h)) return 'Not a valid IPv4 address or host name.';
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return 'Port must be a whole number from 1 to 65535.';
  return '';
}

/* ---------- adapters ---------- */
const WS_HINT = 'The socket did not open. Typical causes: host unreachable, wrong port, TLS certificate not trusted, or the page is not allowed to open this connection (CSP / mixed content).';
const MB_EXC = { 1: 'Illegal function', 2: 'Illegal data address (check the register map)', 3: 'Illegal data value', 4: 'Slave device failure', 5: 'Acknowledge', 6: 'Slave device busy', 10: 'Gateway path unavailable', 11: 'Gateway target device failed to respond' };

class Adapter {
  constructor(name) {
    this.name = name; this.state = 'idle'; this.wanted = false; this.ws = null; this.errors = []; this.diag = null;
    this.rx = 0; this.tx = 0; this.rej = 0; this.lastOk = 0; this.lastRx = 0; this.rtt = null; this.rate = 0; this._rc = 0; this._rxWin = []; this.rxBytes = 0;
    this.opcDown = false; this.mbDown = false; this.lastSend = 0; this.connectedAt = 0;
  }
  get cfg() { return comm.cfg[this.name]; }
  endpoint() { const n = comm.nodes[comm.tap.node]; return { ip: n.ip, port: n.port }; }
  err(msg, hint) { this.errors.unshift({ t: Date.now(), msg, hint: hint || '' }); if (this.errors.length > 30) this.errors.pop(); }
  url() { return ''; }
  connect() {
    this.wanted = true; this._rc = 0; this.errors = this.errors.slice(0, 30);
    const ep = this.endpoint(), bad = validateEndpoint(ep.ip, ep.port);
    if (bad) { this.state = 'error'; this.err('Invalid endpoint: ' + bad, 'Fix the IP address or port of the selected node.'); return; }
    this._open();
  }
  disconnect() {
    this.wanted = false; clearTimeout(this._rt); clearInterval(this._hb);
    if (this.ws) { try { this.ws.onclose = null; this.ws.close(1000); } catch (e) { /* already closed */ } this.ws = null; }
    this.state = 'idle'; this.opcDown = false; this.mbDown = false; this._disc();
  }
  _disc() { }
  _open() {
    const url = this.url(); if (!url) { this.state = 'error'; this.err('No URL', 'Fill in the gateway / broker URL.'); return; }
    if (!/^wss:\/\//i.test(url)) { this.state = 'error'; this.err('Only secure WebSocket (wss://) endpoints are allowed: ' + url, 'Use a wss:// URL. A plain ws:// socket is blocked from an https page anyway.'); return; }
    clearInterval(this._hb);
    this.state = 'connecting';
    let ws;
    try { ws = this.cfg && this.cfg.subproto ? new WebSocket(url, this.cfg.subproto) : (this.protocols ? new WebSocket(url, this.protocols) : new WebSocket(url)); }
    catch (e) { this.state = 'error'; this.err('Cannot create socket: ' + e.message, 'Check the URL syntax.'); return; }
    ws.binaryType = 'arraybuffer'; this.ws = ws;
    this._to = setTimeout(() => { if (this.ws === ws && this.state === 'connecting') { this.err('Connection timeout (8 s)', WS_HINT); try { ws.close(); } catch (e) { /* noop */ } } }, 8000);
    ws.onopen = () => { clearTimeout(this._to); this.state = 'open'; this.connectedAt = Date.now(); this._rc = 0; this.lastOk = Date.now(); this._onOpen(); };
    ws.onmessage = ev => { this.rx++; this.lastRx = Date.now(); this._rxWin.push(this.lastRx); this.rxBytes += (ev.data && (ev.data.byteLength || ev.data.length)) || 0; try { this._onMsg(ev.data); } catch (e) { this.rej++; this.err('Message handling error: ' + e.message); } };
    ws.onerror = () => { if (this.state === 'connecting') this.err('WebSocket error while connecting', WS_HINT); else this.err('WebSocket error', 'The connection was interrupted.'); };
    ws.onclose = ev => {
      clearTimeout(this._to); clearInterval(this._hb);
      if (this.ws !== ws) return; this.ws = null;
      const was = this.state; if (was !== 'error') this.state = this.wanted ? 'reconnecting' : 'idle'; this._disc();
      if (was !== 'idle') this.err('Connection closed (code ' + ev.code + (ev.reason ? ', ' + ev.reason : '') + ')', ev.code === 1006 ? 'Abnormal close: network drop, server crash or refused handshake.' : '');
      if (this.wanted) { const d = Math.min(15000, 1500 * Math.pow(2, this._rc++)); this._rt = setTimeout(() => { if (this.wanted) this._open(); }, d); }
    };
  }
  send(obj) { if (!this.ws || this.ws.readyState !== 1) return false; const s = typeof obj === 'string' ? obj : JSON.stringify(obj); this.ws.send(s); this.tx++; this.lastSend = Date.now(); return true; }
  accept(tag, raw, ts, q) { if (store.set(tag, raw, ts, 'LIVE', q)) { this.lastOk = Date.now(); return true; } this.rej++; this.err('Rejected sample: ' + store.lastRej); return false; }
  /* flat JSON payload: {ts, tags:{..}} | {tag,value,ts} | [{tag,value,ts}] */
  ingestJson(o) {
    if (Array.isArray(o)) { o.forEach(x => this.ingestJson(x)); return; }
    if (!o || typeof o !== 'object') { this.rej++; return; }
    if (o.tags && typeof o.tags === 'object') { Object.keys(o.tags).forEach(k => this.accept(k, o.tags[k], o.ts)); return; }
    if (o.tag !== undefined && 'value' in o) { this.accept(o.tag, o.value, o.ts, o.quality && String(o.quality).toLowerCase() !== 'good' ? 'bad' : 'good'); return; }
    this.rej++;
  }
  health() {
    const fresh = Date.now() - this.lastRx < 3000;
    if (this.state === 'connected' || this.state === 'open') return fresh ? 'ok' : 'warn';
    if (this.state === 'connecting' || this.state === 'reconnecting') return 'warn';
    if (this.state === 'error') return 'bad';
    return 'off';
  }
  tick() { const n = Date.now(); this._rxWin = this._rxWin.filter(t => n - t < 5000); this.rate = this._rxWin.length / 5; }
  write() { return false; }
  _onOpen() { this.state = 'connected'; }
  _onMsg() { }
}

class WssAdapter extends Adapter {
  url() { const e = this.endpoint(); return 'wss://' + e.ip + ':' + e.port + (this.cfg.path || '/'); }
  _onOpen() {
    this.state = 'connected';
    if (this.cfg.token) this.send({ op: 'auth', token: this.cfg.token });
    this.send({ op: 'subscribe', tags: IO.map(d => d.id) });
    this._hb = setInterval(() => this.send({ op: 'ping', t: Date.now() }), 5000);
  }
  _onMsg(d) {
    const o = JSON.parse(typeof d === 'string' ? d : new TextDecoder().decode(d));
    if (o && o.op === 'pong') { this.rtt = Date.now() - o.t; this.lastOk = Date.now(); return; }
    if (o && o.op === 'diag') { this.diag = o; return; }
    if (o && o.op === 'error') { this.err('Server: ' + (o.msg || o.code)); return; }
    this.ingestJson(o);
  }
  write(tag, val) { return this.send({ op: 'write', tag, value: val ? 1 : 0 }); }
}

/* minimal MQTT 3.1.1 client over WebSocket */
const MQ = {
  str(s) { const b = new TextEncoder().encode(s); const o = new Uint8Array(2 + b.length); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; },
  rl(n) { const a = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; a.push(d); } while (n > 0); return a; },
  pack(type, flags, body) { const rl = MQ.rl(body.length); const o = new Uint8Array(1 + rl.length + body.length); o[0] = (type << 4) | flags; o.set(rl, 1); o.set(body, 1 + rl.length); return o; },
  cat(parts) { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let k = 0; parts.forEach(p => { o.set(p, k); k += p.length; }); return o; },
  connect(id, user, pass, keep) {
    let fl = 0x02; if (user) fl |= 0x80; if (pass) fl |= 0x40;
    const parts = [MQ.str('MQTT'), Uint8Array.of(4, fl, keep >> 8, keep & 255), MQ.str(id)];
    if (user) parts.push(MQ.str(user)); if (pass) parts.push(MQ.str(pass));
    return MQ.pack(1, 0, MQ.cat(parts));
  },
  subscribe(pid, topic, qos) { return MQ.pack(8, 2, MQ.cat([Uint8Array.of(pid >> 8, pid & 255), MQ.str(topic), Uint8Array.of(qos)])); },
  publish(topic, payload, qos, pid) { const p = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload; const parts = [MQ.str(topic)]; if (qos) parts.push(Uint8Array.of(pid >> 8, pid & 255)); parts.push(p); return MQ.pack(3, qos << 1, MQ.cat(parts)); },
  /* split a byte buffer into complete packets; returns {pkts, rest} */
  parse(buf) {
    const pkts = []; let i = 0;
    while (i + 2 <= buf.length) {
      let mul = 1, len = 0, j = i + 1, b, ok = false;
      do { if (j >= buf.length) { ok = false; break; } b = buf[j++]; len += (b & 127) * mul; mul *= 128; ok = true; } while (b & 128);
      if (!ok || j + len > buf.length) break;
      pkts.push({ type: buf[i] >> 4, flags: buf[i] & 15, body: buf.slice(j, j + len) });
      i = j + len;
    }
    return { pkts, rest: buf.slice(i) };
  }
};
const MQ_RC = ['Accepted', 'Unacceptable protocol version', 'Client identifier rejected', 'Broker unavailable', 'Bad user name or password', 'Not authorised'];

class MqttAdapter extends Adapter {
  constructor(n) { super(n); this.protocols = ['mqtt']; this.buf = new Uint8Array(0); this.pid = 1; }
  url() { const e = this.endpoint(); return 'wss://' + e.ip + ':' + e.port + (this.cfg.path || '/mqtt'); }
  _onOpen() { this.state = 'open'; this.buf = new Uint8Array(0); this.ws.send(MQ.connect(this.cfg.clientId || 'twin', this.cfg.user, this.cfg.pass, 30)); this.tx++; this._hb = setInterval(() => { if (this.ws && this.ws.readyState === 1) { this._ping = Date.now(); this.ws.send(Uint8Array.of(0xC0, 0)); this.tx++; } }, 15000); }
  _onMsg(d) {
    const u = d instanceof ArrayBuffer ? new Uint8Array(d) : new TextEncoder().encode(d);
    this.buf = MQ.cat([this.buf, u]);
    const r = MQ.parse(this.buf); this.buf = r.rest;
    r.pkts.forEach(p => this._pkt(p));
  }
  _pkt(p) {
    if (p.type === 2) {
      const rc = p.body[1];
      if (rc === 0) { this.state = 'connected'; this.lastOk = Date.now(); this.ws.send(MQ.subscribe(this.pid++, (this.cfg.base || 'plant/tank1') + '/#', Number(this.cfg.qos) || 0)); this.tx++; }
      else { this.err('Broker refused the connection: ' + (MQ_RC[rc] || 'code ' + rc), rc === 4 || rc === 5 ? 'Check user name and password.' : ''); this.wanted = false; this.state = 'error'; try { this.ws.close(); } catch (e) { /* noop */ } }
    } else if (p.type === 9) { if (p.body[2] === 0x80) this.err('Broker rejected the subscription', 'Check the topic ACL for this client.'); }
    else if (p.type === 13) { if (this._ping) { this.rtt = Date.now() - this._ping; this.lastOk = Date.now(); } }
    else if (p.type === 3) {
      const qos = (p.flags >> 1) & 3, tl = (p.body[0] << 8) | p.body[1];
      const topic = new TextDecoder().decode(p.body.slice(2, 2 + tl)); let o = 2 + tl, pid = 0;
      if (qos > 0) { pid = (p.body[o] << 8) | p.body[o + 1]; o += 2; if (this.ws && this.ws.readyState === 1) { this.ws.send(Uint8Array.of(0x40, 2, pid >> 8, pid & 255)); this.tx++; } }
      const txt = new TextDecoder().decode(p.body.slice(o)).trim();
      const tag = topic.split('/').pop();
      if (!IOMAP[tag]) { this.rej++; return; }
      let val = txt, ts;
      if (txt[0] === '{') { try { const j = JSON.parse(txt); val = j.v !== undefined ? j.v : j.value; ts = j.ts; } catch (e) { this.rej++; this.err('Bad JSON payload on ' + topic); return; } }
      this.accept(tag, val, ts);
    }
  }
  write(tag, val) { if (!this.ws || this.ws.readyState !== 1) return false; this.ws.send(MQ.publish((this.cfg.base || 'plant/tank1') + '/cmd/' + tag, val ? '1' : '0', 1, this.pid++ & 0xFFFF || 1)); this.tx++; return true; }
}

class GatewayAdapter extends Adapter {
  url() { return this.cfg.gateway || ''; }
  _onMsg(d) {
    const o = JSON.parse(typeof d === 'string' ? d : new TextDecoder().decode(d));
    if (o.op === 'diag') { this.diag = o; this.lastOk = Date.now(); return; }
    if (o.op === 'pong') { this.rtt = Date.now() - o.t; this.lastOk = Date.now(); return; }
    this._gw(o);
  }
  _onOpen() { this.state = 'open'; this._hello(); this._hb = setInterval(() => this.send({ op: 'ping', t: Date.now() }), 5000); }
}

class OpcUaAdapter extends GatewayAdapter {
  _hello() { const e = this.endpoint(); this.send({ op: 'open', endpoint: 'opc.tcp://' + e.ip + ':' + e.port, security: this.cfg.security, auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass } : null }); }
  _gw(o) {
    if (o.op === 'status') {
      if (o.state === 'connected') { this.state = 'connected'; this.opcDown = false; this.lastOk = Date.now(); this.send({ op: 'subscribe', interval: Number(this.cfg.interval) || 500, items: Object.keys(this.cfg.nodes).map(t => ({ tag: t, nodeId: this.cfg.nodes[t] })) }); }
      else { this.state = 'reconnecting'; this.opcDown = true; this.err('OPC UA session ' + o.state + (o.code ? ' (' + o.code + ')' : ''), 'The gateway lost its session to the OPC UA server.'); }
    } else if (o.op === 'error') { this.opcDown = /^Bad/.test(o.code || ''); this.err('OPC UA ' + (o.code || 'error') + (o.msg ? ': ' + o.msg : ''), o.code === 'BadIdentityTokenRejected' ? 'User name or password rejected.' : o.code === 'BadSecurityChecksFailed' ? 'Certificate not trusted by the server.' : o.code === 'BadNodeIdUnknown' ? 'A NodeId in the map does not exist on the server.' : ''); }
    else if (o.op === 'data' && Array.isArray(o.items)) {
      o.items.forEach(it => { const st = String(it.status || 'Good'); const q = st.indexOf('Good') === 0 ? 'good' : st.indexOf('Uncertain') === 0 ? 'uncertain' : 'bad'; this.accept(it.tag, it.value, it.ts, q === 'uncertain' ? 'good' : q); if (q === 'bad') this.err('Node ' + it.tag + ' status ' + st); });
      this.opcDown = false;
    }
  }
  write(tag, val) { const id = this.cfg.nodes[tag]; return id ? this.send({ op: 'write', nodeId: id, value: !!val }) : false; }
}

class ModbusAdapter extends GatewayAdapter {
  constructor(n) { super(n); this.tid = 1; this.pending = {}; this.misses = 0; }
  _disc() { clearInterval(this._poll); this.pending = {}; }
  _hello() {
    const e = this.endpoint();
    this.send({ op: 'open', host: e.ip, port: e.port, unit: Number(this.cfg.unit) || 1 }); this.state = 'connected';
    this._plan(); clearInterval(this._poll);
    this._poll = setInterval(() => this._pollOnce(), Math.max(100, Number(this.cfg.pollMs) || 500));
  }
  _plan() {
    const FC = { coil: 1, discrete: 2, holding: 3, input: 4 }, groups = {}, map = Array.isArray(this.cfg.map) ? this.cfg.map : [];
    map.forEach(m => { const fc = FC[m.area]; if (!fc || !IOMAP[m.tag]) return; const w = (m.type === 'float32' || m.type === 'uint32' || m.type === 'int32') ? 2 : 1; (groups[fc] = groups[fc] || []).push({ a: Number(m.addr), w, m }); });
    this.reqs = [];
    Object.keys(groups).forEach(fc => {
      const lim = (fc <= 2) ? 2000 : 120, arr = groups[fc].sort((x, y) => x.a - y.a); let cur = null;
      arr.forEach(x => { if (cur && x.a + x.w - cur.addr <= lim && x.a - (cur.addr + cur.count) <= 8) cur.count = Math.max(cur.count, x.a + x.w - cur.addr); else { cur = { fc: Number(fc), addr: x.a, count: x.w }; this.reqs.push(cur); } });
    });
  }
  _pollOnce() {
    const now = Date.now();
    Object.keys(this.pending).forEach(k => { if (now - this.pending[k].t > Math.max(2000, (Number(this.cfg.pollMs) || 500) * 4)) { delete this.pending[k]; this.misses++; } });
    if (this.misses >= 3) { if (!this.mbDown) this.err('Modbus: 3 polls without a response', 'The gateway or the Modbus device (unit ' + this.cfg.unit + ') is not answering.'); this.mbDown = true; }
    if (Object.keys(this.pending).length > 8) return;
    (this.reqs || []).forEach(r => { const id = this.tid++ & 0xFFFF; this.pending[id] = { t: now, r }; this.send({ op: 'modbus', tid: id, unit: Number(this.cfg.unit) || 1, fc: r.fc, addr: r.addr, count: r.count }); });
  }
  _gw(o) {
    if (o.op === 'status' && o.state && o.state !== 'connected') { this.mbDown = true; this.err('Modbus gateway: ' + o.state, 'The TCP connection from the gateway to ' + this.endpoint().ip + ' is down.'); return; }
    if (o.op !== 'modbus') return;
    const p = this.pending[o.tid]; if (!p) return; delete this.pending[o.tid];
    this.rtt = Date.now() - p.t;
    if (o.exception) { const c = Number(o.exception); this.err('Modbus exception 0x' + c.toString(16).toUpperCase().padStart(2, '0') + ' FC' + p.r.fc + ' @' + p.r.addr + ': ' + (MB_EXC[c] || 'unknown'), 'Block ' + p.r.addr + '..' + (p.r.addr + p.r.count - 1)); this.rej++; if (c === 10 || c === 11) this.mbDown = true; return; }
    this.misses = 0; this.mbDown = false; this.lastOk = Date.now();
    const base = p.r.addr, fc = p.r.fc, ts = Date.now();
    (this.cfg.map || []).forEach(m => {
      const FCm = { coil: 1, discrete: 2, holding: 3, input: 4 }[m.area]; if (FCm !== fc) return;
      const off = Number(m.addr) - base; if (off < 0 || off >= p.r.count) return;
      if (fc <= 2) { const b = o.bits ? o.bits[off] : undefined; if (b !== undefined) this.accept(m.tag, !!b, ts); return; }
      const R = o.regs; if (!R) return;
      let val;
      if (m.type === 'float32') { if (off + 1 >= R.length) return; let hi = R[off], lo = R[off + 1]; if (this.cfg.wordOrder === 'little') { const t = hi; hi = lo; lo = t; } const dv = new DataView(new ArrayBuffer(4)); dv.setUint16(0, hi & 0xFFFF); dv.setUint16(2, lo & 0xFFFF); val = dv.getFloat32(0); }
      else if (m.type === 'int16') { val = (R[off] << 16) >> 16; } else val = R[off] & 0xFFFF;
      if (m.scale) val = val * m.scale; if (m.offset) val += m.offset;
      this.accept(m.tag, val, ts);
    });
  }
  write(tag, val) { const m = (this.cfg.map || []).find(x => x.tag === tag && x.area === 'coil'); return m ? this.send({ op: 'modbus-write', unit: Number(this.cfg.unit) || 1, fc: 5, addr: Number(m.addr), value: val ? 1 : 0 }) : false; }
}

class TcpAdapter extends GatewayAdapter {
  constructor(n) { super(n); this.lb = ''; }
  _hello() { const e = this.endpoint(); this.lb = ''; this.send({ op: 'connect', host: e.ip, port: e.port }); }
  _gw(o) {
    if (o.op === 'status') { if (o.state === 'connected') { this.state = 'connected'; this.lastOk = Date.now(); } else { this.state = 'reconnecting'; this.err('TCP target ' + o.state + (o.code ? ' (' + o.code + ')' : ''), o.code === 'ECONNREFUSED' ? 'Nothing is listening on ' + this.endpoint().ip + ':' + this.endpoint().port + '.' : o.code === 'ETIMEDOUT' ? 'Host did not answer: cable, firewall or wrong IP.' : ''); } }
    else if (o.op === 'rx' && typeof o.data === 'string') {
      this.lb += o.data; let i; const ts = Date.now();
      while ((i = this.lb.indexOf('\n')) >= 0) { const line = this.lb.slice(0, i).trim(); this.lb = this.lb.slice(i + 1); if (line) this._line(line, ts); }
      if (this.lb.length > 8192) { this.lb = ''; this.err('Line buffer overflow: no newline framing seen', 'Check the message format setting.'); }
    }
  }
  _line(s, ts) {
    if (this.cfg.format === 'kv') { s.split(/[;,]/).forEach(kv => { const m = kv.split('='); if (m.length === 2) this.accept(m[0].trim(), m[1].trim(), ts); }); }
    else { try { this.ingestJson(JSON.parse(s)); } catch (e) { this.rej++; this.err('Bad JSON line: ' + s.slice(0, 60)); } }
  }
  write(tag, val) { return this.send({ op: 'tx', data: String(this.cfg.cmdTemplate || 'SET {tag} {value}\\n').replace('{tag}', tag).replace('{value}', val ? 1 : 0).replace(/\\n/g, '\n') }); }
}

const adapters = {
  'WSS': new WssAdapter('WSS'), 'MQTT': new MqttAdapter('MQTT'), 'OPC UA': new OpcUaAdapter('OPC UA'),
  'Modbus TCP': new ModbusAdapter('Modbus TCP'), 'TCP/IP': new TcpAdapter('TCP/IP')
};
const tapAdapter = () => adapters[comm.tap.protocol];
function disconnectAll() { Object.values(adapters).forEach(a => a.disconnect()); }
function sendCommand(tag, val) {
  if (app.mode !== 'live' || !comm.allowCommands) return 'Commands are disabled. Enable them in Topology > Data path.';
  const a = tapAdapter(); if (a.state !== 'connected') return 'Not connected.';
  return a.write(tag, val) ? '' : 'The ' + a.name + ' adapter could not send this command (no mapping for ' + tag + ').';
}

/* ---------- communication snapshot for the UI ---------- */
function commSnapshot() {
  const now = Date.now(), mode = app.mode, out = { nodes: {}, links: {}, twin: {}, mode };
  const mk = (st, comm_, tx, lastOk, extra) => Object.assign({ st, comm: comm_, tx, lastOk, rtt: null, errors: [], hint: '' }, extra || {});
  if (mode === 'sim') {
    const rtt = () => 3 + Math.random() * 5;
    const tapLost = sim.commLoss;
    ['softpac', 'switch', 'opc', 'field'].forEach(k => { out.nodes[k] = mk('sim', 'Simulated link OK', 'Simulated traffic', now, { rtt: rtt() }); });
    if (tapLost) { out.nodes.softpac = mk('bad', 'No response (simulated fault)', 'None', app.lastDataTs, { hint: 'Simulated communication loss. Clear faults to restore.' }); ['switch', 'opc', 'field'].forEach(k => { out.nodes[k] = mk('unk', 'Not reachable from the twin', 'None', app.lastDataTs); }); }
    if (sim.opcFail) { out.nodes.opc = mk('bad', 'OPC UA session lost (simulated)', 'No data', app.lastDataTs, { hint: 'Simulated BadSessionClosed.' }); out.nodes.field = mk('unk', 'Unknown, upstream is down', 'None', app.lastDataTs); }
    if (sim.mbFail) { out.nodes.field = mk('bad', 'Modbus TCP timeout (simulated)', 'No data', app.lastDataTs, { hint: 'Simulated: no response from unit 1.' }); }
    out.links.L1 = { st: tapLost ? 'unk' : 'sim', pps: tapLost ? 0 : 5 };
    out.links.L2 = { st: tapLost ? 'unk' : (sim.opcFail ? 'bad' : 'sim'), pps: (tapLost || sim.opcFail) ? 0 : 5 };
    out.links.L3 = { st: tapLost ? 'unk' : (sim.opcFail ? 'unk' : (sim.mbFail ? 'bad' : 'sim')), pps: (tapLost || sim.opcFail || sim.mbFail) ? 0 : 5 };
    out.twin = { st: tapLost ? 'bad' : 'sim', pps: tapLost ? 0 : 5, label: 'Simulated (no hardware)' };
    return out;
  }
  const a = tapAdapter(), tn = comm.tap.node, h = a.health();
  const stOf = { ok: 'ok', warn: 'warn', bad: 'bad', off: 'off' };
  ['softpac', 'switch', 'opc', 'field'].forEach(k => {
    if (mode === 'offline') { out.nodes[k] = mk('off', 'Offline mode: no communication', 'None', k === tn ? a.lastOk || app.lastDataTs : app.lastDataTs, { hint: 'Switch to LIVE and connect to resume.' }); return; }
    if (k === tn) {
      const lab = { idle: 'Not connected', connecting: 'Connecting...', open: 'Handshaking...', connected: 'Connected', reconnecting: 'Reconnecting...', error: 'Error' }[a.state] || a.state;
      out.nodes[k] = mk(stOf[h], lab + ' via ' + a.name, a.rate > 0.05 ? a.rate.toFixed(1) + ' msg/s received' : 'No data', a.lastOk, { rtt: a.rtt, errors: a.errors, hint: a.errors[0] ? a.errors[0].hint : (a.state === 'idle' ? 'Press Connect in the data path panel.' : '') });
      if (k === 'opc' && a.opcDown) out.nodes[k].st = 'bad';
      if (k === 'field' && a.mbDown) out.nodes[k].st = 'bad';
    } else {
      const dg = a.diag && a.diag.nodes && a.diag.nodes[k];
      if (dg) out.nodes[k] = mk(dg.state === 'ok' ? 'ok' : dg.state === 'warn' ? 'warn' : 'bad', dg.msg || 'Reported by gateway', 'Not measured by twin', dg.lastOk || a.lastOk, { rtt: dg.rtt || null, hint: dg.hint || '' });
      else out.nodes[k] = mk('unk', 'Not reported by the data source', 'Not measured by twin', 0, { hint: 'Only the node the twin is connected to can be verified. Add a diag message in the gateway to report this node.' });
    }
  });
  const nst = k => out.nodes[k].st;
  const lk = (x, y) => { const s = [nst(x), nst(y)]; return s.includes('bad') ? 'bad' : s.includes('off') ? 'off' : s.includes('unk') ? 'unk' : s.includes('warn') ? 'warn' : 'ok'; };
  out.links.L1 = { st: lk('softpac', 'switch'), pps: a.rate }; out.links.L2 = { st: lk('switch', 'opc'), pps: a.rate }; out.links.L3 = { st: lk('opc', 'field'), pps: a.rate };
  out.twin = { st: mode === 'offline' ? 'off' : stOf[h], pps: a.rate, label: a.state };
  return out;
}

/* =====================================================================
   ALARM MANAGEMENT
   ===================================================================== */
const SEV_RANK = { crit: 3, high: 2, warn: 1 };
const SEV_LABEL = { crit: 'CRITICAL', high: 'HIGH', warn: 'WARNING' };
const alarms = { list: [], seq: 1, st: {}, toasts: [] };
const ADEFS = [];
function defAlarm(a) { ADEFS.push(a); }
defAlarm({ key: 'LVL_HIGH', sev: 'high', comp: 'tank', text: 'High water level', data: true, delay: 2, test: (c, p) => ({ on: c.lvlOk && ((p ? c.pct >= app.limits.high - 2 : c.pct >= app.limits.high) || S.lsh), val: fnum(c.pct, 1) + ' %' }) });
defAlarm({ key: 'LVL_LOW', sev: 'warn', comp: 'tank', text: 'Low water level', data: true, delay: 2, test: (c, p) => ({ on: c.lvlOk && ((p ? c.pct <= app.limits.low + 2 : c.pct <= app.limits.low) || S.lsl) && c.pct > app.limits.crit, val: fnum(c.pct, 1) + ' %' }) });
defAlarm({ key: 'LVL_CRIT', sev: 'crit', comp: 'tank', text: 'Critical low water level', data: true, delay: 1, test: (c, p) => ({ on: c.lvlOk && (p ? c.pct <= app.limits.crit + 2 : c.pct <= app.limits.crit), val: fnum(c.pct, 1) + ' %' }) });
for (let i = 0; i < 3; i++) {
  const n = i + 1;
  defAlarm({ key: 'PUMP_FAIL' + n, sev: 'crit', comp: 'pump' + n, text: 'Pump ' + n + ' failure', data: true, delay: 0, test: () => { const p = S.pumps[i]; if (!p.known) return { on: false }; if (p.fault) return { on: true, val: 'Fault feedback active' }; return { on: p.cmd === true && !p.run, delayed: 6, val: 'Start command, no run feedback' }; } });
  defAlarm({ key: 'PUMP_OVL' + n, sev: 'high', comp: 'pump' + n, text: 'Pump ' + n + ' motor overload', data: true, delay: 3, test: (c, p) => { const a = S.pumps[i].amps; return { on: a != null && a > (p ? MOTOR_OVL - 0.5 : MOTOR_OVL), val: fnum(a, 1) + ' A (limit ' + MOTOR_OVL + ' A)' }; } });
  defAlarm({
    key: 'VALVE_FAIL' + n, sev: 'high', comp: 'valve' + n, text: 'Valve ' + n + ' failure', data: true, delay: 0, test: () => {
      const v = S.valves[i]; if (!v.known) return { on: false };
      if (v.zso && v.zsc) return { on: true, delayed: 3, val: 'Open and closed limits both active' };
      if (v.cmdO === true && v.cmdC !== true && !v.zso) return { on: true, delayed: 30, val: 'Failed to open (' + Math.round(v.pos * 100) + ' %)' };
      if (v.cmdC === true && v.cmdO !== true && !v.zsc) return { on: true, delayed: 30, val: 'Failed to close (' + Math.round(v.pos * 100) + ' %)' };
      return { on: false };
    }
  });
}
defAlarm({ key: 'SENSOR', sev: 'crit', comp: 'level', text: 'Level sensor disconnected / signal out of range', data: true, delay: 2, test: () => { const l = S.lt; return { on: !!(l && l.v !== null && l.q === 'bad'), val: l && l.v !== null ? fnum(l.v, 2) + ' mA' : '--' }; } });
defAlarm({ key: 'ESTOP', sev: 'crit', comp: null, text: 'Emergency stop active', data: true, delay: 0, test: () => ({ on: S.estop, val: 'DI ESTOP = 1' }) });
defAlarm({ key: 'MCC', sev: 'high', comp: null, text: 'Motor protection trip (MCC)', data: true, delay: 0, test: () => ({ on: S.mcc, val: 'DI MCC_TRIP = 1' }) });
defAlarm({ key: 'COMM', sev: 'crit', comp: null, text: 'Communication loss', data: false, delay: 0, test: () => {
  if (app.mode === 'offline') return { on: true, val: 'Offline mode: no communication' };
  if (app.mode === 'sim') return { on: sim.commLoss && (Date.now() - app.lastDataTs > app.staleMs), val: 'No data for ' + ((Date.now() - app.lastDataTs) / 1000).toFixed(0) + ' s' };
  const a = tapAdapter(); const age = (Date.now() - (app.lastDataTs || app.liveStart || Date.now())) / 1000;
  const lost = a.state !== 'connected' || (app.lastDataTs > 0 ? age > app.staleMs / 1000 : (Date.now() - (a.connectedAt || app.liveStart || Date.now())) > app.staleMs);
  return { on: lost, val: a.state !== 'connected' ? 'Adapter ' + a.state : 'No data for ' + age.toFixed(0) + ' s' };
} });
defAlarm({ key: 'OPC', sev: 'crit', comp: null, text: 'OPC UA server connection failure', data: false, delay: 0, test: () => {
  if (app.mode === 'sim') return { on: sim.opcFail, val: 'Session closed (simulated)' };
  if (app.mode !== 'live') return { on: false };
  const a = tapAdapter(), d = a.diag && a.diag.nodes && a.diag.nodes.opc;
  return { on: !!((comm.tap.protocol === 'OPC UA' && a.opcDown) || (d && d.state === 'bad')), val: d && d.msg ? d.msg : 'OPC UA session down' };
} });
defAlarm({ key: 'MODBUS', sev: 'crit', comp: null, text: 'Modbus TCP connection failure', data: false, delay: 0, test: () => {
  if (app.mode === 'sim') return { on: sim.mbFail, val: 'Timeout, unit 1 (simulated)' };
  if (app.mode !== 'live') return { on: false };
  const a = tapAdapter(), d = a.diag && a.diag.nodes && a.diag.nodes.field;
  return { on: !!((comm.tap.protocol === 'Modbus TCP' && a.mbDown) || (d && d.state === 'bad')), val: d && d.msg ? d.msg : 'Modbus polls unanswered' };
} });

function pushToast(a) { alarms.toasts.push({ t: Date.now(), id: a.id, sev: a.sev, text: a.text + ' (' + a.value + ')' }); if (alarms.toasts.length > 4) alarms.toasts.shift(); alarms.toastDirty = true; }
function evalAlarms() {
  if (app.mode === 'offline' && alarms.frozen) return;
  const T = procT(), now = Date.now();
  const c = { lvlOk: S.levelOk && S.hasLevel && app.mode !== 'offline', pct: S.levelPct };
  const dataOk = app.mode === 'offline' ? false : S.dataValid;
  ADEFS.forEach(d => {
    let st = alarms.st[d.key]; if (!st) st = alarms.st[d.key] = { on: false, since: null, rec: null };
    if (d.data && !dataOk) return;                            // freeze data-driven alarms while data is invalid
    const r = d.test(c, st.on) || { on: false };
    let on = !!r.on;
    const need = r.delayed != null ? r.delayed : (d.delay || 0);
    if (on) { if (st.since == null) st.since = T; if (T - st.since < need) on = st.on; } else st.since = null;
    if (on && !st.on) {
      const rec = { id: alarms.seq++, key: d.key, sev: d.sev, comp: d.comp, text: d.text, value: r.val || '', loc: d.comp ? COMPS[d.comp].loc : 'System level', tRaise: now, tAck: 0, tClear: 0, state: 'active', acked: false, src: S.src };
      alarms.list.unshift(rec); if (alarms.list.length > 400) alarms.list.pop();
      st.rec = rec; pushToast(rec);
    } else if (!on && st.on && st.rec) {
      const rec = st.rec; if (rec.acked) { rec.state = 'cleared'; rec.tClear = now; } else { rec.state = 'rtn'; rec.tRtn = now; }
      st.rec = null;
    } else if (on && st.rec && r.val) st.rec.live = r.val;
    st.on = on;
  });
}
function ackAlarm(id) { const a = alarms.list.find(x => x.id === id); if (!a) return; a.acked = true; a.tAck = Date.now(); if (a.state === 'rtn') { a.state = 'cleared'; a.tClear = Date.now(); } }
function ackAll() { alarms.list.forEach(a => { if (a.state !== 'cleared' && !a.acked) ackAlarm(a.id); }); }
function resetAlarms(reason) {
  const now = Date.now();
  alarms.list.forEach(a => { if (a.state !== 'cleared') { a.state = 'cleared'; a.tClear = now; a.note = reason; } });
  alarms.st = {}; alarms.toasts = [];
}
const activeAlarms = () => alarms.list.filter(a => a.state !== 'cleared');
function compAlarmMap() {
  const m = {};
  activeAlarms().forEach(a => { if (!a.comp) return; const cur = m[a.comp]; if (!cur || SEV_RANK[a.sev] > SEV_RANK[cur.sev]) m[a.comp] = { sev: a.sev, unack: !a.acked || a.state === 'rtn', state: a.state }; else if (!a.acked) cur.unack = true; });
  return m;
}

/* =====================================================================
   MODE MANAGEMENT
   ===================================================================== */
function setMode(m) {
  if (m === app.mode) return;
  const prev = app.mode;
  if (m === 'offline') {
    app.offlineSince = Date.now(); if (prev === 'sim') app.lastSrc = 'SIM'; else if (prev === 'live') app.lastSrc = 'LIVE';
    disconnectAll(); app.mode = 'offline';
    resetAlarms('Mode changed'); alarms.frozen = false; alarms.st = {};
    return;
  }
  disconnectAll(); resetAlarms('Mode changed'); store.clear(); app.lastDataTs = 0; app.lastSrc = null;
  S.hasLevel = false; S.levelM = 0; S.levelPct = 0; S.volL = 0;
  if (m === 'sim') { app.mode = 'sim'; sim.publish(); }
  if (m === 'live') {
    app.mode = 'live'; app.liveStart = Date.now(); app.t0 = performance.now();
    const bad = validateEndpoint(comm.nodes[comm.tap.node].ip, comm.nodes[comm.tap.node].port);
    if (!bad) tapAdapter().connect();
  }
}

/* main process tick, 10 Hz */
let _lastTick = performance.now(), _alarmAcc = 0;
function coreTick() {
  const n = performance.now(), dt = Math.min(0.5, (n - _lastTick) / 1000); _lastTick = n;
  if (app.mode === 'sim') { sim.step(dt); sim.publish(); }
  Object.values(adapters).forEach(a => a.tick());
  deriveState(app.mode === 'sim' ? dt * sim.speed : dt);
  _alarmAcc += dt; if (_alarmAcc >= 0.25) { _alarmAcc = 0; evalAlarms(); }
}
