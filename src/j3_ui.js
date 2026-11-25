/* =====================================================================
   UI LAYER : HUD, detail panel, topology, I/O, alarms, trends, main loop
   ===================================================================== */
const UI = { sheet: null, sub: 'topo', sel: { kind: 'node', id: 'softpac' }, snap: null, lastMode: null, almFilter: 'active', sig: {}, dpBuilt: false };
const ST_COL = { ok: '#36e08a', sim: '#b58bff', warn: '#ffbf3d', bad: '#ff4d5e', off: '#5d7794', unk: '#5d7794' };
const ST_TXT = { ok: 'OK', sim: 'Simulated', warn: 'Degraded', bad: 'Fault', off: 'Offline', unk: 'Unknown' };
const ST_PILL = { ok: 'good', sim: 'sim', warn: 'warn', bad: 'bad', off: '', unk: '' };
const NODE_LINES = { softpac: ['SoftPAC Runtime', '+ HMI'], switch: ['Industrial', 'Ethernet Switch'], opc: ['OPC UA Server', '/ CRD'], field: ['Field Devices', '(I/O)'] };
const NODE_X = { softpac: 10, switch: 215, opc: 420, field: 625 };
const LINK_ENDS = { L1: ['softpac', 'switch'], L2: ['switch', 'opc'], L3: ['opc', 'field'] };

const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
const setCls = (el, c) => { if (el && el.className !== c) el.className = c; };
function uiToast(text, sev) { alarms.toasts.push({ t: Date.now(), id: 'ui', sev: sev || 'warn', text }); if (alarms.toasts.length > 4) alarms.toasts.shift(); alarms.toastDirty = true; }
const qPill = q => ({ good: ['Good', 'good'], uncertain: ['Uncertain', 'warn'], stale: ['Stale', 'warn'], bad: ['Bad', 'bad'], none: ['No data', ''] }[q] || ['--', '']);
const stateWord = (d, v) => v === null || v === undefined ? '--' : (v ? d.on : d.off);

/* ---------------- header, banner, summary ---------------- */
function updateHud() {
  const snap = UI.snap = commSnapshot(), m = app.mode, now = new Date();
  setText($('#clk'), pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()));
  setText($('#dte'), pad2(now.getDate()) + '/' + pad2(now.getMonth() + 1) + '/' + now.getFullYear());
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  let dot = 'dot', lab = '', src = '', ban = null, bcls = '';
  if (m === 'sim') { dot += ' sim'; lab = 'Simulated'; src = 'Simulated data, not from hardware'; ban = 'SIMULATION MODE: all values are generated, none are hardware readings'; bcls = 'sim'; }
  else if (m === 'offline') { dot += ' warn'; lab = 'Offline'; src = 'Offline, last data' + (app.lastSrc ? ' (' + app.lastSrc + ')' : ''); ban = 'OFFLINE: showing last available data' + (app.lastDataTs ? ' from ' + hms(app.lastDataTs) : ', none received yet') + '. Communication is stopped.'; }
  else {
    const t = snap.twin, a = tapAdapter();
    src = 'Live via ' + comm.tap.protocol + ' at ' + comm.nodes[comm.tap.node].ip;
    if (t.st === 'ok' && S.dataValid) { dot += ' good'; lab = 'Live'; }
    else { dot += ' bad'; lab = 'Live: no data'; ban = a.state === 'error' && a.errors[0] ? 'LIVE MODE: ' + a.errors[0].msg : a.state === 'idle' ? 'LIVE MODE: not connected. Open Topology, then Data path, and press Connect.' : (S.dataValid ? 'LIVE MODE: connection degraded (' + a.state + ')' : 'COMMUNICATION LOSS: no valid data. Showing the last known values as stale.'); bcls = a.state === 'idle' ? '' : 'crit'; }
  }
  setCls($('#hdot'), dot); setText($('#hlabel'), lab); setText($('#srcline'), src);
  const b = $('#banner'); if (ban) { b.hidden = false; setText(b, ban); setCls(b, bcls); } else b.hidden = true;
  const hasL = S.hasLevel;
  setText($('#k-pct'), hasL ? fnum(S.levelPct, 0) : '--'); $('#k-bar').style.width = (hasL ? clamp(S.levelPct, 0, 100) : 0) + '%';
  setText($('#k-m'), hasL ? fnum(S.levelM, 2) + ' m' : '--');
  setText($('#k-vol'), hasL ? fnum(S.volL, 0) + ' L' : '--');
  setText($('#k-in'), S.qin != null ? fnum(S.qin, 1) + ' L/s' : 'n/a'); setText($('#k-out'), S.qout != null ? fnum(S.qout, 1) + ' L/s' : 'n/a');
  setText($('#k-t'), S.tempC != null ? fnum(S.tempC, 1) + ' °C' : 'n/a');
  const pe = $('#k-pumps'), ve = $('#k-valves');
  if (!pe.children.length) {
    for (let i = 0; i < 3; i++) { pe.insertAdjacentHTML('beforeend', '<div class="chip off" data-c="pump' + (i + 1) + '" tabindex="0" role="button"><small>P' + (i + 1) + '</small><b>--</b></div>'); ve.insertAdjacentHTML('beforeend', '<div class="chip off" data-c="valve' + (i + 1) + '" tabindex="0" role="button"><small>VLV-' + (i + 1) + '</small><b>--</b></div>'); }
  }
  for (let i = 0; i < 3; i++) {
    const p = S.pumps[i], pc = pe.children[i], v = S.valves[i], vc = ve.children[i];
    const stale = !S.dataValid && m !== 'sim';
    setCls(pc, 'chip ' + (!p.known ? 'off' : p.fault ? 'bad' : (p.run ? (stale ? 'warn' : 'good') : 'off'))); setText(pc.lastChild, !p.known ? '--' : p.fault ? 'Fault' : p.run ? 'Running' : 'Stopped');
    const vs = { open: 'Open', closed: 'Closed', travel: Math.round(v.pos * 100) + '%', fault: 'Fault', unknown: '--' }[v.state];
    setCls(vc, 'chip ' + ({ open: 'good', closed: 'off', travel: 'warn', fault: 'bad', unknown: 'off' }[v.state])); setText(vc.lastChild, vs);
  }
  const lq = S.lt ? qPill(S.lt.q) : ['--', '']; const se = $('#k-sens'); setText(se, S.sensorBad ? 'Fault' : lq[0]); se.style.color = S.sensorBad ? 'var(--crit)' : lq[1] === 'good' ? 'var(--good)' : lq[1] === 'warn' ? 'var(--warn)' : '';
  const ce = $('#k-comm'); setText(ce, ST_TXT[snap.twin.st] || '--'); ce.style.color = { ok: 'var(--good)', sim: 'var(--sim)', warn: 'var(--warn)', bad: 'var(--crit)' }[snap.twin.st] || '';
  const act = activeAlarms(), unack = act.filter(a => !a.acked || a.state === 'rtn').length;
  setText($('#k-alm'), String(act.length)); $('#k-alm').style.color = act.length ? 'var(--crit)' : '';
  const bd = $('#abadge'); bd.hidden = !unack; setText(bd, String(unack));
  // simulation panel
  const sc = $('#simctl'); sc.hidden = m !== 'sim';
  if (m === 'sim') {
    const lv = $('#s-lvl'); if (document.activeElement !== lv) lv.value = Math.round(sim.pct()); setText($('#s-lvv'), fnum(sim.pct(), 0) + ' %'); setText($('#s-spv'), sim.speed + 'x');
    const es = $('#s-estop'); setText(es, sim.estop ? 'Release E-Stop' : 'E-Stop'); es.classList.toggle('on', sim.estop);
  }
  // toasts
  const ts = alarms.toasts.filter(t => Date.now() - t.t < 6500); if (ts.length !== alarms.toasts.length) alarms.toasts = ts;
  const key = ts.map(t => t.t + t.text).join('|'); if (key !== UI.toastKey) { UI.toastKey = key; $('#toasts').innerHTML = ts.map(t => '<div class="toast ' + (t.sev === 'crit' || t.sev === 'high' ? '' : 'warn') + '">' + esc(t.text) + '</div>').join(''); }
}

