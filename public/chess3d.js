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

  // Base
  ctx.fillStyle = white ? "#f4f1ea" : "#18181c";
  ctx.fillRect(0, 0, size, size);
  bx.fillStyle = "#888";
  bx.fillRect(0, 0, size, size);

  // Mineral clouds — denser for richer stone
  for (let i = 0; i < 95; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (white) {
      const dark = Math.random() > 0.55;
      g.addColorStop(0, dark ? "rgba(195,190,182,0.35)" : "rgba(255,255,255,0.5)");
      g.addColorStop(0.55, "rgba(230,226,218,0.1)");
      g.addColorStop(1, "rgba(244,241,234,0)");
    } else {
      const light = Math.random() > 0.5;
      g.addColorStop(0, light ? "rgba(70,70,80,0.55)" : "rgba(8,8,10,0.45)");
      g.addColorStop(1, "rgba(18,18,22,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flowing veins — more visible on pieces
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
      ctx.strokeStyle = `rgba(110,108,115,${bold ? 0.55 : 0.26})`;
    } else {
      ctx.strokeStyle = `rgba(210,210,220,${bold ? 0.55 : 0.24})`;
    }
    ctx.lineWidth = bold ? 2.6 + Math.random() * 2.4 : 1.0 + Math.random() * 1.4;
    ctx.lineJoin = "round";
    ctx.stroke();
    // soft halo
    ctx.save();
    ctx.globalAlpha = 0.2;
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
      ? `rgba(100,98,105,${0.2 + Math.random() * 0.25})`
      : `rgba(200,200,210,${0.18 + Math.random() * 0.28})`;
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
    ctx.fillStyle = white ? "#b8b3aa" : "#050508";
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  ctx.globalAlpha = 1;

  // Gloss wash
  const shine = ctx.createLinearGradient(0, 0, size, size);
  shine.addColorStop(0, white ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.07)");
  shine.addColorStop(0.55, "rgba(255,255,255,0)");
  shine.addColorStop(1, white ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.03)");
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

function stoneMat(maps, { bump = 0.035, rough = 0.17, coat = 0.65, rep = 1.8 } = {}) {
  const map = maps.map.clone();
  const bumpMap = maps.bumpMap.clone();
  map.repeat.set(rep, rep);
  bumpMap.repeat.set(rep, rep);
  return new THREE.MeshPhysicalMaterial({
    map,
    bumpMap,
    bumpScale: bump,
    color: 0xffffff,
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
    lightSq: stoneMat(white, { bump: 0.018, rough: 0.16, coat: 0.7, rep: 2.2 }),
    darkSq: stoneMat(black, { bump: 0.02, rough: 0.18, coat: 0.6, rep: 2.2 }),
    frame: stoneMat(white, { bump: 0.028, rough: 0.15, coat: 0.75, rep: 3.0 }),
    // Stronger bump + slightly larger veins on pieces
    whitePiece: stoneMat(white, { bump: 0.09, rough: 0.18, coat: 0.75, rep: 1.15 }),
    blackPiece: stoneMat(black, { bump: 0.1, rough: 0.2, coat: 0.7, rep: 1.15 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.88, metalness: 0 }),
    edge: new THREE.MeshPhysicalMaterial({
      color: 0xe8e4dc,
      roughness: 0.25,
      metalness: 0.05,
      clearcoat: 0.4,
    }),
    highlight: new THREE.MeshBasicMaterial({
      color: 0xf0c94a,
      transparent: true,
      opacity: 0.3,
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

/** Classic Staunton proportions (relative height ~ pawn 1.0 … king 1.55). */
function buildPiece(type, color, mats) {
  const mat = color === "w" ? mats.whitePiece : mats.blackPiece;
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
  } else if (type === "n") {
    // Clean pedestal
    g.add(
      lathe(
        [
          [0.02, 0],
          [0.54, 0],
          [0.54, 0.1],
          [0.4, 0.16],
          [0.34, 0.38],
        ],
        mat,
        s
      )
    );
    // Horse head — smooth silhouette extrude
    const sh = new THREE.Shape();
    sh.moveTo(0.0, 0.0);
    sh.bezierCurveTo(-0.02, 0.15, 0.0, 0.35, 0.06, 0.5);
    sh.bezierCurveTo(0.05, 0.62, 0.02, 0.72, 0.1, 0.82);
    sh.bezierCurveTo(0.18, 0.92, 0.28, 0.96, 0.4, 0.92);
    sh.bezierCurveTo(0.5, 0.88, 0.58, 0.78, 0.62, 0.66);
    sh.bezierCurveTo(0.68, 0.58, 0.72, 0.48, 0.68, 0.42);
    sh.bezierCurveTo(0.6, 0.4, 0.5, 0.44, 0.42, 0.48);
    sh.bezierCurveTo(0.34, 0.5, 0.28, 0.42, 0.24, 0.3);
    sh.bezierCurveTo(0.2, 0.16, 0.12, 0.05, 0.0, 0.0);
    const head = new THREE.Mesh(
      new THREE.ExtrudeGeometry(sh, {
        depth: 0.32,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.035,
        bevelSegments: 4,
        curveSegments: 28,
      }),
      mat
    );
    head.geometry.translate(-0.1, 0, -0.16);
    head.scale.setScalar(s * 1.05);
    head.position.set(0, 0.22, 0);
    head.rotation.y = -Math.PI / 2;
    head.castShadow = true;
    head.receiveShadow = true;
    g.add(head);
    // Ear
    const earSh = new THREE.Shape();
    earSh.moveTo(0, 0);
    earSh.lineTo(0.04, 0.16);
    earSh.lineTo(0.1, 0.04);
    earSh.closePath();
    const ear = new THREE.Mesh(
      new THREE.ExtrudeGeometry(earSh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 }),
      mat
    );
    ear.geometry.translate(0, 0, -0.04);
    ear.scale.setScalar(s * 1.05);
    ear.position.set(0.02, 0.22 + 0.82 * s * 1.05, 0.04);
    ear.rotation.y = -Math.PI / 2;
    ear.castShadow = true;
    g.add(ear);
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
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55 })
    );
    slit.position.y = 0.58;
    g.add(slit);
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
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), mat);
    crossV.position.y = 0.82;
    crossV.castShadow = true;
    g.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.07), mat);
    crossH.position.y = 0.88;
    crossH.castShadow = true;
    g.add(crossH);
  }

  // 50% taller, same footprint
  g.scale.set(1, 1.5, 1);
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
  scene.background = new THREE.Color(0xe8e8ea);
  scene.fog = new THREE.Fog(0xe8e8ea, 28, 48);

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
  controls.rotateSpeed = 0.6;
  if (THREE.TOUCH) {
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  // Soft product-studio lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8dc, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
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
  const fill = new THREE.DirectionalLight(0xf0f2ff, 0.55);
  fill.position.set(-6, 7, -3);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xffffff, 0.32));

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
      root.add(ov);
      overlays.set(sq, ov);
    }
  }

  const piecesGroup = new THREE.Group();
  root.add(piecesGroup);
  const pieceMap = new Map();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let ptrDown = null;
  const TAP_PX = 18;
  const TAP_ANGLE = 0.035;

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
    if (color === "b") p.rotation.y = Math.PI;
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
    if (orientation === "b" && !controls.userData._oriented) {
      camera.position.set(0, 8.8, -10.8);
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
      if (sq === selected) {
        ov.material = mats.highlight;
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

  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    ptrDown = {
      x: e.clientX,
      y: e.clientY,
      az: controls.getAzimuthalAngle(),
      pol: controls.getPolarAngle(),
      id: e.pointerId,
    };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!ptrDown || (ptrDown.id != null && e.pointerId !== ptrDown.id)) {
      ptrDown = null;
      return;
    }
    const dist = Math.hypot(e.clientX - ptrDown.x, e.clientY - ptrDown.y);
    const dAz = Math.abs(controls.getAzimuthalAngle() - ptrDown.az);
    const dPol = Math.abs(controls.getPolarAngle() - ptrDown.pol);
    const wasTap = dist <= TAP_PX && dAz <= TAP_ANGLE && dPol <= TAP_ANGLE;
    const down = ptrDown;
    ptrDown = null;
    if (!wasTap) return;
    const sq = pickSquare(down.x, down.y) || pickSquare(e.clientX, e.clientY);
    if (sq && hooks.onSquareClick) hooks.onSquareClick(sq);
  });
  renderer.domElement.addEventListener("pointercancel", () => {
    ptrDown = null;
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

  async function playCaptureSequence(capSq, attackerFrom, attackerTo) {
    const victim = pieceMap.get(capSq);
    const dest = sqToWorld(capSq);
    const tntMat = new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.5 });
    const tnt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12), tntMat);
    tnt.rotation.z = Math.PI / 2;
    tnt.position.set(dest.x, 2.2, dest.z);
    root.add(tnt);
    await new Promise((resolve) => {
      const t0 = performance.now();
      (function frame(now) {
        const t = Math.min(1, (now - t0) / 520);
        const e = 1 - Math.pow(1 - t, 3);
        tnt.position.y = 2.2 + (0.55 - 2.2) * e + Math.abs(Math.sin(t * Math.PI * 2)) * 0.15 * (1 - t);
        tnt.rotation.y = t * 4;
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      })(performance.now());
    });
    if (victim) {
      const ox = victim.position.x;
      await new Promise((resolve) => {
        const t0 = performance.now();
        (function frame(now) {
          const t = Math.min(1, (now - t0) / 420);
          victim.position.x = ox + Math.sin(t * Math.PI * 10) * 0.06 * (1 - t);
          victim.rotation.z = Math.sin(t * Math.PI * 8) * 0.12 * (1 - t);
          if (t < 1) requestAnimationFrame(frame);
          else {
            victim.position.x = ox;
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
    const parts = [];
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.035 + Math.random() * 0.04, 6, 6),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0xffcc44 : 0xff5522,
          emissive: 0xff4400,
          emissiveIntensity: 0.5,
        })
      );
      p.position.set(dest.x, 0.5, dest.z);
      p.userData.v = new THREE.Vector3(
        (Math.random() - 0.5) * 0.16,
        0.08 + Math.random() * 0.12,
        (Math.random() - 0.5) * 0.16
      );
      root.add(p);
      parts.push(p);
    }
    await new Promise((resolve) => {
      const t0 = performance.now();
      (function frame(now) {
        const t = Math.min(1, (now - t0) / 500);
        for (const p of parts) {
          p.position.add(p.userData.v);
          p.userData.v.y -= 0.006;
          p.scale.multiplyScalar(0.97);
        }
        if (t < 1) requestAnimationFrame(frame);
        else {
          for (const p of parts) root.remove(p);
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

  return {
    syncFromGame,
    setHighlights,
    animatePieceMove,
    playCaptureSequence,
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
