/* =====================================================================
   3D SCENE  (Three.js r128 + OrbitControls + Reflector)
   ===================================================================== */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const G3 = {
  ok: false, picks: [], comps: {}, hover: null, selected: null, labelsOn: true, tween: null, vis: { level: 0, pump: [], valve: [] },
  flows: [], onSelect: null, leds: {}, size: { w: 1, h: 1 }
};
const PX = [-2.3, 0, 2.3];            // pump x positions (world)
const PUMP_Z0 = 2.5;                  // pump local origin z (motor back)
const NOZ_Y = 1.3, NOZ_R = TANK.R + 0.12, NOZ_PHI = [-0.6, 0, 0.6];
const VBX = [2.6, 4.0, 5.4];          // outlet branch x positions
const VIEWS = {
  persp: { label: 'Overview', pos: [9.6, 6.4, 11.6], tgt: [2.0, 1.4, 0.6] },
  front: { label: 'Front', pos: [2.0, 2.4, 14.5], tgt: [2.0, 1.5, 0.0] },
  right: { label: 'Side', pos: [16, 2.8, 0.8], tgt: [2.0, 1.4, 0.8] },
  back: { label: 'Back', pos: [2.0, 3.4, -14], tgt: [2.0, 1.4, 0.0] },
  top: { label: 'Top', pos: [2.0, 17, 1.4], tgt: [2.0, 0.0, 1.0] },
  under: { label: 'Below', pos: [4.0, -5.2, 9.0], tgt: [2.0, 1.2, 0.6] },
  pumps: { label: 'Pumps', pos: [0.2, 3.0, 9.6], tgt: [0.0, 0.9, 3.6] },
  sensor: { label: 'Sensor', pos: [3.2, 5.0, 4.0], tgt: [0.0, 3.0, 0.0] },
  valves: { label: 'Valves', pos: [4.2, 3.6, 4.6], tgt: [4.0, 1.5, -1.1] }
};

function rpath(pts, r) {
  const P = pts.map(p => V3(p[0], p[1], p[2])), path = new THREE.CurvePath();
  if (P.length === 2) { path.add(new THREE.LineCurve3(P[0], P[1])); return path; }
  let prev = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], din = b.clone().sub(a), dout = c.clone().sub(b);
    const l1 = din.length(), l2 = dout.length(); din.normalize(); dout.normalize();
    const rr = Math.min(r, l1 * 0.45, l2 * 0.45);
    const p1 = b.clone().addScaledVector(din, -rr), p2 = b.clone().addScaledVector(dout, rr);
    path.add(new THREE.LineCurve3(prev, p1)); path.add(new THREE.QuadraticBezierCurve3(p1, b, p2)); prev = p2;
  }
  path.add(new THREE.LineCurve3(prev, P[P.length - 1]));
  return path;
}

function textSprite(txt, color, w, h) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 64; const x = c.getContext('2d');
  x.font = '600 34px Inter, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 6; x.fillText(txt, 80, 34);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(w || 0.4, h || 0.16, 1); return s;
}
function radialTex(stops, size) {
  const c = document.createElement('canvas'); c.width = c.height = size || 256; const x = c.getContext('2d'), r = c.width / 2;
  const g = x.createRadialGradient(r, r, 0, r, r, r); stops.forEach(s => g.addColorStop(s[0], s[1])); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}

function makeEnv(renderer) {
  const es = new THREE.Scene();
  const geo = new THREE.SphereGeometry(60, 32, 16), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x2a66c8), mid = new THREE.Color(0x0b2250), bot = new THREE.Color(0x010409), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 60; if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 0.7)); else c.copy(mid).lerp(bot, Math.min(1, -y * 2)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  es.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, hex, k, p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); es.add(m); };
  panel(26, 5, 0xffffff, 7, [0, 30, 12]); panel(12, 12, 0x3ad7ff, 5, [-30, 12, -6]); panel(16, 4, 0x8fc4ff, 5, [26, 9, 18]); panel(34, 3, 0xffffff, 3.5, [0, 7, -34]); panel(10, 10, 0x2f7dff, 3, [28, 16, -20]);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(es, 0.03); pm.dispose(); return rt.texture;
}

