/**
 * Luxury handmade 3D chess board — Three.js
 * Swipe L/R to rotate, U/D to tilt. Square picking via raycast.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FILE = "abcdefgh";
const SQ = 1;
const BOARD = 8 * SQ;
const HALF = BOARD / 2;

function woodTexture(base, grain, opts = {}) {
  const size = opts.size || 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i++) {
    const n = Math.sin(i * 0.09) * 8 + Math.sin(i * 0.31) * 3;
    ctx.strokeStyle = grain;
    ctx.globalAlpha = 0.045 + (i % 7) * 0.004;
    ctx.beginPath();
    ctx.moveTo(0, i + n);
    ctx.bezierCurveTo(size * 0.3, i + n * 0.4, size * 0.7, i - n * 0.5, size, i + n * 0.2);
    ctx.stroke();
  }
  for (let i = 0; i < 400; i++) {
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = opts.speck || "#000";
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMats() {
  const maple = woodTexture("#e8d5b5", "#c4a882", { speck: "#8a7050" });
  const walnut = woodTexture("#6b4428", "#3d2415", { speck: "#1a0e08" });
  const rosewood = woodTexture("#4a2c22", "#2a1510", { speck: "#100808" });
  rosewood.repeat.set(2, 2);

  return {
    lightSq: new THREE.MeshStandardMaterial({
      map: maple,
      roughness: 0.42,
      metalness: 0.08,
      envMapIntensity: 0.85,
    }),
    darkSq: new THREE.MeshStandardMaterial({
      map: walnut,
      roughness: 0.48,
      metalness: 0.06,
      envMapIntensity: 0.7,
    }),
    frame: new THREE.MeshStandardMaterial({
      map: rosewood,
      roughness: 0.38,
      metalness: 0.12,
      envMapIntensity: 0.9,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      roughness: 0.28,
      metalness: 0.85,
      envMapIntensity: 1.2,
    }),
    felt: new THREE.MeshStandardMaterial({
      color: 0x1a3d2b,
      roughness: 0.95,
      metalness: 0,
    }),
    whitePiece: new THREE.MeshStandardMaterial({
      color: 0xf3e6d0,
      roughness: 0.32,
      metalness: 0.12,
      envMapIntensity: 1.0,
    }),
    blackPiece: new THREE.MeshStandardMaterial({
      color: 0x1c1412,
      roughness: 0.36,
      metalness: 0.15,
      envMapIntensity: 0.85,
    }),
    highlight: new THREE.MeshBasicMaterial({
      color: 0xf6c945,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
    lastMove: new THREE.MeshBasicMaterial({
      color: 0xe8b03c,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    legal: new THREE.MeshBasicMaterial({
      color: 0x1a3d2b,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    capture: new THREE.MeshBasicMaterial({
      color: 0xc62828,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  };
}

function lathe(points, mat, scale = 1) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Classic handmade Staunton-inspired silhouettes (sized to fill ~70–85% of a square). */
function buildPiece(type, color, mats) {
  const mat = color === "w" ? mats.whitePiece : mats.blackPiece;
  const g = new THREE.Group();
  g.userData = { type, color };

  // Square is 1.0 wide — s≈0.58 gives a solid luxury set footprint
  const s = 0.58;
  if (type === "p") {
    g.add(lathe([[0.01, 0], [0.55, 0], [0.55, 0.12], [0.35, 0.2], [0.28, 0.55], [0.22, 0.9], [0.38, 1.05], [0.38, 1.2], [0.01, 1.2]], mat, s));
  } else if (type === "r") {
    g.add(lathe([[0.01, 0], [0.6, 0], [0.6, 0.14], [0.4, 0.22], [0.38, 0.95], [0.5, 1.0], [0.5, 1.25], [0.01, 1.25]], mat, s));
    for (let i = 0; i < 4; i++) {
      const batt = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), mat);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      batt.position.set(Math.cos(a) * 0.24, 0.78, Math.sin(a) * 0.24);
      batt.castShadow = true;
      g.add(batt);
    }
  } else if (type === "n") {
    g.add(lathe([[0.01, 0], [0.58, 0], [0.58, 0.12], [0.36, 0.2], [0.32, 0.55]], mat, s));
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.36), mat);
    neck.position.set(0.05, 0.52, 0);
    neck.rotation.z = -0.35;
    neck.castShadow = true;
    g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.26), mat);
    head.position.set(0.16, 0.78, 0);
    head.rotation.z = -0.5;
    head.castShadow = true;
    g.add(head);
  } else if (type === "b") {
    g.add(lathe([[0.01, 0], [0.55, 0], [0.55, 0.12], [0.32, 0.22], [0.26, 0.85], [0.34, 1.05], [0.2, 1.25], [0.01, 1.28]], mat, s));
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    slit.position.y = 0.72;
    g.add(slit);
  } else if (type === "q") {
    g.add(lathe([[0.01, 0], [0.62, 0], [0.62, 0.14], [0.38, 0.24], [0.3, 1.0], [0.42, 1.15], [0.28, 1.35], [0.01, 1.38]], mat, s));
    for (let i = 0; i < 6; i++) {
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), mat);
      const a = (i / 6) * Math.PI * 2;
      pearl.position.set(Math.cos(a) * 0.21, 0.84, Math.sin(a) * 0.21);
      pearl.castShadow = true;
      g.add(pearl);
    }
  } else if (type === "k") {
    g.add(lathe([[0.01, 0], [0.62, 0], [0.62, 0.14], [0.38, 0.24], [0.3, 1.05], [0.4, 1.2], [0.26, 1.4], [0.01, 1.42]], mat, s));
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.09), mat);
    crossV.position.y = 0.98;
    crossV.castShadow = true;
    g.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.09), mat);
    crossH.position.y = 1.04;
    crossH.castShadow = true;
    g.add(crossH);
  }

  // Sit on square
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

