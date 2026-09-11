/**
 * Realistic marble Staunton chess set — Three.js
 * Swipe L/R rotate, U/D tilt. Raycast square picking.
 * API: syncFromGame, setHighlights, animatePieceMove, playCaptureSequence, resize, dispose
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FILE = "abcdefgh";
const SQ = 1;
const BOARD = 8 * SQ;
const HALF = BOARD / 2;
const GAP = 0.02; // thin grout between squares

/** Elegant Carrara (white) or Nero (black) marble maps */
function makeMarble(kind) {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const bumpC = document.createElement("canvas");
  bumpC.width = bumpC.height = size;
  const bx = bumpC.getContext("2d");
  const white = kind === "white";

  // Warm ivory / espresso bases (not pure B&W)
  ctx.fillStyle = white ? "#f6ecd8" : "#1a1410";
  ctx.fillRect(0, 0, size, size);
  bx.fillStyle = "#888";
  bx.fillRect(0, 0, size, size);

  // Warm mineral clouds
  for (let i = 0; i < 95; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (white) {
      const dark = Math.random() > 0.55;
      g.addColorStop(0, dark ? "rgba(210,180,140,0.32)" : "rgba(255,248,230,0.55)");
      g.addColorStop(0.55, "rgba(235,210,170,0.1)");
      g.addColorStop(1, "rgba(246,236,216,0)");
    } else {
      const light = Math.random() > 0.5;
      g.addColorStop(0, light ? "rgba(90,70,55,0.5)" : "rgba(12,8,6,0.45)");
      g.addColorStop(1, "rgba(26,20,16,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Warm-toned veins (gold-grey on ivory, cream on espresso)
  const veinN = white ? 14 : 12;
  for (let v = 0; v < veinN; v++) {
    let x = Math.random() * size;
    let y = -30;
    ctx.beginPath();
    bx.beginPath();
    ctx.moveTo(x, y);
    bx.moveTo(x, y);
    for (let s = 0; s < 20; s++) {
      x += (Math.random() - 0.5) * 60;
      y += 18 + Math.random() * 48;
      const cpx = x + (Math.random() - 0.5) * 75;
      const cpy = y - 8;
      ctx.quadraticCurveTo(cpx, cpy, x, y);
      bx.quadraticCurveTo(cpx, cpy, x, y);
    }
    const bold = v < 5;
    if (white) {
      // taupe / soft gold-grey veins
      ctx.strokeStyle = `rgba(${130 + Math.random() * 30},${110 + Math.random() * 25},${85 + Math.random() * 20},${bold ? 0.5 : 0.24})`;
    } else {
      // warm cream / champagne veins
      ctx.strokeStyle = `rgba(${220 + Math.random() * 25},${200 + Math.random() * 25},${170 + Math.random() * 30},${bold ? 0.5 : 0.22})`;
    }
    ctx.lineWidth = bold ? 2.6 + Math.random() * 2.4 : 1.0 + Math.random() * 1.4;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.lineWidth += 3;
    ctx.stroke();
    ctx.restore();
    bx.strokeStyle = `rgba(0,0,0,${bold ? 0.55 : 0.28})`;
    bx.lineWidth = ctx.lineWidth + 1.5;
    bx.stroke();
  }

  // Short branch cracks
  for (let i = 0; i < 28; i++) {
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    const x1 = x0 + (Math.random() - 0.5) * 90;
    const y1 = y0 + (Math.random() - 0.5) * 90;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = white
      ? `rgba(140,115,85,${0.2 + Math.random() * 0.25})`
      : `rgba(230,210,175,${0.18 + Math.random() * 0.28})`;
    ctx.lineWidth = 0.8 + Math.random() * 1.6;
    ctx.stroke();
    bx.strokeStyle = "rgba(0,0,0,0.35)";
    bx.lineWidth = 2;
    bx.beginPath();
    bx.moveTo(x0, y0);
    bx.lineTo(x1, y1);
    bx.stroke();
  }

  // Micro polish grain
  for (let i = 0; i < 1100; i++) {
    ctx.globalAlpha = white ? 0.035 : 0.05;
    ctx.fillStyle = white ? "#c4a882" : "#0a0604";
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  ctx.globalAlpha = 1;

  // Warm gloss wash
  const shine = ctx.createLinearGradient(0, 0, size, size);
  shine.addColorStop(0, white ? "rgba(255,250,235,0.45)" : "rgba(255,230,200,0.08)");
  shine.addColorStop(0.55, "rgba(255,255,255,0)");
  shine.addColorStop(1, white ? "rgba(255,245,220,0.18)" : "rgba(255,220,180,0.04)");
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = 8;

  return { map, bumpMap };
}

function stoneMat(maps, { bump = 0.035, rough = 0.17, coat = 0.65, rep = 1.8, tint = 0xffffff } = {}) {
  const map = maps.map.clone();
  const bumpMap = maps.bumpMap.clone();
  map.repeat.set(rep, rep);
  bumpMap.repeat.set(rep, rep);
  return new THREE.MeshPhysicalMaterial({
    map,
    bumpMap,
    bumpScale: bump,
    color: tint,
    roughness: rough,
    metalness: 0.02,
    clearcoat: coat,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });
}

function makeMats() {
  const white = makeMarble("white");
  const black = makeMarble("black");
  return {
    // Warm cream / espresso board (not pure B&W)
    lightSq: stoneMat(white, { bump: 0.018, rough: 0.16, coat: 0.7, rep: 2.2, tint: 0xfff4e4 }),
    darkSq: stoneMat(black, { bump: 0.02, rough: 0.18, coat: 0.6, rep: 2.2, tint: 0xf0e6dc }),
    frame: stoneMat(white, { bump: 0.028, rough: 0.15, coat: 0.75, rep: 3.0, tint: 0xffefd5 }),
    whitePiece: stoneMat(white, { bump: 0.09, rough: 0.18, coat: 0.75, rep: 1.15, tint: 0xfff1dc }),
    blackPiece: stoneMat(black, { bump: 0.1, rough: 0.2, coat: 0.7, rep: 1.15, tint: 0xf5ebe0 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xf0e6d6, roughness: 0.88, metalness: 0 }),
    edge: new THREE.MeshPhysicalMaterial({
      color: 0xd4af37,
      roughness: 0.32,
      metalness: 0.65,
      clearcoat: 0.45,
    }),
    goldBand: new THREE.MeshPhysicalMaterial({
      color: 0xd4af37,
      roughness: 0.26,
      metalness: 0.9,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.35,
    }),
    highlight: new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
    highlightRing: new THREE.MeshBasicMaterial({
      color: 0xffcc22,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
    lastMove: new THREE.MeshBasicMaterial({
      color: 0xe0a830,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    legal: new THREE.MeshBasicMaterial({
      color: 0x1f6b45,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
    capture: new THREE.MeshBasicMaterial({
      color: 0xc62828,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  };
}

function lathe(points, mat, scale) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
  const geo = new THREE.LatheGeometry(pts, 64);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Gold collar rings — thick enough to read as luxury banding. */
function addGoldBands(g, goldMat, bands) {
  for (const [y, r, tube = 0.028] of bands) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 40), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.castShadow = true;
    g.add(ring);
  }
}

/**
 * Classic Staunton knight built from readable solids (not a soft blob extrude).
 * Group -Z is forward (toward the opponent for White).
 */
function buildKnight(mat, goldMat, s) {
  const g = new THREE.Group();
  const add = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  // Flared pedestal
  g.add(
    lathe(
      [
        [0.02, 0],
        [0.6, 0],
        [0.6, 0.1],
        [0.45, 0.16],
        [0.38, 0.3],
        [0.34, 0.48],
        [0.36, 0.58],
      ],
      mat,
      s
    )
  );
  addGoldBands(g, goldMat, [
    [0.12 * s, 0.48 * s, 0.028],
    [0.24 * s, 0.4 * s, 0.022],
  ]);

  const u = s;

  // Neck stump tilting slightly forward
  add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.16 * u, 0.2 * u, 0.28 * u, 16), mat),
    0,
    0.7 * u,
    0.02 * u,
    0.35,
    0,
    0
  );

  // Chest / breast
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.22 * u, 16, 12), mat);
  chest.scale.set(0.85, 0.95, 1.15);
  add(chest, 0, 0.72 * u, -0.06 * u);

  // Main skull elongated toward -Z (nose)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2 * u, 18, 14), mat);
  skull.scale.set(0.95, 1.05, 1.55);
  add(skull, 0, 0.98 * u, -0.12 * u);

  // Long tapered snout
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * u, 0.12 * u, 0.36 * u, 14), mat);
  add(snout, 0, 0.9 * u, -0.42 * u, Math.PI / 2, 0, 0);

  // Muzzle tip
  add(new THREE.Mesh(new THREE.SphereGeometry(0.075 * u, 12, 10), mat), 0, 0.88 * u, -0.6 * u);

  // Jaw undercut
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.11 * u, 12, 10), mat);
  jaw.scale.set(0.9, 0.7, 1.2);
  add(jaw, 0, 0.78 * u, -0.32 * u);

  // Mane crest (visible from White's camera behind the piece)
  const mane = new THREE.Mesh(new THREE.SphereGeometry(0.14 * u, 12, 10), mat);
  mane.scale.set(0.7, 1.35, 0.95);
  add(mane, 0, 1.22 * u, 0.04 * u);

  // Big pointed ears — primary "this is a knight" cue
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055 * u, 0.24 * u, 8), mat);
    add(ear, side * 0.1 * u, 1.36 * u, -0.02 * u, -0.35, 0, side * 0.25);
  }

  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.45 });
  for (const side of [-1, 1]) {
    add(
      new THREE.Mesh(new THREE.SphereGeometry(0.028 * u, 8, 8), eyeMat),
      side * 0.12 * u,
      1.02 * u,
      -0.28 * u
    );
  }

  // Gold bridle + nose band
  add(new THREE.Mesh(new THREE.TorusGeometry(0.11 * u, 0.018, 8, 24), goldMat), 0, 0.9 * u, -0.38 * u);
  add(
    new THREE.Mesh(new THREE.TorusGeometry(0.08 * u, 0.014, 8, 20), goldMat),
    0,
    0.88 * u,
    -0.52 * u,
    Math.PI / 2,
    0,
    0
  );

  return g;
}