function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x040b1a);
  scene.environment = makeEnv(renderer);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 160);
  camera.position.set(...VIEWS.persp.pos);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.set(...VIEWS.persp.tgt); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.2; controls.maxDistance = 42; controls.maxPolarAngle = Math.PI; controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.75; controls.zoomSpeed = 0.9; controls.panSpeed = 0.8; controls.autoRotateSpeed = 1.1;
  controls.addEventListener('start', () => { G3.tween = null; });
  controls.update();
  Object.assign(G3, { renderer, scene, camera, controls, clock: new THREE.Clock(), raycaster: new THREE.Raycaster() });

  /* lights */
  scene.add(new THREE.HemisphereLight(0x6fa8ff, 0x050c1c, 0.45));
  const key = new THREE.DirectionalLight(0xdcecff, 1.7); key.position.set(7, 11, 8); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); const sc = key.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 40; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  key.target.position.set(2, 0, 1); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x3ad7ff, 1.0); rim.position.set(-9, 5, -7); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x4a7dff, 0.5); fill.position.set(10, 3, -6); scene.add(fill);
  const glow = new THREE.PointLight(0x3ad7ff, 1.4, 9, 2); glow.position.set(0, 2.2, 0); scene.add(glow); G3.glow = glow;
  const pl2 = new THREE.PointLight(0x2f7dff, 0.9, 8, 2); pl2.position.set(0, 1.6, 3.6); scene.add(pl2);

  buildFloor(scene, renderer);
  G3.plant = new THREE.Group(); scene.add(G3.plant);
  G3.bolts = []; G3.flanges = [];
  buildMaterials();
  buildTank(); buildPumps(); buildValves(); buildPiping(); buildEndMarkers();
  finalizeInstanced();
  buildHighlights(); buildLabels(); bindPointer(canvas);
  G3.plant.traverse(o => { if (o.isMesh && o.material && !o.material.transparent && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
  G3.ok = true;
  resize();
  return G3;
}

/* ---------- floor ---------- */
function buildFloor(scene, renderer) {
  // dark base with grid
  const gridMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uC: { value: new THREE.Vector2(2, 1) } },
    vertexShader: 'varying vec2 vP; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vP=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'varying vec2 vP; uniform vec2 uC; void main(){ vec2 g=abs(fract(vP-0.5)-0.5); float l1=1.0-smoothstep(0.0,0.025,min(g.x,g.y)); vec2 g5=abs(fract(vP/5.0-0.5)-0.5)*5.0; float l5=1.0-smoothstep(0.0,0.05,min(g5.x,g5.y)); float d=length(vP-uC); float f=1.0-smoothstep(5.0,17.0,d); vec3 c=vec3(0.12,0.55,1.0); float a=(l1*0.16+l5*0.34)*f; gl_FragColor=vec4(c,a); #include <encodings_fragment>\n }'
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(44, 44).rotateX(-Math.PI / 2), gridMat); grid.position.y = 0.004; grid.renderOrder = 1; scene.add(grid);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(44, 44).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.45 })); sh.position.y = 0.006; sh.receiveShadow = true; scene.add(sh);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(40,140,255,0.0)'], [0.55, 'rgba(40,140,255,0.22)'], [0.75, 'rgba(58,215,255,0.10)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.position.set(0, 0.008, 0); scene.add(halo);
  // reflective floor (optional, falls back silently)
  try {
    if (!THREE.Reflector) throw new Error('no reflector');
    const S0 = THREE.Reflector.ReflectorShader;
    let vs = S0.vertexShader, fs = S0.fragmentShader;
    const vs2 = vs.replace(/vUv\s*=\s*textureMatrix\s*\*\s*vec4\(\s*position\s*,\s*1\.0\s*\)\s*;/, m => m + ' vPos = position.xy;');
    const fs2 = fs.replace(/gl_FragColor\s*=\s*vec4\(\s*blendOverlay\([^;]*;/, 'vec3 rc = blendOverlay( base.rgb, color ); float fa = (1.0 - smoothstep(4.0, 15.0, length(vPos))) * 0.42; gl_FragColor = vec4( pow(rc, vec3(0.9)), fa );');
    if (vs2 === vs || fs2 === fs) throw new Error('reflector shader not patchable');
    const refl = new THREE.Reflector(new THREE.PlaneGeometry(40, 40), {
      clipBias: 0.003, textureWidth: Math.max(256, Math.floor(window.innerWidth * 0.5)), textureHeight: Math.max(256, Math.floor(window.innerHeight * 0.5)), color: 0x6f8fb8,
      shader: { uniforms: S0.uniforms, vertexShader: 'varying vec2 vPos;\n' + vs2, fragmentShader: 'varying vec2 vPos;\n' + fs2 }
    });
    refl.material.transparent = true; refl.material.depthWrite = false; refl.rotation.x = -Math.PI / 2; refl.position.y = 0.001; refl.renderOrder = 0;
    scene.add(refl); G3.reflector = refl;
  } catch (e) { G3.reflectorErr = e.message; }
}

/* ---------- materials ---------- */
function buildMaterials() {
  const std = (c, m, r) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
  G3.M = {
    steel: std(0xaebdd2, 0.92, 0.3), steelDark: std(0x2b3649, 0.8, 0.42), steelBlue: std(0x31507e, 0.85, 0.35), rubber: std(0x0a1020, 0.1, 0.8),
    paint: new THREE.MeshPhysicalMaterial({ color: 0x1c68ff, metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }),
    paintDark: new THREE.MeshPhysicalMaterial({ color: 0x0f2d66, metalness: 0.55, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    glassTank: new THREE.MeshPhysicalMaterial({ color: 0x8fd9ff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.0, clearcoat: 1 }),
    glassPipe: new THREE.MeshPhysicalMaterial({ color: 0x7fd2ff, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8 }),
    glassCap: new THREE.MeshPhysicalMaterial({ color: 0x5fb6ff, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }),
    holo: new THREE.MeshBasicMaterial({ color: 0x3ad7ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x6fe9ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  };
  G3.geo = { cyl: new THREE.CylinderGeometry(1, 1, 1, 24), box: new THREE.BoxGeometry(1, 1, 1) };
}
const M3 = () => G3.M;
function reg(id, obj) {
  obj.traverse(o => { if (o.isMesh) { o.userData.comp = id; G3.picks.push(o); } });
  (G3.comps[id] = G3.comps[id] || { id, groups: [] }).groups.push(obj);
}
function proxy(id, geo, pos, parent) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false })); m.position.copy(pos); m.userData.comp = id; m.userData.noShadow = true; parent.add(m); G3.picks.push(m); return m; }
function mesh(geo, mat, parent, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m; }
function cylAlong(parent, mat, r, len, axis, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 24), mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z); parent.add(m); return m;
}
/* instanced flanges + bolts, collected during build */
function flange(pos, dir, r, bolts) {
  const d = V3(dir[0], dir[1], dir[2]).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d), p = V3(pos[0], pos[1], pos[2]);
  G3.flanges.push(new THREE.Matrix4().compose(p, q, V3(r * 1.6, 0.036, r * 1.6)));
  if (bolts === false) return;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, off = V3(Math.cos(a) * r * 1.33, 0, Math.sin(a) * r * 1.33).applyQuaternion(q);
    G3.bolts.push(new THREE.Matrix4().compose(p.clone().add(off), q, V3(0.016, 0.07, 0.016)));
  }
}
function finalizeInstanced() {
  const mk = (arr, mat) => { if (!arr.length) return; const im = new THREE.InstancedMesh(G3.geo.cyl, mat, arr.length); arr.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; G3.plant.add(im); };
  mk(G3.flanges, G3.M.steel); mk(G3.bolts, G3.M.steelDark);
}