/* ---------------- component detail panel ---------------- */
const dRow = (l, k) => '<span>' + l + '</span><span data-f="' + k + '">--</span>';
function pumpCmd(i, on) {
  if (app.mode === 'sim') { const p = sim.pumps[i]; p.auto = false; p.cmd = on; return; }
  const e = sendCommand('P' + (i + 1) + '_START', on ? 1 : 0); if (e) uiToast(e);
}
function valveCmd(i, open) {
  if (app.mode === 'sim') { const v = sim.valves[i]; v.auto = false; v.cmdO = open; return; }
  const n = i + 1, e = sendCommand('V' + n + (open ? '_OPEN' : '_CLOSE'), 1); if (e) { uiToast(e); return; } sendCommand('V' + n + (open ? '_CLOSE' : '_OPEN'), 0);
}
function buildDetail(id) {
  const host = $('#detail'), c = COMPS[id]; if (!c) { host.hidden = true; return; }
  let rows = '', ctl = '';
  const simOnly = app.mode === 'sim', can = simOnly || (app.mode === 'live' && comm.allowCommands);
  const dis = can ? '' : ' disabled';
  const note = can ? '' : '<p class="note">' + (app.mode === 'live' ? 'Commands are off. Enable them in Topology, Data path.' : 'Commands are not available in offline mode.') + '</p>';
  if (id === 'tank') {
    rows = dRow('Level', 'pct') + dRow('Level (height)', 'm') + dRow('Volume', 'vol') + dRow('Capacity', 'cap') + dRow('Inlet flow', 'qin') + dRow('Outlet flow', 'qout') + dRow('Water temp.', 'temp') + dRow('High-level switch', 'lsh') + dRow('Low-level switch', 'lsl');
    ctl = '<h3 class="sm">Alarm limits (% of level)</h3><div class="trio"><label class="f">High<input type="number" id="lim-high" min="50" max="100" value="' + app.limits.high + '"></label><label class="f">Low<input type="number" id="lim-low" min="5" max="60" value="' + app.limits.low + '"></label><label class="f">Critical<input type="number" id="lim-crit" min="1" max="30" value="' + app.limits.crit + '"></label></div>';
  } else if (id === 'level') {
    rows = dRow('Raw signal', 'raw') + dRow('Engineering value', 'eng') + dRow('Level', 'pct') + dRow('Signal quality', 'q') + dRow('Scaling', 'scale') + dRow('Last update', 'age') + dRow('Mounting', 'pos');
    ctl = '<div class="row"><button data-a="viewsensor">Show measuring point</button>' + (simOnly ? '<button data-a="sensor-open" id="d-sopen">Simulate disconnect</button>' : '') + '</div>';
  } else if (id === 'temp') {
    rows = dRow('Raw signal', 'raw') + dRow('Temperature', 'eng') + dRow('Signal quality', 'q') + dRow('Scaling', 'scale') + dRow('Last update', 'age');
  } else if (id.indexOf('pump') === 0) {
    const n = +id.slice(4);
    rows = dRow('Running feedback', 'run') + dRow('Fault feedback', 'flt') + dRow('Start command', 'cmd') + dRow('Motor current (limit ' + MOTOR_OVL + ' A)', 'amps') + dRow('Flow delivered', 'flow') + dRow('Runtime', 'rt') + dRow('Starts', 'starts') + (simOnly ? dRow('Control mode', 'mode') : '');
    ctl = '<div class="row"><button data-a="p-start"' + dis + '>Start</button><button data-a="p-stop"' + dis + '>Stop</button>' + (simOnly ? '<button data-a="p-auto">Auto</button><button data-a="p-fault" class="danger">Inject fault</button>' : '') + '</div>' + note;
  } else if (id.indexOf('valve') === 0) {
    rows = dRow('Position', 'pos') + dRow('State', 'st') + dRow('Open limit (ZSO)', 'zso') + dRow('Closed limit (ZSC)', 'zsc') + dRow('Open command', 'co') + dRow('Flow through', 'flow') + (simOnly ? dRow('Control mode', 'mode') : '');
    ctl = '<div class="row"><button data-a="v-open"' + dis + '>Open</button><button data-a="v-close"' + dis + '>Close</button>' + (simOnly ? '<button data-a="v-auto">Auto</button><button data-a="v-stuck" class="danger">Stick valve</button>' : '') + '</div>' + note;
  }
  host.innerHTML = '<header><div><h2>' + esc(c.name) + '</h2><div class="sub">' + esc(c.loc) + '</div></div><button data-a="close" aria-label="Close details">×</button></header>' +
    '<div class="row"><span class="pill" data-f="state">--</span><span class="pill" data-f="src">--</span></div><div class="kv">' + rows + '</div><div data-h="alm"></div><div>' + ctl + '</div><div class="row"><button data-a="focus">Focus camera</button></div>';
  host.hidden = false; host.dataset.id = id;
}
function ioRead(id) { return store.read(id); }
function detailVals(id) {
  const v = {}, sc = d => fnum(d.rawLo, 0) + ' to ' + fnum(d.rawHi, 0) + ' mA = ' + d.engLo + ' to ' + d.engHi + ' ' + d.unit;
  const src = app.mode === 'sim' ? ['SIMULATED', 'sim'] : app.mode === 'offline' ? ['OFFLINE', 'warn'] : [S.dataValid ? 'LIVE' : 'STALE', S.dataValid ? 'good' : 'warn'];
  v.src = src[0]; v.src_c = 'pill ' + src[1];
  const ai = (d, pre) => { const r = ioRead(d.id); v.raw = r.v === null ? '--' : fnum(r.v, 2) + ' mA'; v.eng = r.eng === null ? '--' : fnum(r.eng, d.dec) + ' ' + d.unit; const q = qPill(r.q); v.q = q[0]; v.scale = sc(d); v.age = r.ts ? ago(r.ts) : 'never'; return r; };
  if (id === 'tank') {
    v.state = S.hasLevel ? (S.levelPct >= app.limits.high ? 'High' : S.levelPct <= app.limits.crit ? 'Critical low' : S.levelPct <= app.limits.low ? 'Low' : 'Normal') : 'No data'; v.state_c = 'pill ' + (v.state === 'Normal' ? 'good' : v.state === 'No data' ? '' : 'warn');
    v.pct = S.hasLevel ? fnum(S.levelPct, 1) + ' %' : '--'; v.m = S.hasLevel ? fnum(S.levelM, 2) + ' m of ' + TANK.H.toFixed(1) + ' m' : '--'; v.vol = S.hasLevel ? fnum(S.volL, 0) + ' L' : '--'; v.cap = fnum(TANK.cap, 0) + ' L';
    v.qin = S.qin != null ? fnum(S.qin, 1) + ' L/s' : 'n/a'; v.qout = S.qout != null ? fnum(S.qout, 1) + ' L/s' : 'n/a'; v.temp = S.tempC != null ? fnum(S.tempC, 1) + ' °C' : 'n/a';
    v.lsh = ioRead('LSH101').v === null ? '--' : (S.lsh ? 'HIGH' : 'Normal'); v.lsl = ioRead('LSL101').v === null ? '--' : (S.lsl ? 'LOW' : 'Normal');
  } else if (id === 'level') {
    const r = ai(IOMAP.LT101); v.pct = S.hasLevel ? fnum(S.levelPct, 1) + ' %' : '--'; v.pos = 'Roof centre nozzle, probe to floor (0 m)';
    v.state = S.sensorBad ? 'Fault' : r.v === null ? 'No signal' : r.q === 'good' ? 'Healthy' : 'Check signal'; v.state_c = 'pill ' + (S.sensorBad ? 'bad' : r.q === 'good' ? 'good' : 'warn');
    const b = $('#d-sopen'); if (b) setText(b, sim.sensorOpen ? 'Restore sensor' : 'Simulate disconnect');
  } else if (id === 'temp') {
    const r = ai(IOMAP.TT101); v.state = r.v === null ? 'Not installed / no data' : r.q === 'good' ? 'Healthy' : 'Check signal'; v.state_c = 'pill ' + (r.q === 'good' ? 'good' : '');
  } else if (id.indexOf('pump') === 0) {
    const i = +id.slice(4) - 1, p = S.pumps[i], n = i + 1, ac = ioRead('IT20' + n);
    v.state = !p.known ? 'No data' : p.fault ? 'Fault' : p.run ? 'Running' : 'Stopped'; v.state_c = 'pill ' + (!p.known ? '' : p.fault ? 'bad' : p.run ? 'good' : '');
    v.run = !p.known ? '--' : p.run ? 'Running' : 'Stopped'; v.flt = ioRead('P' + n + '_FLT').v === null ? '--' : (p.fault ? 'FAULT' : 'Healthy'); v.cmd = p.cmd === null ? '--' : p.cmd ? 'START' : 'STOP';
    v.amps = p.amps != null ? fnum(p.amps, 1) + ' A' : 'n/a'; v.flow = G3.flow ? fnum(G3.flow.pump[i], 1) + ' L/s' : '--';
    v.rt = fnum(runtime.run[i] / 3600, 2) + ' h'; v.starts = String(runtime.starts[i]); v.mode = sim.pumps[i].auto ? 'Automatic' : 'Manual';
  } else if (id.indexOf('valve') === 0) {
    const i = +id.slice(5) - 1, s = S.valves[i];
    v.state = { open: 'Open', closed: 'Closed', travel: 'Moving', fault: 'Fault', unknown: 'No data' }[s.state]; v.state_c = 'pill ' + { open: 'good', closed: '', travel: 'warn', fault: 'bad', unknown: '' }[s.state];
    v.pos = s.known ? fnum(s.pos * 100, 0) + ' %' : '--'; v.st = v.state; v.zso = s.known ? (s.zso ? 'Active' : '-') : '--'; v.zsc = s.known ? (s.zsc ? 'Active' : '-') : '--';
    v.co = s.cmdO === null ? '--' : s.cmdO ? 'OPEN' : 'CLOSE'; v.flow = G3.flow ? fnum(G3.flow.valve[i], 1) + ' L/s' : '--'; v.mode = sim.valves[i].auto ? 'Automatic' : 'Manual';
  }
  return v;
}
function updateDetail() {
  const host = $('#detail'); if (host.hidden) return; const id = host.dataset.id, v = detailVals(id);
  $$('[data-f]', host).forEach(el => { const k = el.dataset.f; if (v[k] !== undefined) setText(el, v[k]); if (v[k + '_c']) setCls(el, v[k + '_c']); });
  const al = activeAlarms().filter(a => a.comp === id), h = $('[data-h=alm]', host);
  const html = al.length ? '<div class="sep"></div><h3 class="sm">Active alarms</h3>' + al.map(a => '<div class="alrow"><span class="sev ' + a.sev + '">' + SEV_LABEL[a.sev] + '</span> ' + esc(a.text) + '<div class="note">' + hms(a.tRaise) + ', ' + esc(a.live || a.value) + '</div></div>').join('') : '';
  if (h.dataset.s !== html) { h.dataset.s = html; h.innerHTML = html; }
}
function onSelect(id) { UI.selId = id; if (id) buildDetail(id); else $('#detail').hidden = true; updateDetail(); }
function detailClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = $('#detail').dataset.id, n = parseInt(id.replace(/\D/g, ''), 10) - 1;
  if (a === 'close') selectComp(null); else if (a === 'focus') focusComp(id); else if (a === 'viewsensor') flyToView('sensor');
  else if (a === 'p-start') pumpCmd(n, true); else if (a === 'p-stop') pumpCmd(n, false);
  else if (a === 'p-auto') sim.pumps[n].auto = true; else if (a === 'p-fault') { sim.pumps[n].fault = true; }
  else if (a === 'v-open') valveCmd(n, true); else if (a === 'v-close') valveCmd(n, false);
  else if (a === 'v-auto') sim.valves[n].auto = true; else if (a === 'v-stuck') { sim.valves[n].stuck = !sim.valves[n].stuck; }
  else if (a === 'sensor-open') sim.sensorOpen = !sim.sensorOpen;
}
function limitChange(e) {
  const t = e.target; if (!/^lim-/.test(t.id)) return; const k = t.id.slice(4), v = Number(t.value); if (!isFinite(v)) return;
  const L = app.limits, next = Object.assign({}, L, { [k]: v });
  if (!(next.crit < next.low && next.low < next.high)) { uiToast('Limits must satisfy critical < low < high.'); t.value = L[k]; return; }
  app.limits = next;
}