/** Classic Staunton proportions (relative height ~ pawn 1.0 … king 1.55). */
function buildPiece(type, color, mats) {
  const mat = color === "w" ? mats.whitePiece : mats.blackPiece;
  const gold = mats.goldBand;
  const g = new THREE.Group();
  g.userData = { type, color };
  const s = 0.52; // footprint vs square size 1.0

  if (type === "p") {
    g.add(
      lathe(
        [
          [0.02, 0],
          [0.52, 0],
          [0.52, 0.1],
          [0.38, 0.16],
          [0.3, 0.45],
          [0.24, 0.75],
          [0.36, 0.9],
          [0.36, 1.05],
          [0.02, 1.05],
        ],
        mat,
        s
      )
    );
    addGoldBands(g, gold, [
      [0.14 * s, 0.42 * s, 0.03],
      [0.78 * s, 0.3 * s, 0.022],
    ]);
  } else if (type === "r") {
    g.add(
      lathe(
        [
          [0.02, 0],
          [0.55, 0],
          [0.55, 0.1],
          [0.4, 0.18],
          [0.36, 0.85],
          [0.48, 0.9],
          [0.48, 1.12],
          [0.02, 1.12],
        ],
        mat,
        s
      )
    );
    for (let i = 0; i < 4; i++) {
      const batt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), mat);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      batt.position.set(Math.cos(a) * 0.2, 0.68, Math.sin(a) * 0.2);
      batt.castShadow = true;
      g.add(batt);
    }
    addGoldBands(g, gold, [
      [0.14 * s, 0.44 * s, 0.03],
      [0.88 * s, 0.42 * s, 0.024],
    ]);
  } else if (type === "n") {
    const knight = buildKnight(mat, gold, s);
    while (knight.children.length) g.add(knight.children[0]);
    g.userData.noTallStretch = true; // horse silhouette stays correct
  } else if (type === "b") {
    g.add(
      lathe(
        [
          [0.02, 0],
          [0.52, 0],
          [0.52, 0.1],
          [0.36, 0.18],
          [0.26, 0.7],
          [0.32, 0.9],
          [0.18, 1.15],
          [0.02, 1.18],
        ],
        mat,
        s
      )
    );
    const slit = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.14, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.55 })
    );
    slit.position.y = 0.58;
    g.add(slit);
    addGoldBands(g, gold, [
      [0.14 * s, 0.42 * s, 0.03],
      [0.82 * s, 0.28 * s, 0.022],
    ]);
  } else if (type === "q") {
    g.add(
      lathe(
        [
          [0.02, 0],
          [0.58, 0],
          [0.58, 0.1],
          [0.4, 0.2],
          [0.3, 0.85],
          [0.4, 1.0],
          [0.26, 1.22],
          [0.02, 1.25],
        ],
        mat,
        s
      )
    );
    for (let i = 0; i < 8; i++) {
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), mat);
      const a = (i / 8) * Math.PI * 2;
      pearl.position.set(Math.cos(a) * 0.16, 0.72, Math.sin(a) * 0.16);
      pearl.castShadow = true;
      g.add(pearl);
    }
    // Gold tips on coronet
    for (let i = 0; i < 8; i++) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), gold);
      const a = (i / 8) * Math.PI * 2;
      tip.position.set(Math.cos(a) * 0.16, 0.78, Math.sin(a) * 0.16);
      g.add(tip);
    }
    addGoldBands(g, gold, [
      [0.14 * s, 0.46 * s, 0.032],
      [0.92 * s, 0.34 * s, 0.024],
    ]);
  } else if (type === "k") {
    g.add(
      lathe(
        [
          [0.02, 0],
          [0.58, 0],
          [0.58, 0.1],
          [0.4, 0.2],
          [0.3, 0.9],
          [0.4, 1.05],
          [0.24, 1.28],
          [0.02, 1.3],
        ],
        mat,
        s
      )
    );
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), gold);
    crossV.position.y = 0.82;
    crossV.castShadow = true;
    g.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.07), gold);
    crossH.position.y = 0.88;
    crossH.castShadow = true;
    g.add(crossH);
    addGoldBands(g, gold, [
      [0.14 * s, 0.46 * s, 0.032],
      [0.98 * s, 0.34 * s, 0.024],
    ]);
  }

  // 50% taller for lathed pieces; knights keep horse proportions
  if (g.userData.noTallStretch) g.scale.set(1.08, 1.22, 1.08);
  else g.scale.set(1, 1.5, 1);
  const box = new THREE.Box3().setFromObject(g);
  g.position.y = -box.min.y;
  return g;
}