/* ---------- tank ---------- */
function buildTank() {
  const M = G3.M, R = TANK.R, H = TANK.H, y0 = TANK.y0, g = new THREE.Group(); g.name = 'tank'; G3.plant.add(g);
  // skid: base plate, ring beam, legs, bracing
  mesh(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 0.08, 72), M.steelBlue, g, 0, y0 - 0.04, 0);
  const rb = mesh(new THREE.TorusGeometry(R + 0.17, 0.05, 12, 72), M.steel, g, 0, y0 - 0.08, 0); rb.rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.sin(a) * (R + 0.1), z = Math.cos(a) * (R + 0.1);
    mesh(new THREE.BoxGeometry(0.13, y0 - 0.08, 0.13), M.steelBlue, g, x, (y0 - 0.08) / 2, z);
    mesh(new THREE.BoxGeometry(0.3, 0.03, 0.3), M.steelDark, g, x, 0.015, z);
    const gu = mesh(new THREE.BoxGeometry(0.03, 0.26, 0.16), M.steel, g, Math.sin(a) * (R + 0.04), y0 - 0.22, Math.cos(a) * (R + 0.04)); gu.rotation.y = a;
  }
  const br = mesh(new THREE.TorusGeometry(R + 0.1, 0.022, 8, 72), M.steel, g, 0, 0.45, 0); br.rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.05, 72), M.paintDark, g, 0, y0 + 0.0, 0);
  // glass shell
  const wall = mesh(new THREE.CylinderGeometry(R, R, H, 72, 1, true), M.glassTank, g, 0, y0 + H / 2, 0); wall.renderOrder = 6;
  // stiffener rings + ribs (holographic frame)
  [0, 1 / 3, 2 / 3, 1].forEach(k => { const t = mesh(new THREE.TorusGeometry(R + 0.005, 0.016, 8, 72), M.steel, g, 0, y0 + k * H, 0); t.rotation.x = Math.PI / 2; t.userData.noShadow = true; });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const rib = mesh(new THREE.BoxGeometry(0.012, H, 0.012), M.holo, g, Math.sin(a) * (R + 0.008), y0 + H / 2, Math.cos(a) * (R + 0.008)); rib.userData.noShadow = true; }
  // roof dome (spherical cap)
  const SR = 3.0, th = Math.asin(R / SR), capH = SR * (1 - Math.cos(th));
  const roof = mesh(new THREE.SphereGeometry(SR, 72, 10, 0, Math.PI * 2, 0, th), M.glassTank, g, 0, y0 + H - SR * Math.cos(th), 0); roof.renderOrder = 6;
  G3.apexY = y0 + H + capH;
  const rr = mesh(new THREE.TorusGeometry(R, 0.04, 10, 72), M.steel, g, 0, y0 + H, 0); rr.rotation.x = Math.PI / 2;
  // manway + vent on the roof
  mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 32), M.steel, g, 0.62, G3.apexY - 0.05, 0.15);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 16), M.steel, g, -0.6, G3.apexY - 0.02, -0.25);
  mesh(new THREE.SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.steelDark, g, -0.6, G3.apexY + 0.09, -0.25);
  // nozzles (3 inlets, 1 outlet)
  const nozzle = (phi, y) => { const x = Math.sin(phi) * (R + 0.05), z = Math.cos(phi) * (R + 0.05); const n = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 20), M.steel, g, x, y, z); n.rotation.x = Math.PI / 2; n.rotation.z = -phi; n.rotation.order = 'YXZ'; n.rotation.set(Math.PI / 2, 0, 0); n.rotation.y = phi; };
  NOZ_PHI.forEach(p => nozzle(p, NOZ_Y)); nozzle(Math.PI / 2, NOZ_Y);
  // internal level scale rail with ticks and labels (front left)
  const sphi = -1.0, sx = Math.sin(sphi) * (R + 0.07), sz = Math.cos(sphi) * (R + 0.07), rail = new THREE.Group(); rail.position.set(sx, 0, sz); rail.rotation.y = sphi; g.add(rail);
  mesh(new THREE.BoxGeometry(0.05, H, 0.02), M.steel, rail, 0, y0 + H / 2, 0);
  for (let k = 0; k <= 10; k++) { const major = k % 5 === 0 || k === 10, t = mesh(new THREE.BoxGeometry(major ? 0.2 : 0.11, 0.014, 0.014), major ? M.cyan : M.holo, rail, major ? 0.125 : 0.085, y0 + k / 10 * H, 0.01); t.userData.noShadow = true; }
  [[0, '0%'], [25, '25%'], [50, '50%'], [75, '75%'], [100, '100%']].forEach(l => { const s = textSprite(l[1], '#bfe9ff', 0.34, 0.136); s.position.set(0.37, y0 + l[0] / 100 * H, 0.02); rail.add(s); });
  // level switches
  G3.leds.lsl = levelSwitch(g, 1.0, y0 + 0.08 * H); G3.leds.lsh = levelSwitch(g, 1.0, y0 + 0.92 * H);
  // temperature sensor (thermowell)
  const tg = new THREE.Group(); tg.position.set(-(R + 0.02), y0 + 0.3, 0.0); G3.plant.add(tg);
  cylAlong(tg, M.steel, 0.03, 0.34, 'x', -0.17, 0, 0, 14);
  mesh(new THREE.BoxGeometry(0.14, 0.14, 0.12), M.paint, tg, -0.4, 0, 0);
  cylAlong(tg, M.steelDark, 0.022, 0.06, 'x', -0.5, 0, 0, 12);
  G3.leds.temp = mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: 0x36e08a }), tg, -0.4, 0.09, 0);
  proxy('temp', new THREE.BoxGeometry(0.7, 0.3, 0.3), V3(-0.3, 0, 0), tg); reg('temp', tg);
  // water
  buildWater(g);
  // level sensor assembly
  buildSensor();
  reg('tank', g);
  // 'level' registered inside buildSensor
}
function levelSwitch(g, phi, y) {
  const R = TANK.R, s = new THREE.Group(); s.position.set(Math.sin(phi) * (R + 0.05), y, Math.cos(phi) * (R + 0.05)); s.rotation.y = phi; g.add(s);
  cylAlong(s, G3.M.steel, 0.035, 0.16, 'z', 0, 0, 0.08, 12);
  mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), G3.M.paintDark, s, 0, 0, 0.19);
  return mesh(new THREE.SphereGeometry(0.017, 10, 8), new THREE.MeshBasicMaterial({ color: 0x506a86 }), s, 0, 0.05, 0.19);
}

const WATER_VS = 'uniform float uTime; uniform float uAmp; varying vec3 vW; varying vec3 vN; varying vec2 vXZ;\n' +
  'float wv(vec2 p){ return sin(p.x*3.1+uTime*1.3)*0.5 + sin(p.y*4.3-uTime*1.7)*0.35 + sin((p.x+p.y)*6.7+uTime*2.3)*0.2 + sin((p.x-p.y)*9.1-uTime*3.1)*0.1; }\n' +
  'void main(){ vec3 pos=position; vec2 p=pos.xz; float h=wv(p)*uAmp; float e=0.02; float hx=wv(p+vec2(e,0.0))*uAmp; float hz=wv(p+vec2(0.0,e))*uAmp; vN=normalize(vec3(-(hx-h)/e,1.0,-(hz-h)/e)); pos.y+=h; vec4 wp=modelMatrix*vec4(pos,1.0); vW=wp.xyz; vXZ=p; gl_Position=projectionMatrix*viewMatrix*wp; }';
const WATER_FS = 'uniform vec3 uCam; uniform float uR; uniform vec3 uL; uniform float uOp; uniform float uGrey; varying vec3 vW; varying vec3 vN; varying vec2 vXZ;\n' +
  'void main(){ float r=length(vXZ); if(r>uR) discard; vec3 n=normalize(vN); vec3 v=normalize(uCam-vW); float fr=pow(1.0-max(dot(n,v),0.0),3.0);\n' +
  'vec3 deep=vec3(0.02,0.30,0.78); vec3 sh=vec3(0.12,0.70,1.0); vec3 col=mix(deep,sh,0.55+0.45*n.x); col=mix(col,vec3(0.5,0.85,1.0),fr*0.85);\n' +
  'vec3 hh=normalize(uL+v); float sp=pow(max(dot(n,hh),0.0),160.0); col+=vec3(1.0)*sp*1.3;\n' +
  'float foam=smoothstep(uR-0.08,uR-0.004,r); col=mix(col,vec3(0.82,0.96,1.0),foam*0.55);\n' +
  'float ring=smoothstep(0.012,0.0,abs(fract(r*5.0)-0.5)-0.47); col+=vec3(0.1,0.35,0.5)*ring*0.5;\n' +
  'col=mix(col,vec3(dot(col,vec3(0.33))),uGrey);\n' +
  'float a=mix(0.66,0.92,fr)*uOp; gl_FragColor=vec4(col,a);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}';
const BODY_VS = 'varying vec3 vW; varying vec3 vNw; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vNw=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*wp; }';
const BODY_FS = 'uniform vec3 uCam; uniform float uY0; uniform float uH; uniform float uTop; uniform float uOp; uniform float uTime; uniform float uGrey; varying vec3 vW; varying vec3 vNw;\n' +
  'void main(){ vec3 v=normalize(uCam-vW); vec3 n=normalize(vNw); if(!gl_FrontFacing) n=-n; float fr=pow(1.0-abs(dot(n,v)),2.0); float t=clamp((vW.y-uY0)/uH,0.0,1.0);\n' +
  'vec3 col=mix(vec3(0.02,0.20,0.58),vec3(0.10,0.62,1.0),t); col+=vec3(0.2,0.7,1.0)*fr*0.6; float scan=0.5+0.5*sin(vW.y*70.0-uTime*1.5); col*=0.92+0.08*scan;\n' +
  'float edge=smoothstep(0.1,0.0,uTop-vW.y)*step(vW.y,uTop+0.001); col+=vec3(0.4,0.9,1.0)*edge*0.8; float a=(0.30+0.30*fr+0.12*(1.0-t)+edge*0.25)*uOp;\n' +
  'col=mix(col,vec3(dot(col,vec3(0.33))),uGrey); gl_FragColor=vec4(col,a);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}';