function worldToSq(x, z) {
  const file = Math.floor(x + HALF);
  const rank = Math.floor(-z + HALF);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return FILE[file] + (rank + 1);
}

export function createChess3D(container, hooks = {}) {
  const mats = makeMats();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a221c);
  scene.fog = new THREE.Fog(0x2a221c, 16, 32);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  camera.position.set(0, 9.5, 11.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 18;
  controls.minPolarAngle = 0.35; // tilt limit
  controls.maxPolarAngle = 1.25;
  controls.target.set(0, 0.2, 0);
  controls.rotateSpeed = 0.65;
  // One-finger rotate (azimuth + polar) = swipe L/R and U/D
  if (THREE.TOUCH) {
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xfff2e0, 0x2a2018, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dd, 1.35);
  key.position.set(5, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = key.shadow.camera.bottom = -10;
  key.shadow.camera.right = key.shadow.camera.top = 10;
  key.shadow.bias = -0.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fill.position.set(-6, 6, -4);
  scene.add(fill);
  const rim = new THREE.PointLight(0xffd27a, 0.45, 20);
  rim.position.set(0, 4, -6);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);

  // Felt table
  const table = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 0.15, 64), mats.felt);
  table.position.y = -0.55;
  table.receiveShadow = true;
  root.add(table);

  // Thick rosewood plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 1.35, 0.55, BOARD + 1.35), mats.frame);
  plinth.position.y = -0.2;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);

  // Gold inlay ring
  const inlay = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD + 0.95, 0.03, BOARD + 0.95),
    mats.gold
  );
  inlay.position.y = 0.08;
  root.add(inlay);

  // Inner frame
  const inner = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.55, 0.22, BOARD + 0.55), mats.frame);
  inner.position.y = 0.12;
  inner.receiveShadow = true;
  root.add(inner);

  // Squares + pick meshes
  const squares = new THREE.Group();
  root.add(squares);
  const pickables = [];
  const overlays = new Map();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const light = (file + rank) % 2 === 1;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(SQ * 0.98, 0.12, SQ * 0.98),
        light ? mats.lightSq : mats.darkSq
      );
      const x = file * SQ + SQ / 2 - HALF;
      const z = -(rank * SQ + SQ / 2 - HALF);
      mesh.position.set(x, 0.2, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      const sq = FILE[file] + (rank + 1);
      mesh.userData.square = sq;
      squares.add(mesh);
      pickables.push(mesh);

      const ov = new THREE.Mesh(
        new THREE.PlaneGeometry(SQ * 0.92, SQ * 0.92),
        mats.highlight.clone()
      );
      ov.rotation.x = -Math.PI / 2;
      ov.position.set(x, 0.28, z);
      ov.visible = false;
      ov.userData.square = sq;
      root.add(ov);
      overlays.set(sq, ov);
    }
  }

  // Soft bevel gloss on board surface edge
  const gloss = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD + 0.02, 0.02, BOARD + 0.02),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.06,
      roughness: 0.1,
      metalness: 0.3,
    })
  );
  gloss.position.y = 0.27;
  root.add(gloss);

  const piecesGroup = new THREE.Group();
  root.add(piecesGroup);
  const pieceMap = new Map(); // sq -> mesh

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let dragging = false;
  let dragMoved = false;

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
    p.position.y += 0.26;
    // Face white toward -z (rank 1 side) by default; knights face forward
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
        const file = FILE[c];
        const rank = 8 - r;
        placePiece(file + rank, cell.type, cell.color);
      }
    }
    // Orient camera side for player
    if (orientation === "b") {
      controls.target.set(0, 0.2, 0);
      if (!controls.userData._oriented) {
        camera.position.set(0, 9.5, -11.5);
        controls.userData._oriented = true;
      }
    }
  }

  function setHighlights({ selected, legal = [], lastFrom, lastTo } = {}) {
    const legalSet = new Set(legal.map((m) => (typeof m === "string" ? m : m.to)));
    const captureSet = new Set(
      legal.filter((m) => m.captured || (m.flags && String(m.flags).includes("c"))).map((m) => m.to)
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function pickSquare(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length) return hits[0].object.userData.square;
    // Also allow clicking pieces
    const pieceHits = raycaster.intersectObjects(piecesGroup.children, true);
    if (pieceHits.length) {
      let o = pieceHits[0].object;
      while (o && !o.userData.square) o = o.parent;
      if (o && o.userData.square) return o.userData.square;
    }
    return null;
  }

  renderer.domElement.addEventListener("pointerdown", () => {
    dragging = true;
    dragMoved = false;
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (dragging && (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3)) dragMoved = true;
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (dragging && !dragMoved) {
      const sq = pickSquare(e.clientX, e.clientY);
      if (sq && hooks.onSquareClick) hooks.onSquareClick(sq);
    }
    dragging = false;
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
      const lift = 0.45;
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
    // TNT stick
    const tntMat = new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.5, metalness: 0.1 });
    const tnt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12), tntMat);
    tnt.rotation.z = Math.PI / 2;
    tnt.position.set(dest.x, 2.2, dest.z);
    root.add(tnt);
    await new Promise((resolve) => {
      const t0 = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - t0) / 520);
        const e = 1 - Math.pow(1 - t, 3);
        tnt.position.y = 2.2 + (0.55 - 2.2) * e + Math.abs(Math.sin(t * Math.PI * 2)) * 0.15 * (1 - t);
        tnt.rotation.y = t * 4;
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    // Shake victim
    if (victim) {
      const ox = victim.position.x;
      await new Promise((resolve) => {
        const t0 = performance.now();
        function frame(now) {
          const t = Math.min(1, (now - t0) / 420);
          victim.position.x = ox + Math.sin(t * Math.PI * 10) * 0.06 * (1 - t);
          victim.rotation.z = Math.sin(t * Math.PI * 8) * 0.12 * (1 - t);
          if (t < 1) requestAnimationFrame(frame);
          else {
            victim.position.x = ox;
            victim.rotation.z = 0;
            resolve();
          }
        }
        requestAnimationFrame(frame);
      });
    }
    // Boom particles
    root.remove(tnt);
    if (victim) {
      piecesGroup.remove(victim);
      pieceMap.delete(capSq);
    }
    const parts = [];
    for (let i = 0; i < 18; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.05, 6, 6),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0xffcc44 : 0xff5522,
          emissive: 0xff4400,
          emissiveIntensity: 0.6,
          roughness: 0.4,
        })
      );
      p.position.set(dest.x, 0.5, dest.z);
      p.userData.v = new THREE.Vector3(
        (Math.random() - 0.5) * 0.18,
        0.08 + Math.random() * 0.14,
        (Math.random() - 0.5) * 0.18
      );
      root.add(p);
      parts.push(p);
    }
    await new Promise((resolve) => {
      const t0 = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - t0) / 550);
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
      }
      requestAnimationFrame(frame);
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
  // Second layout pass — mobile browsers often report 0×0 on first paint
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
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
    get dom() {
      return renderer.domElement;
    },
  };
}