function sqToWorld(sq) {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  return {
    x: file * SQ + SQ / 2 - HALF,
    z: -(rank * SQ + SQ / 2 - HALF),
  };
}

export function createChess3D(container, hooks = {}) {
  const mats = makeMats();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Warm cream studio (less stark grey)
  scene.background = new THREE.Color(0xf3ead8);
  scene.fog = new THREE.Fog(0xf3ead8, 28, 48);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  camera.position.set(0, 8.8, 10.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 7.5;
  controls.maxDistance = 16;
  controls.minPolarAngle = 0.4;
  controls.maxPolarAngle = 1.2;
  controls.target.set(0, 0.15, 0);
  controls.rotateSpeed = 0.7;
  // OrbitControls is not an Object3D — give it a userData bag for our flags
  if (!controls.userData) controls.userData = {};
  let blackOriented = false;
  // Drag = orbit. Short tap = select (see pointer handlers below).
  if (THREE.MOUSE) {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }
  if (THREE.TOUCH) {
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }

  // Warm product-studio lighting
  scene.add(new THREE.HemisphereLight(0xfff5e8, 0xd4c4a8, 0.95));
  const key = new THREE.DirectionalLight(0xfff2dd, 1.75);
  key.position.set(5, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 35;
  key.shadow.camera.left = key.shadow.camera.bottom = -10;
  key.shadow.camera.right = key.shadow.camera.top = 10;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe8cc, 0.55);
  fill.position.set(-6, 7, -3);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xfff0e0, 0.34));
  const warmRim = new THREE.PointLight(0xffd27a, 0.4, 22);
  warmRim.position.set(0, 4.5, -5);
  scene.add(warmRim);

  const root = new THREE.Group();
  scene.add(root);

  // Soft floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 64), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.42;
  floor.receiveShadow = true;
  root.add(floor);

  // White marble plinth + rim (like real set)
  const plinthH = 0.36;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD + 1.5, plinthH, BOARD + 1.5),
    mats.frame
  );
  plinth.position.y = -plinthH / 2 + 0.02;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD + 0.72, 0.16, BOARD + 0.72),
    mats.frame
  );
  rim.position.y = 0.12;
  rim.castShadow = true;
  rim.receiveShadow = true;
  root.add(rim);

  // Playing surface bed (slightly recessed)
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD + 0.04, 0.06, BOARD + 0.04),
    mats.edge
  );
  bed.position.y = 0.18;
  bed.receiveShadow = true;
  root.add(bed);

  const squares = new THREE.Group();
  root.add(squares);
  const pickables = [];
  const overlays = new Map();
  const selectFrames = new Map();
  const sqSize = SQ - GAP;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const light = (file + rank) % 2 === 1;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sqSize, 0.08, sqSize),
        light ? mats.lightSq : mats.darkSq
      );
      const x = file * SQ + SQ / 2 - HALF;
      const z = -(rank * SQ + SQ / 2 - HALF);
      mesh.position.set(x, 0.24, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      const sq = FILE[file] + (rank + 1);
      mesh.userData.square = sq;
      squares.add(mesh);
      pickables.push(mesh);

      const ov = new THREE.Mesh(new THREE.PlaneGeometry(sqSize * 0.92, sqSize * 0.92), mats.highlight.clone());
      ov.rotation.x = -Math.PI / 2;
      ov.position.set(x, 0.29, z);
      ov.visible = false;
      ov.raycast = () => {}; // never steal piece/square picks
      root.add(ov);
      overlays.set(sq, ov);

      // Thick gold frame for selected square (much more visible than a wash alone)
      const frame = new THREE.Group();
      frame.visible = false;
      const fw = sqSize * 0.96;
      const ft = 0.07;
      const fh = 0.05;
      const mkBar = (w, d) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, fh, d), mats.highlightRing);
        bar.position.y = 0.32;
        bar.raycast = () => {};
        frame.add(bar);
        return bar;
      };
      mkBar(fw, ft).position.set(x, 0.32, z - fw / 2 + ft / 2);
      mkBar(fw, ft).position.set(x, 0.32, z + fw / 2 - ft / 2);
      mkBar(ft, fw).position.set(x - fw / 2 + ft / 2, 0.32, z);
      mkBar(ft, fw).position.set(x + fw / 2 - ft / 2, 0.32, z);
      // Soft glow disc under the piece
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(sqSize * 0.42, 24),
        new THREE.MeshBasicMaterial({
          color: 0xfff0a0,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, 0.33, z);
      glow.raycast = () => {};
      frame.add(glow);
      root.add(frame);
      selectFrames.set(sq, frame);
    }
  }

  const piecesGroup = new THREE.Group();
  root.add(piecesGroup);
  const pieceMap = new Map();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let ptrDown = null;
  let lastTapAt = 0;
  let suppressClick = false;
  // Short press = select/move. Longer finger travel = board orbit (OrbitControls).
  const TAP_PX = 36;

  function emitSquareTap(clientX, clientY) {
    const now = performance.now();
    if (now - lastTapAt < 280) return; // debounce pointerup + click + touchend
    const sq = pickSquare(clientX, clientY);
    if (!sq || !hooks.onSquareClick) return;
    lastTapAt = now;
    hooks.onSquareClick(sq);
  }

  function clearPieces() {
    while (piecesGroup.children.length) {
      const c = piecesGroup.children.pop();
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    pieceMap.clear();
  }

  function placePiece(sq, type, color) {
    const p = buildPiece(type, color, mats);
    const w = sqToWorld(sq);
    p.position.x = w.x;
    p.position.z = w.z;
    p.position.y += 0.28;
    // Face opponent; knights yaw slightly toward board centre for a readable 3/4 horse
    let yaw = color === "b" ? Math.PI : 0;
    if (type === "n") {
      const file = sq.charCodeAt(0) - 97; // 0=a … 7=h
      const towardCentre = file < 4 ? 1 : -1; // queenside / kingside
      yaw += towardCentre * 0.55 * (color === "w" ? 1 : -1);
    }
    p.rotation.y = yaw;
    p.userData.square = sq;
    piecesGroup.add(p);
    pieceMap.set(sq, p);
    return p;
  }

  function syncFromGame(chess, orientation = "w") {
    clearPieces();
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        placePiece(FILE[c] + (8 - r), cell.type, cell.color);
      }
    }
    if (orientation === "b" && !blackOriented) {
      camera.position.set(0, 8.8, -10.8);
      controls.target.set(0, 0.15, 0);
      controls.update();
      blackOriented = true;
      controls.userData._oriented = true;
    }
  }

  function setHighlights({ selected, legal = [], lastFrom, lastTo } = {}) {
    const legalSet = new Set(legal.map((m) => (typeof m === "string" ? m : m.to)));
    const captureSet = new Set(
      legal
        .filter((m) => m && (m.captured || (m.flags && String(m.flags).includes("c"))))
        .map((m) => m.to)
    );
    for (const [sq, ov] of overlays) {
      ov.visible = false;
      ov.scale.set(1, 1, 1);
      if (sq === selected) {
        ov.material = mats.highlight;
        ov.scale.set(1.05, 1.05, 1.05);
        ov.visible = true;
      } else if (sq === lastFrom || sq === lastTo) {
        ov.material = mats.lastMove;
        ov.visible = true;
      } else if (captureSet.has(sq)) {
        ov.material = mats.capture;
        ov.visible = true;
      } else if (legalSet.has(sq)) {
        ov.material = mats.legal;
        ov.visible = true;
      }
    }
    for (const [sq, frame] of selectFrames) {
      frame.visible = sq === selected;
    }
    // Lift selected piece slightly (no shared-material emissive — that mutated every piece)
    for (const [sq, mesh] of pieceMap) {
      if (mesh.userData.baseY == null) mesh.userData.baseY = mesh.position.y;
      mesh.position.y = mesh.userData.baseY + (sq === selected ? 0.14 : 0);
    }
  }

  function resize() {
    const w = container.clientWidth || 320;
    const h = container.clientHeight || w;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  function pickSquare(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const pieceHits = raycaster.intersectObjects(piecesGroup.children, true);
    if (pieceHits.length) {
      let o = pieceHits[0].object;
      while (o && !o.userData.square) o = o.parent;
      if (o?.userData.square) return o.userData.square;
    }
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.square : null;
  }

  // Orbit always on for drag. Tap detection uses travel distance only (not camera angle).
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    ptrDown = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      type: e.pointerType || "mouse",
    };
  });
  function finishPointer(e) {
    if (!ptrDown || (ptrDown.id != null && e.pointerId !== ptrDown.id)) {
      ptrDown = null;
      return;
    }
    const dist = Math.hypot(e.clientX - ptrDown.x, e.clientY - ptrDown.y);
    const down = ptrDown;
    ptrDown = null;
    if (dist > TAP_PX) {
      suppressClick = true; // was a drag-orbit — ignore trailing click
      return;
    }
    emitSquareTap(down.x, down.y);
  }
  // WhatsApp / iOS often fires pointercancel instead of pointerup
  renderer.domElement.addEventListener("pointerup", finishPointer);
  renderer.domElement.addEventListener("pointercancel", finishPointer);
  renderer.domElement.addEventListener("click", (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    emitSquareTap(e.clientX, e.clientY);
  });

  function animatePieceMove(from, to, { duration = 480 } = {}) {
    return new Promise((resolve) => {
      const mesh = pieceMap.get(from);
      if (!mesh) {
        resolve();
        return;
      }
      const start = mesh.position.clone();
      const dest = sqToWorld(to);
      const end = new THREE.Vector3(dest.x, start.y, dest.z);
      const lift = 0.4;
      const t0 = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - t0) / duration);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        mesh.position.x = start.x + (end.x - start.x) * e;
        mesh.position.z = start.z + (end.z - start.z) * e;
        mesh.position.y = start.y + Math.sin(Math.PI * e) * lift;
        if (t < 1) requestAnimationFrame(frame);
        else {
          mesh.position.copy(end);
          pieceMap.delete(from);
          pieceMap.set(to, mesh);
          mesh.userData.square = to;
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function makeTntLabel() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f5e6c8";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#1a0800";
    ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TNT", 128, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeTntStick() {
    const stick = new THREE.Group();
    // Oversized so it reads clearly on the marble board
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.95, 20),
      new THREE.MeshStandardMaterial({
        color: 0xc62828,
        roughness: 0.4,
        metalness: 0.15,
        emissive: 0x4a0000,
        emissiveIntensity: 0.25,
      })
    );
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    stick.add(body);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.235, 0.235, 0.34, 20),
      new THREE.MeshStandardMaterial({
        map: makeTntLabel(),
        color: 0xffffff,
        roughness: 0.65,
      })
    );
    band.rotation.z = Math.PI / 2;
    stick.add(band);

    const fuse = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.8 })
    );
    fuse.position.set(0.55, 0.12, 0);
    fuse.rotation.z = -0.55;
    stick.add(fuse);

    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffe566,
        emissive: 0xff8800,
        emissiveIntensity: 3.2,
      })
    );
    spark.position.set(0.68, 0.26, 0);
    spark.name = "spark";
    stick.add(spark);

    // Soft glow halo so the stick pops against marble
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff6622,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    glow.name = "glow";
    stick.add(glow);

    stick.scale.setScalar(1.35);
    return stick;
  }

  async function playCaptureSequence(capSq, attackerFrom, attackerTo) {
    const victim = pieceMap.get(capSq);
    const dest = sqToWorld(capSq);
    const landY = victim ? victim.position.y + 0.55 : 1.1;
    const startY = 5.2;

    // TNT drops from above and bounces onto the captured square
    const tnt = makeTntStick();
    tnt.position.set(dest.x, startY, dest.z);
    tnt.rotation.set(0.25, -0.5, 0.15);
    root.add(tnt);

    await new Promise((resolve) => {
      const t0 = performance.now();
      (function frame(now) {
        const t = Math.min(1, (now - t0) / 780);
        // Ease down, then two visible bounces
        const fall = 1 - Math.pow(1 - Math.min(t / 0.55, 1), 2.4);
        let y = startY + (landY - startY) * fall;
        if (t > 0.55) {
          const u = (t - 0.55) / 0.45;
          const bounce = Math.abs(Math.sin(u * Math.PI * 2.15)) * 0.85 * (1 - u);
          y = landY + bounce;
        }
        tnt.position.y = y;
        tnt.rotation.y = -0.5 + t * 4.2;
        tnt.rotation.z = 0.15 + Math.sin(t * Math.PI * 3.2) * 0.45 * (1 - t);
        tnt.rotation.x = 0.25 * (1 - t);
        const spark = tnt.getObjectByName("spark");
        if (spark) spark.scale.setScalar(0.85 + Math.sin(now * 0.05) * 0.45);
        const glow = tnt.getObjectByName("glow");
        if (glow) glow.material.opacity = 0.15 + Math.sin(now * 0.03) * 0.1;
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      })(performance.now());
    });

    // Fuse fizz — stick sits on the square so you can see it
    await new Promise((r) => setTimeout(r, 380));

    // Victim shakes while TNT sits there
    if (victim) {
      const ox = victim.position.x;
      const oz = victim.position.z;
      await new Promise((resolve) => {
        const t0 = performance.now();
        (function frame(now) {
          const t = Math.min(1, (now - t0) / 520);
          victim.position.x = ox + Math.sin(t * Math.PI * 14) * 0.1 * (1 - t);
          victim.position.z = oz + Math.cos(t * Math.PI * 12) * 0.07 * (1 - t);
          victim.rotation.z = Math.sin(t * Math.PI * 12) * 0.22 * (1 - t);
          const spark = tnt.getObjectByName("spark");
          if (spark) spark.scale.setScalar(1 + Math.sin(now * 0.06) * 0.6);
          if (t < 1) requestAnimationFrame(frame);
          else {
            victim.position.x = ox;
            victim.position.z = oz;
            victim.rotation.z = 0;
            resolve();
          }
        })(performance.now());
      });
    }

    root.remove(tnt);
    if (victim) {
      piecesGroup.remove(victim);
      pieceMap.delete(capSq);
    }

    // Bigger explosion burst
    const parts = [];
    for (let i = 0; i < 32; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.09, 6, 6),
        new THREE.MeshStandardMaterial({
          color: i % 3 === 0 ? 0xffe066 : i % 3 === 1 ? 0xff5522 : 0xffaa33,
          emissive: 0xff4400,
          emissiveIntensity: 1.1,
        })
      );
      p.position.set(dest.x, landY, dest.z);
      p.userData.v = new THREE.Vector3(
        (Math.random() - 0.5) * 0.32,
        0.12 + Math.random() * 0.22,
        (Math.random() - 0.5) * 0.32
      );
      root.add(p);
      parts.push(p);
    }
    const flash = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(dest.x, landY + 0.05, dest.z);
    root.add(flash);

    await new Promise((resolve) => {
      const t0 = performance.now();
      (function frame(now) {
        const t = Math.min(1, (now - t0) / 600);
        for (const p of parts) {
          p.position.add(p.userData.v);
          p.userData.v.y -= 0.008;
          p.scale.multiplyScalar(0.955);
        }
        flash.scale.setScalar(1 + t * 2.4);
        flash.material.opacity = 0.95 * (1 - t);
        if (t < 1) requestAnimationFrame(frame);
        else {
          for (const p of parts) root.remove(p);
          root.remove(flash);
          resolve();
        }
      })(performance.now());
    });

    await animatePieceMove(attackerFrom, attackerTo, { duration: 450 });
  }

  let raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();
  requestAnimationFrame(() => {
    resize();
    requestAnimationFrame(resize);
  });
  loop();
  controls.update();

  function rotateBy(deltaAz = 0.45) {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += deltaAz;
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function resetView(orientation = "w") {
    if (orientation === "b") camera.position.set(0, 8.8, -10.8);
    else camera.position.set(0, 8.8, 10.8);
    controls.target.set(0, 0.15, 0);
    controls.update();
  }

  return {
    syncFromGame,
    setHighlights,
    animatePieceMove,
    playCaptureSequence,
    rotateBy,
    resetView,
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    get dom() {
      return renderer.domElement;
    },
  };
}