function buildWater(g) {
  const R = TANK.R - 0.035, y0 = TANK.y0;
  const bodyU = { uCam: { value: new THREE.Vector3() }, uY0: { value: y0 }, uH: { value: TANK.H }, uTop: { value: y0 }, uOp: { value: 1 }, uTime: { value: 0 }, uGrey: { value: 0 } };
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 72, 1, true), new THREE.ShaderMaterial({ uniforms: bodyU, vertexShader: BODY_VS, fragmentShader: BODY_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  body.renderOrder = 4; body.userData.noShadow = true; g.add(body);
  const surfU = { uTime: { value: 0 }, uAmp: { value: 0.014 }, uCam: { value: new THREE.Vector3() }, uR: { value: R }, uL: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() }, uOp: { value: 1 }, uGrey: { value: 0 } };
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(2 * R + 0.02, 2 * R + 0.02, 90, 90).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: surfU, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  surf.renderOrder = 5; surf.userData.noShadow = true; g.add(surf);
  G3.water = { body, surf, bodyU, surfU };
}

/* ---------- level sensor (guided wave radar style probe) ---------- */
function buildSensor() {
  const M = G3.M, g = new THREE.Group(), top = G3.apexY; g.position.set(0, top, 0); G3.plant.add(g);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.045, 32), M.steel, g, 0, 0.0, 0); flange([0, 0.0, 0], [0, 1, 0], 0.085, false);
  mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.14, 20), M.steelDark, g, 0, 0.1, 0);
  const hz = mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.2, 32), M.paint, g, 0, 0.27, 0);
  mesh(new THREE.SphereGeometry(0.105, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.paint, g, 0, 0.37, 0);
  mesh(new THREE.TorusGeometry(0.106, 0.012, 8, 32), M.steel, g, 0, 0.17, 0).rotation.x = Math.PI / 2;
  // display
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; G3.sensorCanvas = c; G3.sensorTex = new THREE.CanvasTexture(c); G3.sensorTex.encoding = THREE.sRGBEncoding;
  const disp = mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: G3.sensorTex, toneMapped: false }), g, 0, 0.29, 0.108); disp.userData.noShadow = true;
  mesh(new THREE.BoxGeometry(0.14, 0.085, 0.01), M.steelDark, g, 0, 0.29, 0.103);
  cylAlong(g, M.steelDark, 0.022, 0.07, 'x', 0.13, 0.25, 0, 12);
  G3.leds.level = mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0x36e08a }), g, 0, 0.345, 0.085);
  // probe rod down into the tank
  const y0p = TANK.y0 + 0.12, len = top - y0p;
  mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 10), M.steel, g, 0, -len / 2, 0);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 14), M.steel, g, 0, -len - 0.04, 0);
  // measuring point marker follows the water surface
  const mk = new THREE.Group(); G3.plant.add(mk); G3.markY = mk;
  const t1 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.007, 8, 40), G3.M.cyan); t1.rotation.x = Math.PI / 2; mk.add(t1);
  const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.004, 8, 40), G3.M.holo); t2.rotation.x = Math.PI / 2; mk.add(t2);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), G3.M.cyan); mk.add(dot); G3.markDot = dot;
  [t1, t2, dot].forEach(m => { m.userData.noShadow = true; m.renderOrder = 8; });
  // hit proxies
  proxy('level', new THREE.CylinderGeometry(0.2, 0.2, 0.6, 12), V3(0, 0.3, 0), g);
  const prod = proxy('level', new THREE.CylinderGeometry(0.1, 0.1, len, 8), V3(0, -len / 2, 0), g);
  reg('level', g);
  G3.levelGroup = g; G3.probeLen = len; G3.probeBottom = y0p;
}
function drawSensorDisplay() {
  const c = G3.sensorCanvas; if (!c) return; const x = c.getContext('2d');
  x.fillStyle = '#031225'; x.fillRect(0, 0, 128, 64);
  const ok = S.hasLevel && !S.sensorBad && app.mode !== 'offline' && S.dataValid;
  x.fillStyle = ok ? '#6fe9ff' : '#ff9aa4'; x.font = '700 34px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(S.hasLevel && !S.sensorBad ? fnum(S.levelPct, 1) + '%' : '--.-', 64, 24);
  x.font = '600 18px monospace'; x.fillStyle = '#84a8c8';
  x.fillText(S.lt && S.lt.v !== null ? fnum(S.lt.v, 2) + ' mA' : 'NO SIGNAL', 64, 50);
  if (G3.sensorTex) G3.sensorTex.needsUpdate = true;
}

/* ---------- pumps ---------- */
function buildPumps() {
  const M = G3.M;
  G3.pumps = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.position.set(PX[i], 0, PUMP_Z0); G3.plant.add(g);
    const parts = new THREE.Group(); g.add(parts);
    mesh(new THREE.BoxGeometry(0.72, 0.08, 1.95), M.steelDark, parts, 0, 0.04, 0.82);
    for (const sx of [-0.3, 0.3]) for (const sz of [-0.05, 1.7]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), M.steel, parts, sx, 0.095, sz);
    // motor
    cylAlong(parts, M.paint, 0.27, 0.85, 'z', 0, 0.55, 0.43, 40);
    for (let k = 0; k < 9; k++) cylAlong(parts, M.paintDark, 0.285, 0.022, 'z', 0, 0.55, 0.06 + k * 0.09, 40);
    mesh(new THREE.BoxGeometry(0.5, 0.2, 0.55), M.paintDark, parts, 0, 0.2, 0.42);
    cylAlong(parts, M.paintDark, 0.255, 0.04, 'z', 0, 0.55, 0.875, 32);
    // fan cover with visible spinning fan
    const fanG = new THREE.Group(); fanG.position.set(0, 0.55, -0.09); parts.add(fanG);
    for (let b = 0; b < 6; b++) { const bl = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.012), M.steel, fanG, 0, 0, 0); bl.position.set(Math.cos(b / 6 * Math.PI * 2) * 0.11, Math.sin(b / 6 * Math.PI * 2) * 0.11, 0); bl.rotation.z = b / 6 * Math.PI * 2; bl.rotation.x = 0.5; }
    cylAlong(fanG, M.steelDark, 0.04, 0.05, 'z', 0, 0, 0, 12);
    cylAlong(parts, M.glassCap, 0.262, 0.2, 'z', 0, 0.55, -0.1, 32);
    for (const dz of [-0.2, 0.0]) { const rg = mesh(new THREE.TorusGeometry(0.262, 0.008, 6, 32), M.steel, parts, 0, 0.55, dz - 0.0); }
    for (let s = 0; s < 8; s++) { const a = s / 8 * Math.PI * 2; const bar = mesh(new THREE.BoxGeometry(0.008, 0.008, 0.2), M.steel, parts, Math.cos(a) * 0.262, 0.55 + Math.sin(a) * 0.262, -0.1); }
    // terminal box + LED
    mesh(new THREE.BoxGeometry(0.22, 0.13, 0.22), M.steelDark, parts, 0.0, 0.89, 0.4);
    const led = mesh(new THREE.SphereGeometry(0.028, 12, 10), new THREE.MeshBasicMaterial({ color: 0x506a86 }), parts, 0, 0.97, 0.4);
    // coupling guard with rotating shaft
    const shaft = new THREE.Group(); shaft.position.set(0, 0.55, 0.98); parts.add(shaft);
    cylAlong(shaft, M.steel, 0.055, 0.34, 'z', 0, 0, 0, 20);
    for (let k = 0; k < 4; k++) { const st = mesh(new THREE.BoxGeometry(0.125, 0.02, 0.2), M.cyan, shaft, 0, 0, 0); st.rotation.z = k * Math.PI / 4; st.userData.noShadow = true; }
    cylAlong(parts, M.glassCap, 0.19, 0.3, 'z', 0, 0.55, 0.98, 32);
    // casing and flanges
    cylAlong(parts, M.paint, 0.31, 0.26, 'z', 0, 0.55, 1.26, 40);
    cylAlong(parts, M.paintDark, 0.255, 0.1, 'z', 0, 0.55, 1.44, 32);
    cylAlong(parts, M.steel, 0.09, 0.24, 'z', 0, 0.55, 1.58, 20); flange([0, 0.55, 1.7], [0, 0, 1], 0.09);
    cylAlong(parts, M.steel, 0.075, 0.18, 'y', 0, 0.94, 1.24, 20);
    // pressure gauge
    const pg = new THREE.Group(); pg.position.set(0.22, 0.88, 1.26); parts.add(pg);
    cylAlong(pg, M.steel, 0.012, 0.1, 'y', 0, 0.05, 0, 8); cylAlong(pg, M.steelDark, 0.05, 0.03, 'x', 0.02, 0.12, 0, 20);
    mesh(new THREE.CircleGeometry(0.044, 20), new THREE.MeshBasicMaterial({ color: 0xcfeaff }), pg, 0.0, 0.12, 0).rotation.y = -Math.PI / 2;
    // nameplate hologram tag
    const rp = { g, parts, fan: fanG, shaft, led, speed: 0, spin: 0 }; G3.pumps.push(rp);
    proxy('pump' + (i + 1), new THREE.BoxGeometry(0.8, 1.0, 2.0), V3(0, 0.55, 0.8), g);
    reg('pump' + (i + 1), g);
    G3.vis.pump.push({ speed: 0 });
  }
}