/* ---------------- sheets ---------------- */
function closeSheet() { UI.sheet = null; $('#app').classList.remove('sheet-open'); $('#sheet').hidden = true; $$('.dock button').forEach(b => b.classList.remove('on')); }
function openSheet(k) {
  if (UI.sheet === k) { closeSheet(); return; }
  UI.sheet = k; UI.sig = {}; UI.dpBuilt = false; $('#sheet').hidden = false; $('#app').classList.add('sheet-open');
  $$('.dock button').forEach(b => b.classList.toggle('on', b.dataset.sheet === k)); buildSheet(); updateSheet();
}
function buildSheet() {
  const k = UI.sheet, body = $('#sh-body'), tools = $('#sh-tools'), title = $('#sh-title'); tools.innerHTML = ''; UI.sig = {}; UI.dpBuilt = false;
  if (k === 'topo') {
    title.textContent = 'Communication architecture';
    tools.innerHTML = '<button data-sub="topo">Diagram</button><button data-sub="path">Data path</button>';
    $$('button', tools).forEach(b => b.classList.toggle('on', b.dataset.sub === UI.sub));
    if (UI.sub === 'topo') body.innerHTML = '<div class="topo"><div id="topo-svg"></div><div id="topo-side"></div></div>';
    else { body.innerHTML = '<div id="dp"></div>'; buildDataPath(); }
  } else if (k === 'io') {
    title.textContent = 'Field devices and I/O'; body.innerHTML = '<div id="io-note"></div><div class="io" id="io-wrap"></div>'; buildIO();
  } else if (k === 'alm') {
    title.textContent = 'Alarms';
    tools.innerHTML = '<select id="a-filter" aria-label="Alarm filter"><option value="active">Active</option><option value="all">All history</option></select><button id="a-ackall">Acknowledge all</button>';
    $('#a-filter').value = UI.almFilter; body.innerHTML = '<div class="tblwrap"><table class="tbl"><thead><tr><th>Severity</th><th>Raised</th><th>Alarm</th><th>Location</th><th>Value</th><th>State</th><th></th></tr></thead><tbody id="a-body"></tbody></table></div><p class="note" id="a-empty"></p>';
  } else if (k === 'trend') {
    title.textContent = 'Historical trends';
    body.innerHTML = '<div class="trends"><figure><figcaption><span>Water level (%)</span><b class="mono" id="t-l1"></b></figcaption><canvas id="c-lvl"></canvas></figure><figure><figcaption><span>Flow rate (L/s)</span><b class="mono" id="t-l2"></b></figcaption><canvas id="c-flow"></canvas></figure><figure><figcaption><span>Pump runtime</span><b class="mono" id="t-l3"></b></figcaption><canvas id="c-run"></canvas></figure><figure><figcaption><span>Consumption (m³ drawn)</span><b class="mono" id="t-l4"></b></figcaption><canvas id="c-cons"></canvas></figure></div><p class="note" id="t-note"></p>';
  }
}
function updateSheet() {
  const k = UI.sheet; if (!k) return;
  if (k === 'topo') { if (UI.sub === 'topo') updateTopo(); else updateDataPath(); }
  else if (k === 'io') updateIO(); else if (k === 'alm') updateAlarms(); else if (k === 'trend') drawTrends();
}