/* ---------- motorized valves (butterfly type, glass body, visible disc) ---------- */
function buildValves() {
  const M = G3.M; G3.valves = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.position.set(VBX[i], NOZ_Y, -1.15); G3.plant.add(g);
    const r = 0.085;
    cylAlong(g, M.glassCap, 0.115, 0.28, 'z', 0, 0, 0, 32);
    flange([0, 0, 0.145], [0, 0, 1], r); flange([0, 0, -0.145], [0, 0, 1], r);
    cylAlong(g, M.steel, 0.1, 0.03, 'z', 0, 0, 0.15, 32); cylAlong(g, M.steel, 0.1, 0.03, 'z', 0, 0, -0.15, 32);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.022, 36).rotateX(Math.PI / 2), M.steel); g.add(disc);
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 12), M.steel, g, 0, 0.18, 0);
    mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.12, 24), M.steelDark, g, 0, 0.17, 0);
    // actuator
    const act = new THREE.Group(); act.position.y = 0.3; g.add(act);
    mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.26, 32), M.paint, act, 0, 0.13, 0);
    mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 32), M.paintDark, act, 0, 0.29, 0);
    cylAlong(act, M.paint, 0.07, 0.22, 'x', 0.2, 0.12, 0, 20); cylAlong(act, M.steelDark, 0.075, 0.03, 'x', 0.32, 0.12, 0, 20);
    const dome = mesh(new THREE.SphereGeometry(0.1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glassCap, act, 0, 0.32, 0);
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.03), M.cyan); ind.position.set(0, 0.325, 0); act.add(ind); ind.userData.noShadow = true;
    const led = mesh(new THREE.SphereGeometry(0.026, 12, 10), new THREE.MeshBasicMaterial({ color: 0x506a86 }), act, 0, 0.2, 0.135);
    mesh(new THREE.TorusGeometry(0.085, 0.013, 8, 24), M.steel, act, 0, 0.33, 0).rotation.x = Math.PI / 2;
    proxy('valve' + (i + 1), new THREE.BoxGeometry(0.5, 1.0, 0.5), V3(0, 0.3, 0), g);
    reg('valve' + (i + 1), g);
    G3.valves.push({ g, disc, ind, led, pos: 0.5 });
    G3.vis.valve.push({ pos: 0.5 });
  }
}

/* ---------- piping with flow particles ---------- */
const PIPE_SEGS = [];
function addSeg(name, pts, r, flowFn, opts) {
  opts = opts || {};
  const path = rpath(pts, opts.bend == null ? 0.2 : opts.bend), len = path.getLength();
  const n = Math.max(8, Math.ceil(len * 26));
  const shell = new THREE.Mesh(new THREE.TubeGeometry(path, n, r, 20, false), G3.M.glassPipe); shell.renderOrder = 3; shell.userData.noShadow = true; G3.plant.add(shell);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x2a9bff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.TubeGeometry(path, n, r * 0.78, 14, false), coreMat); core.renderOrder = 2; core.userData.noShadow = true; G3.plant.add(core);
  const cap = Math.max(4, Math.ceil(len * 9));
  const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.024, 0.1, 8), G3.M.cyan, cap); im.count = 0; im.frustumCulled = false; im.renderOrder = 7; G3.plant.add(im);
  const seg = { name, path, len, r, flowFn, core, coreMat, im, cap, phase: Math.random(), q: 0 };
  PIPE_SEGS.push(seg); return seg;
}
function nozzlePt(i) { const p = NOZ_PHI[i]; return [Math.sin(p) * NOZ_R, NOZ_Y, Math.cos(p) * NOZ_R]; }
function buildPiping() {
  const Y = 0.55, ZH = 4.9, SUP = 5.4, XH = 8.2;
  const qp = i => () => G3.flow.pump[i], qv = i => () => G3.flow.valve[i];
  const sum = (...f) => () => f.reduce((a, g) => a + g(), 0);
  const P0 = qp(0), P1 = qp(1), P2 = qp(2), V0 = qv(0), V1 = qv(1), V2 = qv(2);
  /* inlet: header (flow toward -x) */
  addSeg('H-A', [[XH, Y, ZH], [PX[2], Y, ZH]], 0.1, sum(P0, P1, P2));
  addSeg('H-B', [[PX[2], Y, ZH], [PX[1], Y, ZH]], 0.1, sum(P0, P1));
  addSeg('H-C', [[PX[1], Y, ZH], [PX[0], Y, ZH]], 0.1, P0);
  const fl = (x, y, z, dir, r) => flange([x, y, z], dir, r);
  fl(XH, Y, ZH, [1, 0, 0], 0.1);
  [PX[2], PX[1]].forEach(x => fl(x, Y, ZH, [1, 0, 0], 0.1, false));
  for (let i = 0; i < 3; i++) {
    const x = PX[i], z0 = PUMP_Z0 + 1.7;
    addSeg('S' + i, [[x, Y, ZH], [x, Y, z0]], 0.08, qp(i));
    const zd = PUMP_Z0 + 1.26, nz = nozzlePt(i);
    const pts = [[x, 0.88, zd], [x, NOZ_Y, zd]];
    if (i === 1) pts.push([nz[0], NOZ_Y, nz[2]]);
    else pts.push([x, NOZ_Y, 2.35], [nz[0], NOZ_Y, 2.35], [nz[0], NOZ_Y, nz[2]]);
    addSeg('D' + i, pts, 0.075, qp(i), { bend: 0.25 });
    // check valve body on discharge
    const cv = new THREE.Group(); cv.position.set(x, 1.1, zd); G3.plant.add(cv);
    mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.17, 24), G3.M.steelBlue, cv, 0, 0, 0); flange([x, 1.1 - 0.085, zd], [0, 1, 0], 0.075); flange([x, 1.1 + 0.085, zd], [0, 1, 0], 0.075);
    fl(nz[0], NOZ_Y, nz[2], [Math.sin(NOZ_PHI[i]), 0, Math.cos(NOZ_PHI[i])], 0.075);
    // pipe support under the header
    mesh(new THREE.CylinderGeometry(0.035, 0.035, Y - 0.1, 10), G3.M.steelDark, G3.plant, x - 0.5, (Y - 0.1) / 2, ZH);
    mesh(new THREE.BoxGeometry(0.22, 0.02, 0.22), G3.M.steelDark, G3.plant, x - 0.5, 0.01, ZH);
  }
  /* outlet: supply header (flow +x) */
  const o = [NOZ_R, NOZ_Y, 0];
  addSeg('O-A', [o, [VBX[0], NOZ_Y, 0]], 0.1, sum(V0, V1, V2));
  addSeg('O-B', [[VBX[0], NOZ_Y, 0], [VBX[1], NOZ_Y, 0]], 0.1, sum(V1, V2));
  addSeg('O-C', [[VBX[1], NOZ_Y, 0], [VBX[2], NOZ_Y, 0]], 0.1, V2);
  fl(o[0], o[1], o[2], [1, 0, 0], 0.1);
  [VBX[0], VBX[1]].forEach(x => fl(x, NOZ_Y, 0, [1, 0, 0], 0.1, false));
  const Q = [V0, V1, V2];
  for (let i = 0; i < 3; i++) {
    addSeg('V' + i + 'a', [[VBX[i], NOZ_Y, 0], [VBX[i], NOZ_Y, -1.0]], 0.085, Q[i]);
    addSeg('V' + i + 'b', [[VBX[i], NOZ_Y, -1.3], [VBX[i], NOZ_Y, -2.3]], 0.085, Q[i]);
    // supports
    for (const z of [-0.45, -1.9]) { mesh(new THREE.CylinderGeometry(0.03, 0.03, NOZ_Y - 0.1, 10), G3.M.steelDark, G3.plant, VBX[i], (NOZ_Y - 0.1) / 2, z); mesh(new THREE.BoxGeometry(0.2, 0.02, 0.2), G3.M.steelDark, G3.plant, VBX[i], 0.01, z); }
  }
  const CY = -2.3;
  addSeg('C-A', [[VBX[0], NOZ_Y, CY], [VBX[1], NOZ_Y, CY]], 0.1, V0);
  addSeg('C-B', [[VBX[1], NOZ_Y, CY], [VBX[2], NOZ_Y, CY]], 0.1, sum(V0, V1));
  addSeg('C-C', [[VBX[2], NOZ_Y, CY], [XH, NOZ_Y, CY]], 0.1, sum(V0, V1, V2));
  fl(XH, NOZ_Y, CY, [1, 0, 0], 0.1);
  for (const x of [3.3, 6.8]) { mesh(new THREE.CylinderGeometry(0.035, 0.035, NOZ_Y - 0.1, 10), G3.M.steelDark, G3.plant, x, (NOZ_Y - 0.1) / 2, CY); mesh(new THREE.BoxGeometry(0.22, 0.02, 0.22), G3.M.steelDark, G3.plant, x, 0.01, CY); }
  for (const x of [1.9, 3.3, 4.7, 6.1]) { mesh(new THREE.CylinderGeometry(0.035, 0.035, NOZ_Y - 0.1, 10), G3.M.steelDark, G3.plant, x, (NOZ_Y - 0.1) / 2, 0); mesh(new THREE.BoxGeometry(0.22, 0.02, 0.22), G3.M.steelDark, G3.plant, x, 0.01, 0); }
  // junction flanges where the branches meet the collector
  VBX.forEach(x => { fl(x, NOZ_Y, -1.0, [0, 0, 1], 0.085, false); fl(x, NOZ_Y, -1.3, [0, 0, 1], 0.085, false); });
}
G3.flow = { pump: [0, 0, 0], valve: [0, 0, 0] };

function buildEndMarkers() {
  const cone = (x, y, z, rotZ) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 16), G3.M.cyan); m.position.set(x, y, z); m.rotation.z = rotZ; m.userData.noShadow = true; G3.plant.add(m); return m; };
  G3.srcArrow = cone(9.0, 0.55, 4.9, Math.PI / 2);          // points -x? cone tip is +y; rotZ +90deg turns tip to -x
  G3.dstArrow = cone(8.9, NOZ_Y, -2.3, -Math.PI / 2);       // tip toward +x
  const base = (x, y, z, d) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28).rotateZ(Math.PI / 2), G3.M.steelBlue); m.position.set(x, y, z); G3.plant.add(m); };
  base(8.3, 0.55, 4.9); base(8.3, NOZ_Y, -2.3);
}

/* ---------- highlight brackets, beacons, labels ---------- */
function buildHighlights() {
  const bm = (c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
  const beaconTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']], 128);
  Object.keys(COMPS).forEach(id => {
    const c = G3.comps[id]; if (!c) return;
    const box = new THREE.Box3(); c.groups.forEach(gr => box.expandByObject(gr));
    if (id === 'tank') box.max.y = Math.min(box.max.y, TANK.y0 + TANK.H + 0.4);
    c.box = box; c.center = box.getCenter(new THREE.Vector3()); c.size = box.getSize(new THREE.Vector3());
    const s = box.min, e = box.max, L = Math.min(0.28, Math.min(c.size.x, c.size.y, c.size.z) * 0.35 + 0.05), pts = [];
    [s.x, e.x].forEach((x, ix) => [s.y, e.y].forEach((y, iy) => [s.z, e.z].forEach((z, iz) => {
      const dx = ix ? -L : L, dy = iy ? -L : L, dz = iz ? -L : L;
      pts.push(x, y, z, x + dx, y, z, x, y, z, x, y + dy, z, x, y, z, x, y, z + dz);
    })));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const br = new THREE.LineSegments(geo, bm(0x3ad7ff)); br.visible = false; br.renderOrder = 20; br.frustumCulled = false; G3.scene.add(br); c.brackets = br;
    const bc = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex, color: 0xff4d5e, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    bc.visible = false; bc.renderOrder = 21; bc.position.set(c.center.x, box.max.y + 0.35, c.center.z); G3.scene.add(bc); c.beacon = bc;
    c.anchor = V3(c.center.x, box.max.y + 0.12, c.center.z);
    if (id === 'level') c.anchor = V3(0.25, G3.apexY + 0.5, 0);
  });
}
const TAG_DEFS = [];
function buildLabels() {
  const host = $('#labels'); if (!host) return;
  const mk = (key, comp, anchor) => { const el = document.createElement('div'); el.className = 'tag off'; el.dataset.k = key; el.innerHTML = '<i></i><span></span>'; if (comp) { el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.addEventListener('click', ev => { ev.stopPropagation(); selectComp(comp); }); } host.appendChild(el); const d = { key, comp, anchor, el, span: el.querySelector('span'), last: '' }; TAG_DEFS.push(d); return d; };
  Object.keys(COMPS).forEach(id => { if (G3.comps[id]) mk(id, id, G3.comps[id].anchor); });
  mk('src', null, V3(8.3, 1.05, 4.9)); mk('dst', null, V3(8.3, 1.8, -2.3));
}
function tagText(d) {
  const c = d.comp, id = d.key; let txt = '', cls = 'off';
  const none = !S.dataValid && app.mode !== 'sim';
  if (id === 'src') { return ['From Source', 'good']; } if (id === 'dst') { return ['To Distribution', 'good']; }
  if (id === 'tank') { txt = 'Tank ' + (S.hasLevel ? fnum(S.levelPct, 0) + ' %' : 'NO DATA'); cls = S.hasLevel ? (S.stale || none ? 'warn' : 'good') : 'off'; }
  else if (id === 'level') { txt = 'Level Sensor'; cls = S.sensorBad ? 'bad' : (S.lt && S.lt.v !== null ? (S.stale ? 'warn' : 'good') : 'off'); }
  else if (id === 'temp') { txt = S.tempC != null ? fnum(S.tempC, 1) + ' °C' : 'TT-101'; cls = S.tempC != null ? 'good' : 'off'; }
  else if (id.indexOf('pump') === 0) { const p = S.pumps[+id.slice(4) - 1]; txt = COMPS[id].short + ' ' + (!p.known ? '--' : p.fault ? 'Fault' : p.run ? 'Running' : 'Stopped'); cls = !p.known ? 'off' : p.fault ? 'bad' : p.run ? 'good' : 'off'; }
  else if (id.indexOf('valve') === 0) { const v = S.valves[+id.slice(5) - 1]; txt = COMPS[id].short + ' ' + ({ open: 'Open', closed: 'Closed', travel: 'Moving', fault: 'Fault', unknown: '--' }[v.state]); cls = { open: 'good', closed: 'bad', travel: 'warn', fault: 'bad', unknown: 'off' }[v.state]; }
  return [txt, cls];
}
function updateLabels(now) {
  if (!TAG_DEFS.length) return;
  const w = G3.size.w, h = G3.size.h, am = G3.amap || {}, tmp = V3(0, 0, 0), upd = now - (G3.lastTagT || 0) > 250; if (upd) G3.lastTagT = now;
  TAG_DEFS.forEach(d => {
    if (!G3.labelsOn) { d.el.style.display = 'none'; return; }
    tmp.copy(d.anchor).project(G3.camera);
    const vis = tmp.z < 1 && tmp.z > -1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
    if (!vis) { d.el.style.display = 'none'; return; }
    d.el.style.display = 'flex';
    d.el.style.left = ((tmp.x * 0.5 + 0.5) * w).toFixed(1) + 'px'; d.el.style.top = ((-tmp.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
    if (upd) {
      const r = tagText(d), k = r[0] + '|' + r[1] + '|' + (am[d.comp] ? am[d.comp].sev : '') + '|' + (G3.selected === d.comp);
      if (k !== d.last) { d.last = k; d.span.textContent = r[0]; d.el.className = 'tag ' + r[1] + (am[d.comp] ? ' alm' : '') + (G3.selected === d.comp ? ' sel' : ''); }
    }
  });
}

/* ---------- selection, picking ---------- */
function selectComp(id) {
  G3.selected = id || null;
  if (G3.onSelect) G3.onSelect(G3.selected);
}
function pickAt(cx, cy) {
  const r = G3.renderer.domElement.getBoundingClientRect(), ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  G3.raycaster.setFromCamera(ndc, G3.camera);
  const hits = G3.raycaster.intersectObjects(G3.picks, false); if (!hits.length) return null;
  const first = hits[0], id = first.object.userData.comp;
  if (id !== 'tank') return id;
  const inner = hits.find(h => (h.object.userData.comp === 'level' || h.object.userData.comp === 'temp') && h.distance < first.distance + 2 * TANK.R + 0.5);
  return inner ? inner.object.userData.comp : 'tank';
}
function bindPointer(canvas) {
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!down) return; const mv = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (mv < 6 && dt < 600) selectComp(pickAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) return; if (G3.hoverBusy) return; G3.hoverBusy = true;
    requestAnimationFrame(() => { G3.hoverBusy = false; const id = pickAt(e.clientX, e.clientY); if (id !== G3.hover) { G3.hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; } });
  });
  canvas.addEventListener('pointerleave', () => { G3.hover = null; });
  canvas.addEventListener('dblclick', e => { const id = pickAt(e.clientX, e.clientY); if (id) { selectComp(id); focusComp(id); } });
  canvas.addEventListener('keydown', e => { const k = { '1': 'persp', '2': 'front', '3': 'right', '4': 'top', '5': 'under', '6': 'pumps', '7': 'sensor', '8': 'valves', '0': 'persp' }[e.key]; if (k) flyToView(k); });
}