/* ---- topology ---- */
const linkCol = (st, proto) => st === 'ok' ? PROTO_COLOR[proto] : st === 'sim' ? ST_COL.sim : st === 'warn' ? ST_COL.warn : st === 'bad' ? ST_COL.bad : ST_COL.off;
function updateTopo() {
  const snap = UI.snap || commSnapshot(), sel = UI.sel, tn = comm.tap.node;
  const sig = JSON.stringify([app.mode, sel, comm.tap, Object.keys(snap.nodes).map(k => snap.nodes[k].st), Object.keys(snap.links).map(k => snap.links[k].st + Math.round(snap.links[k].pps > 0)), Object.keys(comm.links).map(k => comm.links[k].protocol), Object.keys(comm.nodes).map(k => comm.nodes[k].ip + ':' + comm.nodes[k].port), snap.twin.st, comm.allowCommands]);
  if (sig !== UI.sig.topo) {
    UI.sig.topo = sig; const y = 44, h = 76, w = 130, cy = y + h / 2; let s = '<svg viewBox="0 0 780 260" role="img" aria-label="Communication topology"><defs><filter id="glow" x="-30%" y="-300%" width="160%" height="700%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>';
    // links
    Object.keys(LINK_ENDS).forEach(lk => {
      const L = comm.links[lk], d = snap.links[lk], a = LINK_ENDS[lk][0], b = LINK_ENDS[lk][1], x1 = NODE_X[a] + w, x2 = NODE_X[b], col = linkCol(d.st, L.protocol), live = (d.st === 'ok' || d.st === 'sim') && d.pps > 0;
      s += '<g class="lnk' + (UI.sel.kind === 'link' && UI.sel.id === lk ? ' sel' : '') + '" data-link="' + lk + '"><line x1="' + x1 + '" y1="' + cy + '" x2="' + x2 + '" y2="' + cy + '" stroke="' + col + '" stroke-width="7" opacity=".5" filter="url(#glow)"/>' +
        '<line class="link ' + (live ? 'flow' : '') + '" x1="' + x1 + '" y1="' + cy + '" x2="' + x2 + '" y2="' + cy + '" stroke="' + col + '" ' + (live ? 'stroke-dasharray="7 6"' : 'stroke-dasharray="3 6" opacity=".7"') + '/><line class="linkhit" x1="' + x1 + '" y1="' + cy + '" x2="' + x2 + '" y2="' + cy + '"/>';
      if (live) { for (let k = 0; k < 3; k++) s += '<circle r="3.6" fill="#fff" stroke="' + col + '" stroke-width="1.5"><animateMotion dur="2.2s" begin="-' + (k * 0.73).toFixed(2) + 's" repeatCount="indefinite" path="M' + x2 + ' ' + (cy - 0) + ' L' + x1 + ' ' + cy + '"/></circle>'; if (app.mode === 'sim' || comm.allowCommands) s += '<rect x="-2.5" y="-2.5" width="5" height="5" fill="' + ST_COL.warn + '" opacity=".85"><animateMotion dur="2.6s" begin="-1.1s" repeatCount="indefinite" path="M' + x1 + ' ' + (cy + 9) + ' L' + x2 + ' ' + (cy + 9) + '"/></rect>'; }
      s += '<text x="' + ((x1 + x2) / 2) + '" y="' + (cy - 12) + '" class="lbl" fill="' + col + '">' + esc(L.protocol) + '</text></g>';
    });
    // tap link
    const tx = NODE_X[tn] + w / 2, tc = linkCol(snap.twin.st, comm.tap.protocol), tl = (snap.twin.st === 'ok' || snap.twin.st === 'sim') && snap.twin.pps > 0;
    s += '<g class="lnk' + (sel.kind === 'twin' ? ' sel' : '') + '" data-twin="1"><line x1="' + tx + '" y1="' + (y + h) + '" x2="' + tx + '" y2="186" stroke="' + tc + '" stroke-width="6" opacity=".45" filter="url(#glow)"/><line class="link ' + (tl ? 'flow' : '') + '" x1="' + tx + '" y1="186" x2="' + tx + '" y2="' + (y + h) + '" stroke="' + tc + '" stroke-dasharray="' + (tl ? '7 6' : '2 6') + '"/><line class="linkhit" x1="' + tx + '" y1="' + (y + h) + '" x2="' + tx + '" y2="186"/>';
    if (tl) for (let k = 0; k < 2; k++) s += '<circle r="3.4" fill="#fff" stroke="' + tc + '" stroke-width="1.5"><animateMotion dur="1.8s" begin="-' + (k * 0.9) + 's" repeatCount="indefinite" path="M' + tx + ' ' + (y + h) + ' L' + tx + ' 186"/></circle>';
    s += '<text x="' + (tx + 10) + '" y="160" class="lbl" fill="' + tc + '" text-anchor="start">' + esc(comm.tap.protocol) + ' tap</text></g>';
    s += '<g class="nodeg' + (sel.kind === 'twin' ? ' sel' : '') + '" data-twin="1"><rect x="' + (tx - 70) + '" y="186" width="140" height="54" rx="10" stroke-dasharray="5 4"/><circle cx="' + (tx - 54) + '" cy="200" r="5" fill="' + ST_COL[snap.twin.st] + '"/><text x="' + tx + '" y="208">Digital Twin</text><text x="' + tx + '" y="226" class="s">' + (app.mode === 'sim' ? 'reads simulator' : 'this application') + '</text></g>';
    // nodes
    Object.keys(NODE_X).forEach(k => {
      const n = comm.nodes[k], st = snap.nodes[k].st, x = NODE_X[k], ln = NODE_LINES[k];
      s += '<g class="nodeg' + (sel.kind === 'node' && sel.id === k ? ' sel' : '') + '" data-node="' + k + '" tabindex="0" role="button" aria-label="' + esc(n.name) + ', ' + (ST_TXT[st] || st) + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" style="stroke:' + (st === 'bad' ? ST_COL.bad : '') + '"/><circle cx="' + (x + 14) + '" cy="' + (y + 14) + '" r="5" fill="' + ST_COL[st] + '"/>' +
        '<text x="' + (x + w / 2) + '" y="' + (y + 34) + '">' + esc(ln[0]) + '</text><text x="' + (x + w / 2) + '" y="' + (y + 50) + '">' + esc(ln[1]) + '</text><text x="' + (x + w / 2) + '" y="' + (y + 67) + '" class="s">' + esc(n.ip + ':' + n.port) + '</text></g>';
    });
    s += '<text x="10" y="16" class="cap">Data flows right to left (field to SoftPAC). Amber squares are commands.</text></svg>';
    $('#topo-svg').innerHTML = s; UI.sig.side = null;
  }
  buildTopoSide(snap);
}
function buildTopoSide(snap) {
  const el = $('#topo-side'), sel = UI.sel; let html = '', sig;
  if (sel.kind === 'node') {
    const n = comm.nodes[sel.id], d = snap.nodes[sel.id], isTap = sel.id === comm.tap.node, a = tapAdapter();
    sig = JSON.stringify([sel, d.st, d.comm, d.tx, Math.floor(Date.now() / 1000), d.errors.length && d.errors[0].t]);
    if (sig === UI.sig.side) return; UI.sig.side = sig;
    const ae = $('#nip'); const typing = ae && document.activeElement === ae || document.activeElement === $('#nport'); if (typing) return;
    html = '<h3>' + esc(n.name) + '</h3><p class="note">' + esc(n.desc) + '</p><div class="row"><span class="pill ' + ST_PILL[d.st] + '">' + (ST_TXT[d.st] || d.st) + '</span>' + (isTap ? '<span class="pill good">Twin connected here</span>' : '') + '</div>' +
      '<div class="kv"><span>Connection</span><span>' + esc(d.st === 'unk' ? 'Not verified' : d.st === 'off' ? 'Offline' : d.st === 'bad' ? 'Failed' : 'Up') + '</span><span>Communication</span><span>' + esc(d.comm) + '</span><span>Data transmission</span><span>' + esc(d.tx) + '</span><span>Last successful</span><span>' + (d.lastOk ? hms(d.lastOk) + ' (' + ago(d.lastOk) + ')' : 'never') + '</span><span>Round trip</span><span>' + (d.rtt != null ? fnum(d.rtt, 0) + ' ms' : 'n/a') + '</span></div>' +
      '<div class="cfg"><div class="two"><label class="f">IP address or host<input id="nip" value="' + esc(n.ip) + '" spellcheck="false"></label><label class="f">Port<input id="nport" type="number" min="1" max="65535" value="' + n.port + '"></label></div><div class="row"><button data-a="node-apply">Apply</button><span class="err" id="nerr"></span></div></div>' +
      (d.hint ? '<p class="note"><b>Diagnostic:</b> ' + esc(d.hint) + '</p>' : '') +
      (d.errors && d.errors.length ? '<h3 class="sm">Recent errors</h3>' + d.errors.slice(0, 5).map(e => '<p class="err">' + hms(e.t) + ' ' + esc(e.msg) + (e.hint ? '<br><span class="note">' + esc(e.hint) + '</span>' : '') + '</p>').join('') : '');
  } else if (sel.kind === 'link') {
    const L = comm.links[sel.id], d = snap.links[sel.id], ab = LINK_ENDS[sel.id];
    sig = JSON.stringify([sel, d.st, L.protocol, Math.round(d.pps * 10)]); if (sig === UI.sig.side) return; UI.sig.side = sig;
    html = '<h3>' + esc(comm.nodes[ab[0]].short) + ' to ' + esc(comm.nodes[ab[1]].short) + '</h3><div class="row"><span class="pill ' + ST_PILL[d.st] + '">' + (ST_TXT[d.st] || d.st) + '</span></div>' +
      '<label class="f">Protocol on this segment<select id="lnk-proto" data-l="' + sel.id + '">' + LINK_PROTOS[sel.id].map(p => '<option' + (p === L.protocol ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label>' +
      '<div class="kv"><span>Message rate</span><span>' + fnum(d.pps, 1) + ' /s</span></div>' +
      '<p class="note">Each segment uses the protocols its two ends actually support. The twin measures only the node it is connected to (see Data path). Other segments show what the data source reports.</p>';
  } else {
    const t = snap.twin, a = tapAdapter();
    sig = JSON.stringify([sel, t.st, Math.floor(Date.now() / 1000)]); if (sig === UI.sig.side) return; UI.sig.side = sig;
    html = '<h3>Digital Twin ingestion</h3><div class="row"><span class="pill ' + ST_PILL[t.st] + '">' + (ST_TXT[t.st] || t.st) + '</span><span class="pill ' + (app.mode === 'sim' ? 'sim' : '') + '">' + (app.mode === 'sim' ? 'SIMULATED' : app.mode.toUpperCase()) + '</span></div><div class="kv"><span>Path</span><span>' + esc(comm.nodes[comm.tap.node].short + ' via ' + comm.tap.protocol) + '</span><span>Samples accepted</span><span>' + store.rx + '</span><span>Samples rejected</span><span>' + store.rej + '</span><span>Last rejection</span><span>' + esc(store.lastRej || 'none') + '</span><span>Future timestamps fixed</span><span>' + store.tsFix + '</span><span>Last data</span><span>' + (app.lastDataTs ? hms(app.lastDataTs) : 'never') + '</span></div>' +
      '<p class="note">All protocols are normalised into one tag store. Values are range checked, timestamped and marked stale after ' + (app.staleMs / 1000) + ' s without an update.</p><button data-sub="path">Open Data path</button>';
  }
  el.innerHTML = html;
}
function topoClick(e) {
  const n = e.target.closest('[data-node]'), l = e.target.closest('[data-link]'), t = e.target.closest('[data-twin]');
  if (n) UI.sel = { kind: 'node', id: n.dataset.node }; else if (l) UI.sel = { kind: 'link', id: l.dataset.link }; else if (t) UI.sel = { kind: 'twin' }; else return;
  UI.sig.topo = null; updateTopo();
}
function applyNode() {
  const id = UI.sel.id, ip = $('#nip').value.trim(), port = $('#nport').value, bad = validateEndpoint(ip, port), er = $('#nerr');
  if (bad) { er.textContent = bad; return; }
  comm.nodes[id].ip = ip; comm.nodes[id].port = Number(port); saveCfg(); er.textContent = '';
  if (app.mode === 'live' && id === comm.tap.node) { tapAdapter().disconnect(); tapAdapter().connect(); }
  UI.sig.topo = null; UI.sig.side = null; updateTopo(); uiToast('Endpoint saved: ' + ip + ':' + port, 'info');
}

/* ---- data path (protocol adapters) ---- */
const CFG_FIELDS = {
  'WSS': [['path', 'Path', 'text'], ['subproto', 'Sub-protocol (optional)', 'text'], ['token', 'Auth token (not saved)', 'password']],
  'MQTT': [['path', 'WebSocket path', 'text'], ['clientId', 'Client ID', 'text'], ['user', 'User name', 'text'], ['pass', 'Password (not saved)', 'password'], ['base', 'Base topic', 'text'], ['qos', 'QoS', 'select:0,1']],
  'OPC UA': [['gateway', 'Gateway URL (wss://)', 'text'], ['security', 'Security', 'select:None,Sign,SignAndEncrypt'], ['user', 'User name', 'text'], ['pass', 'Password (not saved)', 'password'], ['interval', 'Publishing interval (ms)', 'number']],
  'Modbus TCP': [['gateway', 'Gateway URL (wss://)', 'text'], ['unit', 'Unit ID', 'number'], ['pollMs', 'Poll interval (ms)', 'number'], ['wordOrder', 'Float word order', 'select:big,little']],
  'TCP/IP': [['gateway', 'Gateway URL (wss://)', 'text'], ['format', 'Line format', 'select:json,kv'], ['cmdTemplate', 'Command template', 'text']]
};
const PROTO_HELP = {
  'WSS': 'Direct secure WebSocket to the SoftPAC / HMI. JSON messages: {"ts":..,"tags":{"LT101":12.3,"P1_RUN":true}}. Optional {"op":"diag","nodes":{...}} reports other nodes.',
  'MQTT': 'MQTT 3.1.1 over WebSocket (wss). Topics: <base>/<TAG>, payload plain or {"v":..,"ts":..}. Commands are published to <base>/cmd/<TAG>.',
  'OPC UA': 'Browsers cannot speak opc.tcp directly. A wss gateway opens the OPC UA session and forwards subscriptions (op:open, op:subscribe, op:data). NodeIds are mapped per tag below.',
  'Modbus TCP': 'Browsers cannot open raw TCP. A wss gateway forwards Modbus requests (op:modbus) to unit ID and port set on the Field Devices node. Register map below.',
  'TCP/IP': 'A wss gateway relays a raw TCP stream (op:connect, op:rx, op:tx). Lines are JSON or TAG=value pairs.'
};
function mapToText(proto) {
  if (proto === 'OPC UA') return Object.keys(comm.cfg['OPC UA'].nodes).map(t => t + '=' + comm.cfg['OPC UA'].nodes[t]).join('\n');
  return comm.cfg['Modbus TCP'].map.map(m => [m.tag, m.area, m.addr, m.type].join(',')).join('\n');
}
function buildDataPath() {
  const tap = comm.tap, el = $('#dp'), P = tap.protocol; UI.dpBuilt = true;
  const opt = (list, cur) => list.map(x => '<option' + (x === cur ? ' selected' : '') + '>' + x + '</option>').join('');
  let f = '<div class="cfgg">' + (CFG_FIELDS[P] || []).map(fl => {
    const val = comm.cfg[P][fl[0]]; const id = 'cf-' + fl[0];
    if (fl[2].indexOf('select:') === 0) return '<label class="f">' + fl[1] + '<select id="' + id + '" data-k="' + fl[0] + '">' + opt(fl[2].slice(7).split(','), String(val)) + '</select></label>';
    return '<label class="f">' + fl[1] + '<input id="' + id + '" data-k="' + fl[0] + '" type="' + fl[2] + '" value="' + esc(val == null ? '' : val) + '" autocomplete="off" spellcheck="false"></label>';
  }).join('') + '</div>';
  if (P === 'OPC UA' || P === 'Modbus TCP') f += '<label class="f">' + (P === 'OPC UA' ? 'Tag to NodeId map (TAG=nodeId per line)' : 'Register map (tag,area,address,type per line; area = coil, discrete, holding, input)') + '<textarea id="cf-map" rows="5" spellcheck="false">' + esc(mapToText(P)) + '</textarea></label><span class="err" id="maperr"></span>';
  el.innerHTML = '<div class="dpgrid"><div class="cfg"><h3>Where does the twin read data from?</h3><div class="two"><label class="f">Connect to node<select id="tap-node">' + ['softpac', 'opc', 'field'].map(k => '<option value="' + k + '"' + (k === tap.node ? ' selected' : '') + '>' + esc(comm.nodes[k].short) + ' (' + esc(comm.nodes[k].ip) + ':' + comm.nodes[k].port + ')</option>').join('') + '</select></label><label class="f">Protocol<select id="tap-proto">' + opt(NODE_PROTOS[tap.node], P) + '</select></label></div><p class="note">' + esc(PROTO_HELP[P]) + '</p>' + f +
    '<label class="row"><input type="checkbox" id="allow-cmd"' + (comm.allowCommands ? ' checked' : '') + '> Allow start/stop and open/close commands from the twin (LIVE mode only)</label><p class="note">Off by default. Commands go to real equipment, so enable only after verifying the tag mapping. Passwords and tokens are never stored.</p></div>' +
    '<div class="cfg"><h3>Connection</h3><div class="row"><button data-a="dp-connect" class="on">Connect</button><button data-a="dp-disc">Disconnect</button></div><div id="dp-status"></div></div></div>';
}
function updateDataPath() {
  if (!UI.dpBuilt) buildDataPath();
  const a = tapAdapter(), el = $('#dp-status'); if (!el) return;
  const h = a.health(), col = { ok: 'good', warn: 'warn', bad: 'bad', off: '' }[h];
  const html = '<div class="row"><span class="pill ' + col + '">' + esc(a.state) + '</span><span class="pill ' + (app.mode === 'live' ? 'good' : 'warn') + '">Mode: ' + app.mode.toUpperCase() + '</span></div>' +
    '<div class="kv"><span>Endpoint</span><span>' + esc(a.url() || (comm.nodes[comm.tap.node].ip + ':' + comm.nodes[comm.tap.node].port)) + '</span><span>Messages received</span><span>' + a.rx + '</span><span>Messages sent</span><span>' + a.tx + '</span><span>Rejected</span><span>' + a.rej + '</span><span>Rate</span><span>' + fnum(a.rate, 1) + ' /s</span><span>Round trip</span><span>' + (a.rtt != null ? a.rtt + ' ms' : 'n/a') + '</span><span>Last successful</span><span>' + (a.lastOk ? hms(a.lastOk) : 'never') + '</span></div>' +
    (app.mode !== 'live' ? '<p class="note">Switch to LIVE mode (top bar) to connect.</p>' : '') +
    (a.errors.length ? '<h3 class="sm">Diagnostics</h3>' + a.errors.slice(0, 6).map(e => '<p class="err">' + hms(e.t) + ' ' + esc(e.msg) + (e.hint ? '<br><span class="note">' + esc(e.hint) + '</span>' : '') + '</p>').join('') : '<p class="note">No errors.</p>');
  if (el.dataset.s !== html) { el.dataset.s = html; el.innerHTML = html; }
}
function reconnectIfLive() { if (app.mode === 'live') { const a = tapAdapter(); a.disconnect(); a.connect(); } }
function dpChange(e) {
  const t = e.target;
  if (t.id === 'tap-node') { comm.tap.node = t.value; if (!NODE_PROTOS[t.value].includes(comm.tap.protocol)) comm.tap.protocol = NODE_PROTOS[t.value][0]; disconnectAll(); saveCfg(); buildDataPath(); }
  else if (t.id === 'tap-proto') { disconnectAll(); comm.tap.protocol = t.value; saveCfg(); buildDataPath(); }
  else if (t.id === 'allow-cmd') { comm.allowCommands = t.checked; }
  else if (t.id === 'cf-map') {
    const P = comm.tap.protocol, er = $('#maperr'), lines = t.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (P === 'OPC UA') { const m = {}; for (const ln of lines) { const i = ln.indexOf('='); const tag = ln.slice(0, i).trim(); if (i < 1 || !IOMAP[tag]) { er.textContent = 'Unknown tag or bad line: ' + ln; return; } m[tag] = ln.slice(i + 1).trim(); } comm.cfg['OPC UA'].nodes = m; }
    else { const m = []; for (const ln of lines) { const p = ln.split(',').map(s => s.trim()); if (!IOMAP[p[0]] || !['coil', 'discrete', 'holding', 'input'].includes(p[1]) || !/^\d+$/.test(p[2]) || !['bool', 'float32', 'int16', 'uint16'].includes(p[3])) { er.textContent = 'Bad line: ' + ln; return; } m.push({ tag: p[0], area: p[1], addr: Number(p[2]), type: p[3] }); } comm.cfg['Modbus TCP'].map = m; }
    er.textContent = ''; saveCfg(); reconnectIfLive();
  }
  else if (t.dataset.k) {
    const P = comm.tap.protocol; let v = t.value; if (t.type === 'number' || ['qos', 'unit'].includes(t.dataset.k)) v = Number(v);
    comm.cfg[P][t.dataset.k] = v; saveCfg(); reconnectIfLive();
  }
}
function dpClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  if (b.dataset.a === 'dp-connect') { if (app.mode !== 'live') { uiToast('Switch to LIVE mode first.'); return; } const a = tapAdapter(); a.disconnect(); a.connect(); }
  else if (b.dataset.a === 'dp-disc') tapAdapter().disconnect();
  else if (b.dataset.a === 'node-apply') applyNode();
}

/* ---- I/O ---- */
function buildIO() {
  const wrap = $('#io-wrap');
  const aiRows = IO.filter(d => d.type === 'AI').map(d => '<tr><td><b class="mono">' + d.id + '</b><div class="note">' + esc(d.label) + '</div></td><td class="n" id="io-raw-' + d.id + '">--</td><td class="n" id="io-eng-' + d.id + '">--</td><td class="note">' + d.rawLo + '-' + d.rawHi + ' mA to ' + d.engLo + '-' + d.engHi + ' ' + d.unit + '</td><td><div class="bar"><i id="io-bar-' + d.id + '"></i></div></td><td id="io-q-' + d.id + '"></td></tr>').join('');
  const dRows = t => IO.filter(d => d.type === t).map(d => '<tr><td><span class="led" id="io-led-' + d.id + '"></span><b class="mono">' + d.id + '</b></td><td class="note">' + esc(d.label) + '</td><td id="io-v-' + d.id + '" class="mono">--</td><td id="io-q-' + d.id + '"></td></tr>').join('');
  wrap.innerHTML = '<div><h3>Analog inputs (4-20 mA)</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>Tag</th><th>Raw</th><th>Value</th><th>Scaling</th><th>Signal</th><th>Quality</th></tr></thead><tbody>' + aiRows + '</tbody></table></div></div>' +
    '<div><h3>Digital inputs</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>Tag</th><th>Description</th><th>State</th><th>Quality</th></tr></thead><tbody>' + dRows('DI') + '</tbody></table></div></div>' +
    '<div><h3>Digital outputs</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>Tag</th><th>Description</th><th>State</th><th>Quality</th></tr></thead><tbody>' + dRows('DO') + '</tbody></table></div></div>';
}
function updateIO() {
  const n = $('#io-note'); const msg = app.mode === 'sim' ? '<span class="pill sim">SIMULATED</span> These values come from the process simulator, not from field hardware.' : app.mode === 'offline' ? '<span class="pill warn">OFFLINE</span> Last received values, marked stale.' : '<span class="pill good">LIVE</span> Values received from ' + esc(comm.tap.protocol) + '.';
  if (n.dataset.s !== msg) { n.dataset.s = msg; n.innerHTML = '<p class="note">' + msg + '</p>'; }
  IO.forEach(d => {
    const r = ioRead(d.id), q = qPill(r.q), qe = $('#io-q-' + d.id); if (!qe) return;
    const qh = '<span class="pill ' + q[1] + '">' + q[0] + (r.src === 'SIM' ? ' SIM' : '') + '</span>'; if (qe.dataset.s !== qh) { qe.dataset.s = qh; qe.innerHTML = qh; }
    if (d.type === 'AI') {
      setText($('#io-raw-' + d.id), r.v === null ? '--' : fnum(r.v, 2) + ' mA'); setText($('#io-eng-' + d.id), r.eng === null ? '--' : fnum(r.eng, d.dec) + ' ' + d.unit);
      const bar = $('#io-bar-' + d.id); bar.style.width = (r.v === null ? 0 : clamp((r.v - 4) / 16 * 100, 0, 100)) + '%'; bar.style.background = r.q === 'bad' ? 'var(--crit)' : r.q === 'uncertain' || r.q === 'stale' ? 'var(--warn)' : '';
    } else {
      const led = $('#io-led-' + d.id), on = r.v === true; setCls(led, 'led' + (r.v === null ? '' : on ? (d.bad ? ' bad' : ' on') : '')); setText($('#io-v-' + d.id), stateWord(d, r.v));
    }
  });
}

/* ---- alarms ---- */
function updateAlarms() {
  const body = $('#a-body'); if (!body) return; const all = UI.almFilter === 'all', list = alarms.list.filter(a => all || a.state !== 'cleared');
  const rows = list.slice(0, 120).map(a => {
    const stt = a.state === 'active' ? (a.acked ? 'Active, acked' : 'Active') : a.state === 'rtn' ? 'Returned to normal' : 'Cleared';
    return '<tr class="' + (a.state === 'cleared' ? 'cleared' : '') + '" data-comp="' + (a.comp || '') + '"><td><span class="sev ' + a.sev + '">' + SEV_LABEL[a.sev] + '</span></td><td class="mono">' + hms(a.tRaise) + '</td><td>' + esc(a.text) + (a.src === 'SIM' ? ' <span class="pill sim">SIM</span>' : '') + '</td><td class="note">' + esc(a.comp ? COMPS[a.comp].short : 'System') + '</td><td class="mono">' + esc(a.state === 'active' && a.live ? a.live : a.value) + '</td><td>' + stt + (a.tAck ? '<div class="note">acked ' + hms(a.tAck) + '</div>' : '') + (a.tClear ? '<div class="note">cleared ' + hms(a.tClear) + '</div>' : '') + '</td><td>' + (a.state !== 'cleared' && !a.acked ? '<button data-ack="' + a.id + '">Acknowledge</button>' : '') + '</td></tr>';
  }).join('');
  if (body.dataset.s !== rows) { body.dataset.s = rows; body.innerHTML = rows; }
  setText($('#a-empty'), list.length ? '' : (all ? 'No alarms recorded yet.' : 'No active alarms.'));
}
function alarmClick(e) {
  const ack = e.target.closest('[data-ack]'); if (ack) { ackAlarm(+ack.dataset.ack); updateAlarms(); return; }
  const tr = e.target.closest('tr[data-comp]'); if (tr && tr.dataset.comp) { selectComp(tr.dataset.comp); focusComp(tr.dataset.comp); }
}

/* ---- trends ---- */
const TR = { t: [], lvl: [], qin: [], qout: [], run: [[], [], []], cons: [] };
function sampleTrend() {
  if (app.mode === 'offline' || !S.dataValid || !S.hasLevel) return;
  const T = procT(), step = app.mode === 'sim' ? 6 : 2, last = TR.t.length ? TR.t[TR.t.length - 1] : -1e9;
  if (T - last < step) return; if (T < last) { Object.keys(TR).forEach(k => { TR[k] = k === 'run' ? [[], [], []] : []; }); }
  TR.t.push(T); TR.lvl.push(S.levelPct); TR.qin.push(S.qin); TR.qout.push(S.qout); S.pumps.forEach((p, i) => TR.run[i].push(p.run ? 1 : 0)); TR.cons.push(runtime.outTotalL / 1000);
  if (TR.t.length > 720) { TR.t.shift(); TR.lvl.shift(); TR.qin.shift(); TR.qout.shift(); TR.run.forEach(r => r.shift()); TR.cons.shift(); }
}
function prep(cv) { const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); return { x, w, h }; }
function chart(cv, series, o) {
  const { x, w, h } = prep(cv), L = 34, R = 8, T = 8, B = 16, pw = w - L - R, ph = h - T - B, n = TR.t.length;
  const t0 = n ? TR.t[0] : 0, t1 = n ? TR.t[n - 1] : 1, span = Math.max(1, t1 - t0), X = t => L + (t - t0) / span * pw;
  let lo = o.min, hi = o.max; if (hi == null) { hi = 1; series.forEach(s => s.d.forEach(v => { if (v != null && v > hi) hi = v; })); hi *= 1.15; } if (lo == null) lo = 0;
  const Y = v => T + ph - (v - lo) / (hi - lo) * ph;
  x.font = '10px JetBrains Mono, monospace'; x.textBaseline = 'middle'; x.strokeStyle = 'rgba(120,180,255,.14)'; x.fillStyle = '#84a8c8'; x.lineWidth = 1; x.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); x.beginPath(); x.moveTo(L, y); x.lineTo(w - R, y); x.stroke(); x.fillText(fnum(v, hi - lo > 8 ? 0 : 1), L - 4, y); }
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillText(n > 1 ? '-' + fnum(span / 60, 1) + ' min' : '', L + 18, h - 3); x.fillText('now', w - R - 10, h - 3);
  (o.lines || []).forEach(l => { x.setLineDash([4, 4]); x.strokeStyle = l.c; x.beginPath(); x.moveTo(L, Y(l.v)); x.lineTo(w - R, Y(l.v)); x.stroke(); x.setLineDash([]); });
  if (n < 2) { x.fillStyle = '#84a8c8'; x.textAlign = 'center'; x.fillText('Collecting data...', w / 2, h / 2); return; }
  series.forEach((s, si) => {
    x.strokeStyle = s.c; x.lineWidth = 1.8; x.beginPath(); let pen = false, lastI = -1;
    s.d.forEach((v, i) => { if (v == null) { pen = false; return; } const px = X(TR.t[i]), py = Y(v); if (s.step && pen) x.lineTo(px, Y(s.d[i - 1])); if (pen) x.lineTo(px, py); else x.moveTo(px, py); pen = true; lastI = i; });
    x.stroke();
    if (s.fill && lastI > 0) { x.lineTo(X(TR.t[lastI]), Y(lo)); x.lineTo(X(t0), Y(lo)); x.closePath(); const g = x.createLinearGradient(0, T, 0, T + ph); g.addColorStop(0, s.c + '55'); g.addColorStop(1, s.c + '05'); x.fillStyle = g; x.fill(); }
    if (lastI >= 0) { x.fillStyle = s.c; x.beginPath(); x.arc(X(TR.t[lastI]), Y(s.d[lastI]), 3, 0, 7); x.fill(); }
  });
}
function drawTrends() {
  if (!$('#c-lvl')) return; const last = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
  chart($('#c-lvl'), [{ d: TR.lvl, c: '#3ad7ff', fill: true }], { min: 0, max: 100, lines: [{ v: app.limits.high, c: 'rgba(255,140,60,.7)' }, { v: app.limits.low, c: 'rgba(255,191,61,.6)' }, { v: app.limits.crit, c: 'rgba(255,77,94,.7)' }] });
  chart($('#c-flow'), [{ d: TR.qin, c: '#36e08a' }, { d: TR.qout, c: '#ffbf3d' }], {});
  chart($('#c-cons'), [{ d: TR.cons, c: '#b58bff', fill: true }], {});
  // pump lanes
  const cv = $('#c-run'), { x, w, h } = prep(cv), L = 34, R = 8, n = TR.t.length, laneH = (h - 16) / 3;
  x.font = '10px JetBrains Mono, monospace'; x.textBaseline = 'middle'; x.fillStyle = '#84a8c8'; x.textAlign = 'right';
  for (let i = 0; i < 3; i++) {
    const y = 4 + i * laneH; x.fillText('P' + (i + 1), L - 6, y + laneH / 2 - 2); x.fillStyle = 'rgba(120,180,255,.08)'; x.fillRect(L, y + 2, w - L - R, laneH - 6);
    if (n > 1) { const t0 = TR.t[0], sp = Math.max(1, TR.t[n - 1] - t0); x.fillStyle = '#36e08a'; for (let k = 0; k < n; k++) if (TR.run[i][k]) { const x0 = L + (TR.t[k] - t0) / sp * (w - L - R), x1 = k + 1 < n ? L + (TR.t[k + 1] - t0) / sp * (w - L - R) : x0 + 2; x.fillRect(x0, y + 2, Math.max(1.5, x1 - x0), laneH - 6); } }
    x.fillStyle = '#84a8c8';
  }
  setText($('#t-l1'), S.hasLevel ? fnum(S.levelPct, 1) + ' %' : '--'); setText($('#t-l2'), (S.qin != null ? 'in ' + fnum(S.qin, 1) : 'in n/a') + ' / ' + (S.qout != null ? 'out ' + fnum(S.qout, 1) : 'out n/a'));
  setText($('#t-l3'), runtime.run.map((r, i) => 'P' + (i + 1) + ' ' + fnum(r / 3600, 2) + ' h').join('  ')); setText($('#t-l4'), fnum(runtime.outTotalL / 1000, 1) + ' m³ total');
  setText($('#t-note'), app.mode === 'sim' ? 'Simulated history. Time axis is process time (simulation speed ' + sim.speed + 'x).' : app.mode === 'offline' ? 'Offline: history stops at the last received sample.' : 'Live history recorded since this page was opened.');
}