/* ---------- camera moves ---------- */
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function flyTo(pos, tgt, dur) {
  if (!G3.ok) return; G3.controls.autoRotate = false;
  G3.tween = { t: 0, dur: dur || 1.1, p0: G3.camera.position.clone(), t0: G3.controls.target.clone(), p1: V3(pos[0], pos[1], pos[2]), t1: V3(tgt[0], tgt[1], tgt[2]) };
}
function flyToView(k) { const v = VIEWS[k]; if (v) { G3.view = k; flyTo(v.pos, v.tgt); } }
function focusComp(id) {
  const c = G3.comps[id]; if (!c || !G3.ok) return;
  const rad = Math.max(c.size.x, c.size.y, c.size.z) * 0.5, dist = Math.max(2.2, rad * 2.9 + 1.2);
  const dir = G3.camera.position.clone().sub(G3.controls.target).normalize(); if (dir.y < 0.12) dir.y = 0.12; dir.normalize();
  const tg = c.center.clone(); if (id === 'level') tg.y = G3.apexY - 0.4;
  const p = tg.clone().addScaledVector(dir, dist);
  flyTo([p.x, p.y, p.z], [tg.x, tg.y, tg.z], 0.9);
}
function updateTween(dt) {
  const tw = G3.tween; if (!tw) return;
  tw.t += dt / tw.dur; const k = ease(Math.min(1, tw.t));
  G3.camera.position.lerpVectors(tw.p0, tw.p1, k); G3.controls.target.lerpVectors(tw.t0, tw.t1, k);
  if (tw.t >= 1) G3.tween = null;
}

/* ---------- per-frame twin update ---------- */
const FLOW_V0 = 0.35;
function visualFlows() {
  const f = G3.flow, ok = S.dataValid && app.mode !== 'offline';
  let nRun = 0; S.pumps.forEach(p => { if (p.run && p.known) nRun++; });
  let srcF = 1; if (S.qin != null && nRun > 0) srcF = clamp(S.qin / (nRun * PUMP_Q), 0, 1.5); else if (S.qin != null) srcF = 0;
  for (let i = 0; i < 3; i++) f.pump[i] = (ok && S.pumps[i].run && S.pumps[i].known) ? PUMP_Q * srcF : 0;
  const head = S.hasLevel ? S.levelM : 0; let sumPos = 0; S.valves.forEach(v => { sumPos += v.pos; });
  for (let i = 0; i < 3; i++) {
    const v = S.valves[i]; let q = 0;
    if (ok && head > 0.02 && v.known) q = S.qout != null ? (sumPos > 0.02 ? S.qout * v.pos / sumPos : 0) : v.pos * VALVE_K * Math.sqrt(head);
    f.valve[i] = q;
  }
}
function updateTwin(dt, t, now) {
  const vis = G3.vis, W = G3.water, cam = G3.camera.position, M = G3.M;
  visualFlows();
  // water level
  const tgt = S.hasLevel ? S.levelM : 0;
  vis.level += (tgt - vis.level) * (1 - Math.exp(-dt * 2.2));
  const lvl = Math.max(vis.level, 0.0005), show = S.hasLevel;
  W.body.visible = W.surf.visible = show && vis.level > 0.004;
  W.body.scale.y = lvl; W.body.position.y = TANK.y0 + lvl / 2;
  const grey = (S.stale || !S.dataValid || S.sensorBad) && app.mode !== 'sim' ? 0.75 : (S.sensorBad || !S.dataValid ? 0.6 : 0);
  const op = app.mode === 'offline' ? 0.75 : 1;
  W.bodyU.uTop.value = TANK.y0 + lvl; W.bodyU.uCam.value.copy(cam); W.bodyU.uTime.value = t; W.bodyU.uOp.value = op; W.bodyU.uGrey.value = grey;
  W.surf.position.y = TANK.y0 + lvl;
  const inflow = G3.flow.pump.reduce((a, b) => a + b, 0);
  W.surfU.uTime.value = t * (app.mode === 'offline' ? 0 : 1); W.surfU.uAmp.value = 0.010 + 0.012 * clamp(inflow / 12, 0, 1); W.surfU.uCam.value.copy(cam); W.surfU.uOp.value = op; W.surfU.uGrey.value = grey;
  // sensor measuring point
  G3.markY.position.set(0, TANK.y0 + lvl, 0); G3.markY.visible = show; G3.markDot.position.y = 0; const pulse = 1 + 0.25 * Math.sin(t * 4); G3.markY.scale.set(pulse, 1, pulse);
  // glow light follows level
  G3.glow.position.y = TANK.y0 + Math.max(0.3, lvl * 0.6); G3.glow.intensity = show ? 1.2 : 0.3;
  // pumps
  const am = G3.amap = compAlarmMap(), blink = 0.5 + 0.5 * Math.sin(t * 7);
  for (let i = 0; i < 3; i++) {
    const p = S.pumps[i], rp = G3.pumps[i], v = vis.pump[i], want = (p.run && p.known && app.mode !== 'offline' && S.dataValid) ? 1 : 0;
    v.speed += (want - v.speed) * (1 - Math.exp(-dt * (want ? 1.6 : 0.9)));
    const w = v.speed * 16; rp.fan.rotation.z += w * dt; rp.shaft.rotation.z += w * dt;
    rp.parts.position.y = v.speed > 0.2 ? Math.sin(t * 90 + i) * 0.0012 * v.speed : 0;
    const a = am['pump' + (i + 1)], col = !p.known ? 0x506a86 : p.fault ? (blink > 0.5 ? 0xff4d5e : 0x6a1520) : p.run ? 0x36e08a : 0x506a86;
    rp.led.material.color.setHex(a && a.unack ? (blink > 0.5 ? 0xff4d5e : 0x501018) : col);
  }
  // valves
  for (let i = 0; i < 3; i++) {
    const s = S.valves[i], vv = G3.valves[i], tv = vis.valve[i];
    tv.pos += clamp(s.pos - tv.pos, -dt * 0.6, dt * 0.6);
    vv.disc.rotation.y = tv.pos * Math.PI / 2; vv.ind.rotation.y = tv.pos * Math.PI / 2;
    const a = am['valve' + (i + 1)], col = { open: 0x36e08a, closed: 0xff4d5e, travel: 0xffbf3d, fault: blink > 0.5 ? 0xff4d5e : 0x501018, unknown: 0x506a86 }[s.state];
    vv.led.material.color.setHex(a && a.unack ? (blink > 0.5 ? 0xff4d5e : 0x501018) : col);
  }
  // level / temp / switch LEDs
  G3.leds.level.material.color.setHex(S.sensorBad ? (blink > 0.5 ? 0xff4d5e : 0x501018) : (S.hasLevel && S.dataValid ? 0x36e08a : 0x506a86));
  G3.leds.temp.material.color.setHex(S.tempC != null ? 0x36e08a : 0x506a86);
  G3.leds.lsl.material.color.setHex(S.lsl ? 0xffbf3d : 0x2a3d57); G3.leds.lsh.material.color.setHex(S.lsh ? 0xff4d5e : 0x2a3d57);
  // end arrows
  const ap = 0.9 + 0.1 * Math.sin(t * 4); G3.srcArrow.scale.setScalar(ap); G3.dstArrow.scale.setScalar(ap);
  const anyIn = inflow > 0.1, anyOut = G3.flow.valve.reduce((a, b) => a + b, 0) > 0.1;
  G3.srcArrow.visible = anyIn; G3.dstArrow.visible = anyOut;
  // flow particles + pipe cores
  const q = new THREE.Quaternion(), up = V3(0, 1, 0), m4 = new THREE.Matrix4(), one = V3(1, 1, 1);
  PIPE_SEGS.forEach(sg => {
    const fl = sg.flowFn(); sg.q = fl; const dens = clamp(fl / 15, 0, 1);
    sg.coreMat.opacity += ((fl > 0.15 ? 0.16 + 0.3 * dens : 0.06) - sg.coreMat.opacity) * Math.min(1, dt * 4);
    if (fl <= 0.15) { sg.im.count = 0; return; }
    const n = Math.min(sg.cap, Math.max(2, Math.round(sg.len * (3 + 7 * dens)))), spd = FLOW_V0 + 1.1 * dens;
    sg.phase = (sg.phase + dt * spd / sg.len) % 1;
    for (let k = 0; k < n; k++) {
      const u = (k / n + sg.phase) % 1, p = sg.path.getPointAt(u), tg = sg.path.getTangentAt(u);
      q.setFromUnitVectors(up, tg); m4.compose(p, q, one); sg.im.setMatrixAt(k, m4);
    }
    sg.im.count = n; sg.im.instanceMatrix.needsUpdate = true;
  });
  // highlights
  Object.keys(G3.comps).forEach(id => {
    const c = G3.comps[id]; if (!c.brackets) return;
    const al = am[id], sel = G3.selected === id, hov = G3.hover === id;
    if (al) {
      const hex = al.sev === 'crit' ? 0xff4d5e : al.sev === 'high' ? 0xff8c3c : 0xffbf3d, k = al.unack ? 0.35 + 0.65 * blink : 0.75;
      c.brackets.visible = true; c.brackets.material.color.setHex(hex); c.brackets.material.opacity = k;
      c.beacon.visible = true; c.beacon.material.color.setHex(hex); c.beacon.material.opacity = k; const s = 0.5 + 0.35 * blink * (al.unack ? 1 : 0.4); c.beacon.scale.set(s * 1.3, s * 1.3, 1);
    } else if (sel) { c.brackets.visible = true; c.brackets.material.color.setHex(0x3ad7ff); c.brackets.material.opacity = 1; c.beacon.visible = false; }
    else if (hov) { c.brackets.visible = true; c.brackets.material.color.setHex(0xbfeaff); c.brackets.material.opacity = 0.55; c.beacon.visible = false; }
    else { c.brackets.visible = false; c.beacon.visible = false; }
  });
  if (now - (G3.lastDisp || 0) > 500) { G3.lastDisp = now; drawSensorDisplay(); }
}

function resize() {
  if (!G3.renderer) return; const host = $('#app'), w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
  G3.size.w = w; G3.size.h = h; G3.renderer.setSize(w, h, false); G3.camera.aspect = w / h;
  // keep the plant framed on narrow screens
  G3.camera.fov = w / h < 0.9 ? 58 : (w / h < 1.3 ? 48 : 40); G3.camera.updateProjectionMatrix();
}
const CLAMP_MIN = V3(-8, -1, -9), CLAMP_MAX = V3(12, 7, 9);
function frame() {
  requestAnimationFrame(frame);
  if (!G3.ok || document.hidden) return;
  const dt = Math.min(G3.clock.getDelta(), 0.1), t = G3.clock.elapsedTime, now = performance.now();
  updateTween(dt); G3.controls.target.clamp(CLAMP_MIN, CLAMP_MAX); G3.controls.update();
  try { updateTwin(dt, t, now); } catch (e) { if (!G3.errShown) { G3.errShown = true; console.error('update error', e); } }
  G3.renderer.render(G3.scene, G3.camera);
  updateLabels(now);
}