/* ---------------- wiring ---------------- */
function wire() {
  // camera views
  const vb = $('#views'); vb.innerHTML = Object.keys(VIEWS).map(k => '<button data-v="' + k + '">' + VIEWS[k].label + '</button>').join('') + '<button class="reset" data-v="reset">Reset camera</button><button data-v="spin" aria-pressed="false">Auto-rotate</button><button data-v="labels" class="on">Labels</button>';
  vb.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b || !G3.ok) return; const k = b.dataset.v;
    if (k === 'reset') { G3.controls.autoRotate = false; $('[data-v=spin]').classList.remove('on'); flyToView('persp'); }
    else if (k === 'spin') { G3.controls.autoRotate = !G3.controls.autoRotate; b.classList.toggle('on', G3.controls.autoRotate); b.setAttribute('aria-pressed', G3.controls.autoRotate); G3.tween = null; }
    else if (k === 'labels') { G3.labelsOn = !G3.labelsOn; b.classList.toggle('on', G3.labelsOn); }
    else flyToView(k);
  });
  // modes
  $('.seg').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { Object.keys(TR).forEach(k => { TR[k] = k === 'run' ? [[], [], []] : []; }); setMode(b.dataset.mode); UI.sig = {}; updateHud(); if (UI.sheet) { buildSheet(); updateSheet(); } if (UI.selId) onSelect(UI.selId); } });
  // summary chips
  $('#scada').addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (c) { selectComp(c.dataset.c); focusComp(c.dataset.c); } });
  $('#scada').addEventListener('keydown', e => { const c = e.target.closest('[data-c]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectComp(c.dataset.c); focusComp(c.dataset.c); } });
  $('#stoggle').addEventListener('click', () => $('#scada').classList.toggle('min'));
  if (window.innerWidth < 860) $('#scada').classList.add('min');
  // simulation controls
  const sc = $('#s-scn'); sc.innerHTML = Object.keys(SCENARIOS).map(k => '<option value="' + k + '">' + SCENARIOS[k].label + '</option>').join('');
  sc.addEventListener('change', () => { sim.applyScenario(sc.value); resetAlarms('Scenario changed'); store.clear(); sim.publish(); });
  $('#s-clear').addEventListener('click', () => { sim.resetFaults(); });
  $('#s-estop').addEventListener('click', () => { sim.estop = !sim.estop; });
  $('#s-lvl').addEventListener('input', e => { sim.vol = Number(e.target.value) / 100 * TANK.cap; });
  $('#s-spd').addEventListener('input', e => { sim.speed = Number(e.target.value); });
  $('#s-auto').addEventListener('change', e => { sim.pumps.forEach(p => { p.auto = e.target.checked; }); sim.valves.forEach(v => { v.auto = e.target.checked; }); });
  // detail
  $('#detail').addEventListener('click', detailClick); $('#detail').addEventListener('change', limitChange);
  // dock and sheet
  $('.dock').addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if (b) openSheet(b.dataset.sheet); });
  $('#sh-close').addEventListener('click', closeSheet);
  const sb = $('#sh-body'), st = $('#sh-tools');
  sb.addEventListener('click', e => { topoClick(e); dpClick(e); alarmClick(e); const s = e.target.closest('[data-sub]'); if (s) { UI.sub = s.dataset.sub; buildSheet(); updateSheet(); } });
  sb.addEventListener('change', e => { dpChange(e); if (e.target.id === 'lnk-proto') { comm.links[e.target.dataset.l].protocol = e.target.value; saveCfg(); UI.sig.topo = null; updateTopo(); } });
  sb.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-node]')) { e.preventDefault(); topoClick(e); } });
  st.addEventListener('click', e => { const s = e.target.closest('[data-sub]'); if (s) { UI.sub = s.dataset.sub; buildSheet(); updateSheet(); } if (e.target.id === 'a-ackall') { ackAll(); updateAlarms(); } });
  st.addEventListener('change', e => { if (e.target.id === 'a-filter') { UI.almFilter = e.target.value; updateAlarms(); } });
  $('#topo-side') && 0;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (UI.sheet) closeSheet(); else if (UI.selId) selectComp(null); } });
  window.addEventListener('resize', () => { resize(); });
  $('#dte').textContent = '';
}
/* data-a buttons inside the topology side panel are inside #sh-body, so dpClick covers node-apply and sub switching */

function startApp() {
  wire();
  let ok = false;
  try {
    if (typeof THREE === 'undefined' || !THREE.OrbitControls) throw new Error('three.js did not load');
    G3.onSelect = onSelect; initScene($('#gl')); ok = G3.ok;
  } catch (e) { console.error('3D init failed', e); G3.ok = false; }
  if (!ok) { $('#nogl').hidden = false; $('#views').hidden = true; }
  setInterval(coreTick, 100);
  let n = 0;
  setInterval(() => { try { sampleTrend(); updateHud(); updateDetail(); if (++n % 2 === 0) updateSheet(); } catch (e) { if (!UI.errShown) { UI.errShown = true; console.error('ui update error', e); } } }, 250);
  coreTick(); updateHud();
  if (ok) frame();
  window.__twin = { app, sim, S, store, alarms, comm, G3, UI, setMode };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp); else startApp();
