import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";
import { createChess3D } from "./chess3d.js";

const PIECE_SRC = {
  wK: "pieces-carved/wK.png", wQ: "pieces-carved/wQ.png", wR: "pieces-carved/wR.png",
  wB: "pieces-carved/wB.png", wN: "pieces-carved/wN.png", wP: "pieces-carved/wP.png",
  bK: "pieces-carved/bK.png", bQ: "pieces-carved/bQ.png", bR: "pieces-carved/bR.png",
  bB: "pieces-carved/bB.png", bN: "pieces-carved/bN.png", bP: "pieces-carved/bP.png",
};
const PIECE_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

function pieceImg(code, className) {
  const img = document.createElement("img");
  img.className = className || "piece";
  img.src = PIECE_SRC[code];
  img.alt = "";
  img.draggable = false;
  return img;
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const ADMIN_KEY = "3dc7fe2a-3b3a-4ba0-abb5-b4a30959f0c9";
const ADMIN_LS = "wa-chess-admin";

function isAdmin() {
  const q = new URLSearchParams(location.search).get("admin");
  if (q && q === ADMIN_KEY) {
    try { localStorage.setItem(ADMIN_LS, ADMIN_KEY); } catch {}
    return true;
  }
  try {
    return localStorage.getItem(ADMIN_LS) === ADMIN_KEY;
  } catch {
    return false;
  }
}

const params = new URLSearchParams(location.search);
let you = params.get("you") === "b" ? "b" : "w";
let gameId = (params.get("g") || "").toLowerCase();
const game = new Chess(START);

let selected = null;
let pendingPromo = null;
let lastMove = params.get("last") || "";
let pollTimer = null;
let animating = false;
let vsAi = params.get("vs") === "ai";
let aiDepth = Math.min(3, Math.max(1, Number(params.get("diff") || 2) || 2));
let aiBusy = false;

const boardEl = document.getElementById("board");
const board3dEl = document.getElementById("board3d");
const fxLayer = document.getElementById("fx-layer");
const capturedWhiteEl = document.getElementById("captured-white-pieces");
const capturedBlackEl = document.getElementById("captured-black-pieces");
const capturedWhiteTray = document.getElementById("captured-white");
const capturedBlackTray = document.getElementById("captured-black");
const youLine = document.getElementById("you-line");
const turnLine = document.getElementById("turn-line");
const lastLine = document.getElementById("last-line");
const movesEl = document.getElementById("moves");
const promoEl = document.getElementById("promo");
const promoBtns = document.getElementById("promo-btns");
const hintOut = document.getElementById("hint-out");

let board3d = null;
try {
  board3d = createChess3D(board3dEl, {
    onSquareClick(sq) {
      onSquare(sq);
    },
  });
} catch (err) {
  console.error("3D board failed", err);
  board3dEl.innerHTML =
    '<p style="color:#f5e6c8;padding:1rem;text-align:center">3D board failed to load. Check network / refresh.<br><small>' +
    String(err && err.message ? err.message : err) +
    "</small></p>";
}

function ensure3d() {
  return board3d;
}

function flipped() {
  return you === "b";
}

function files() {
  const f = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return flipped() ? f.slice().reverse() : f;
}

function ranks() {
  const r = ["8", "7", "6", "5", "4", "3", "2", "1"];
  return flipped() ? r.slice().reverse() : r;
}

function squareAt(row, col) {
  const f = files()[col];
  const r = ranks()[row];
  return `${f}${r}`;
}

function myTurn() {
  return !game.isGameOver() && game.turn() === you;
}

function colourName(c) {
  return c === "w" ? "White" : "Black";
}

function lastSan() {
  const hist = game.history();
  return hist[hist.length - 1] || "";
}

function writeUrl() {
  const next = new URL(location.href);
  next.search = "";
  if (vsAi) {
    next.searchParams.set("vs", "ai");
    next.searchParams.set("diff", String(aiDepth));
  } else if (gameId) {
    next.searchParams.set("g", gameId);
  }
  next.searchParams.set("you", you);
  const n = game.history().length;
  if (n) next.searchParams.set("n", String(n));
  history.replaceState(null, "", next);
}

function opponentUrl() {
  const u = new URL(location.origin + location.pathname);
  if (gameId) u.searchParams.set("g", gameId);
  u.searchParams.set("you", you === "w" ? "b" : "w");
  const n = game.history().length;
  if (n) u.searchParams.set("n", String(n));
  return u.toString();
}

function moveMessage() {
  const hist = game.history();
  const san = hist[hist.length - 1];
  if (game.isCheckmate()) {
    return `Checkmate. I played ${san}. ${colourName(you)} wins.`;
  }
  if (game.isDraw()) {
    return `Draw. Last move ${san}.`;
  }
  if (!san) {
    return `Your move. You are ${colourName(game.turn())}.`;
  }
  return `I made my move: ${san}. Your turn.`;
}

function renderCoords() {
  /* 3D board — coords omitted while the camera can rotate */
}

function legalTargets(from) {
  return game.moves({ square: from, verbose: true });
}

let lastSyncedFen = "";

function renderBoard() {
  if (!board3d) return;
  const fen = game.fen();
  // Only rebuild meshes when the position changes — selecting a piece must not
  // destroy/recreate the board (that was eating taps / clearing highlight state).
  if (!animating && fen !== lastSyncedFen) {
    board3d.syncFromGame(game, you);
    lastSyncedFen = fen;
  }
  const lastFrom = lastMove.slice(0, 2);
  const lastTo = lastMove.slice(2, 4);
  const targets = selected ? legalTargets(selected) : [];
  board3d.setHighlights({
    selected,
    legal: targets,
    lastFrom: lastFrom.length === 2 ? lastFrom : null,
    lastTo: lastTo.length === 2 ? lastTo : null,
  });
}

const CAPTURE_ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4 };

function capturedLineups() {
  // pieces each side has taken (enemy piece codes like bQ, wP)
  const by = { w: [], b: [] };
  for (const m of game.history({ verbose: true })) {
    if (!m.captured) continue;
    const takenColour = m.color === "w" ? "b" : "w";
    by[m.color].push(takenColour + m.captured.toUpperCase());
  }
  const sortCodes = (arr) =>
    arr.slice().sort((a, b) => {
      const ta = a[1].toLowerCase();
      const tb = b[1].toLowerCase();
      return (CAPTURE_ORDER[ta] ?? 9) - (CAPTURE_ORDER[tb] ?? 9);
    });
  return { w: sortCodes(by.w), b: sortCodes(by.b) };
}

function renderCapturedTray(el, tray, codes, taker) {
  if (!el || !tray) return;
  el.innerHTML = "";
  const label = tray.querySelector(".captured-label");
  if (label) {
    label.textContent =
      taker === you ? `You took (${colourName(taker)})` : `${colourName(taker)} took`;
  }
  if (!codes.length) {
    tray.classList.add("empty");
    const empty = document.createElement("span");
    empty.className = "captured-empty";
    empty.textContent = "—";
    el.appendChild(empty);
    return;
  }
  tray.classList.remove("empty");
  for (const code of codes) {
    const wrap = document.createElement("span");
    wrap.className = "captured-item";
    const img = pieceImg(code, "captured-piece");
    img.alt = code;
    const bandage = document.createElement("span");
    bandage.className = "captured-bandage";
    bandage.setAttribute("aria-hidden", "true");
    wrap.appendChild(img);
    wrap.appendChild(bandage);
    el.appendChild(wrap);
  }
}

function renderCaptured() {
  const { w, b } = capturedLineups();
  // Keep White's tray under the board, Black's above (matches usual scoreboard feel)
  renderCapturedTray(capturedWhiteEl, capturedWhiteTray, w, "w");
  renderCapturedTray(capturedBlackEl, capturedBlackTray, b, "b");
}

function renderStatus() {
  const levelName = aiDepth === 1 ? "Easy" : aiDepth === 3 ? "Hard" : "Medium";
  if (vsAi) {
    youLine.textContent = `You are ${colourName(you)} · vs AI (${levelName})`;
  } else {
    youLine.textContent = gameId
      ? `You are ${colourName(you)} · Game ${gameId}`
      : `You are ${colourName(you)}`;
  }
  const hist = game.history();
  lastLine.textContent = hist.length ? `Last move: ${hist[hist.length - 1]}` : "Opening position";

  if (game.isCheckmate()) {
    const winner = colourName(game.turn() === "w" ? "b" : "w");
    turnLine.textContent = vsAi
      ? `Checkmate — ${winner === colourName(you) ? "You win!" : "AI wins"}`
      : `Checkmate — ${winner} wins`;
  } else if (game.isStalemate()) {
    turnLine.textContent = "Stalemate — draw";
  } else if (game.isDraw()) {
    turnLine.textContent = "Draw";
  } else if (myTurn()) {
    turnLine.textContent = game.inCheck() ? "Your move — you are in check" : "Your move";
  } else if (vsAi) {
    turnLine.textContent = aiBusy ? "AI thinking…" : "AI’s turn…";
  } else {
    turnLine.textContent = `Waiting for ${colourName(game.turn())} — send the link on WhatsApp`;
  }

  const sans = game.history();
  const pairs = [];
  for (let i = 0; i < sans.length; i += 2) {
    pairs.push(`${i / 2 + 1}. ${sans[i]}${sans[i + 1] ? " " + sans[i + 1] : ""}`);
  }
  movesEl.innerHTML = pairs.map((p) => `<li>${p}</li>`).join("");
  renderCaptured();

  const wa = document.getElementById("btn-whatsapp");
  const copy = document.getElementById("btn-copy");
  if (wa) wa.disabled = !!vsAi;
  if (copy) copy.disabled = !!vsAi;
  const help = document.getElementById("help-text");
  if (help) {
    help.innerHTML = vsAi
      ? `Playing <strong>vs AI</strong> (${levelName}). Tap pieces to move — the computer replies automatically.`
      : `After you move, tap <strong>Send this turn on WhatsApp</strong>. Or tap <strong>Play vs AI</strong> for a solo game.`;
  }
  const diffSel = document.getElementById("ai-diff");
  if (diffSel && String(aiDepth) !== diffSel.value) diffSel.value = String(aiDepth);
}

function squareButton(sq) {
  return boardEl.querySelector(`[data-square="${sq}"]`);
}

function squareBox(sq) {
  const el = squareButton(sq);
  if (!el || !fxLayer) return null;
  const stage = fxLayer.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return {
    left: box.left - stage.left,
    top: box.top - stage.top,
    width: box.width,
    height: box.height,
  };
}

function captureSquareFor(move) {
  if (!move.captured) return null;
  if (String(move.flags || "").includes("e")) {
    return move.to[0] + move.from[1];
  }
  return move.to;
}

function findVerboseMove(from, to, promotion) {
  let promo = promotion;
  if (!promo && needsPromotion(from, to)) promo = "q";
  return game.moves({ verbose: true }).find((m) => {
    if (m.from !== from || m.to !== to) return false;
    if (m.promotion) return m.promotion === (promo || "q");
    return true;
  });
}

function clearFx() {
  if (fxLayer) fxLayer.innerHTML = "";
}

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeTntStick() {
  const tnt = document.createElement("div");
  tnt.className = "fx-tnt";
  tnt.innerHTML =
    '<span class="fx-tnt-body"></span><span class="fx-tnt-band">TNT</span><span class="fx-tnt-fuse"></span><span class="fx-tnt-spark"></span>';
  return tnt;
}

function explodeVictim(victimImg, box, cx, cy) {
  if (victimImg) victimImg.classList.add("ghost-hide");

  const flash = document.createElement("div");
  flash.className = "fx-flash";
  flash.style.left = `${cx}px`;
  flash.style.top = `${cy}px`;
  flash.style.width = `${box.width * 1.35}px`;
  flash.style.height = `${box.height * 1.35}px`;
  fxLayer.appendChild(flash);

  const burst = document.createElement("div");
  burst.className = "fx-burst";
  burst.style.left = `${cx}px`;
  burst.style.top = `${cy}px`;
  burst.style.width = `${box.width * 1.1}px`;
  burst.style.height = `${box.height * 1.1}px`;
  fxLayer.appendChild(burst);

  const ring = document.createElement("div");
  ring.className = "fx-ring";
  ring.style.left = `${cx}px`;
  ring.style.top = `${cy}px`;
  ring.style.width = `${box.width * 0.4}px`;
  ring.style.height = `${box.height * 0.4}px`;
  fxLayer.appendChild(ring);

  if (victimImg) {
    for (let i = 0; i < 7; i++) {
      const ang = (Math.PI * 2 * i) / 7 + (Math.random() - 0.5) * 0.35;
      const dist = box.width * (0.55 + Math.random() * 0.55);
      const rot = (Math.random() > 0.5 ? 1 : -1) * (140 + Math.random() * 220);
      const shard = victimImg.cloneNode(true);
      shard.className = "fx-shard";
      const sw = box.width * (0.28 + Math.random() * 0.22);
      shard.style.width = `${sw}px`;
      shard.style.height = `${sw}px`;
      shard.style.left = `${cx}px`;
      shard.style.top = `${cy}px`;
      shard.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
      shard.style.setProperty("--dy", `${Math.sin(ang) * dist - box.height * 0.15}px`);
      shard.style.setProperty("--rot", `${rot}deg`);
      shard.style.setProperty("--delay", `${i * 12}ms`);
      fxLayer.appendChild(shard);
    }
  }

  for (let i = 0; i < 16; i++) {
    const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
    const dist = box.width * (0.4 + Math.random() * 0.7);
    const spark = document.createElement("div");
    spark.className = "fx-spark";
    const size = 4 + Math.random() * 7;
    spark.style.width = `${size}px`;
    spark.style.height = `${size}px`;
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy}px`;
    spark.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    spark.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
    spark.style.setProperty("--delay", `${Math.floor(Math.random() * 40)}ms`);
    fxLayer.appendChild(spark);
  }
}

async function playCaptureFx(capSq) {
  const box = squareBox(capSq);
  if (!box || !fxLayer) return;
  const victimBtn = squareButton(capSq);
  const victimImg = victimBtn && victimBtn.querySelector("img.piece");
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  // 1) TNT bounces onto the square
  const tnt = makeTntStick();
  const tntW = box.width * 0.55;
  const tntH = box.height * 0.28;
  tnt.style.width = `${tntW}px`;
  tnt.style.height = `${tntH}px`;
  tnt.style.left = `${cx}px`;
  tnt.style.top = `${cy - box.height * 0.9}px`;
  tnt.style.setProperty("--land-y", `${box.height * 0.9}px`);
  fxLayer.appendChild(tnt);
  await waitMs(20);
  tnt.classList.add("bounce-in");
  await waitMs(520);

  // Fuse fizz
  tnt.classList.add("fuse-lit");
  await waitMs(280);

  // 2) Piece shakes in fear
  if (victimImg) {
    victimImg.classList.add("piece-shake");
  }
  await waitMs(420);

  // 3) Boom — hide TNT, explode piece
  tnt.remove();
  if (victimImg) victimImg.classList.remove("piece-shake");
  explodeVictim(victimImg, box, cx, cy);
  await waitMs(520);
}

function castleRookSquares(move) {
  const flags = String(move.flags || "");
  if (!flags.includes("k") && !flags.includes("q")) return null;
  const rank = move.from[1];
  if (flags.includes("k")) return { from: "h" + rank, to: "f" + rank };
  return { from: "a" + rank, to: "d" + rank };
}

function spawnFlyer(fromSq, toSq, extraClass) {
  const fromBox = squareBox(fromSq);
  const toBox = squareBox(toSq);
  const fromBtn = squareButton(fromSq);
  const moverImg = fromBtn && fromBtn.querySelector("img.piece");
  if (!fromBox || !toBox || !moverImg || !fxLayer) return null;

  const flyer = moverImg.cloneNode(true);
  flyer.className = "fx-flyer" + (extraClass ? " " + extraClass : "");
  flyer.style.width = `${fromBox.width * 0.92}px`;
  flyer.style.height = `${fromBox.height * 0.92}px`;
  const startX = fromBox.left + fromBox.width * 0.04;
  const startY = fromBox.top + fromBox.height * 0.04;
  const endX = toBox.left + toBox.width * 0.04;
  const endY = toBox.top + toBox.height * 0.04;
  flyer.style.transform = `translate(${startX}px, ${startY}px)`;
  fxLayer.appendChild(flyer);
  moverImg.classList.add("ghost-hide");
  return { flyer, endX, endY };
}

async function animateMove(move) {
  if (!board3d) return;
  const isCapture = !!move.captured;
  const capSq = captureSquareFor(move);
  const rook = castleRookSquares(move);

  // Keep 3D mesh state in sync with pre-move board before animating
  board3d.syncFromGame(game, you);
  board3d.setHighlights({});

  if (isCapture && capSq) {
    await board3d.playCaptureSequence(capSq, move.from, move.to);
  } else {
    const slide = board3d.animatePieceMove(move.from, move.to, { duration: 480 });
    if (rook) {
      await Promise.all([
        slide,
        board3d.animatePieceMove(rook.from, rook.to, { duration: 480 }),
      ]);
    } else {
      await slide;
    }
  }
}

async function tryMove(from, to, promotion) {
  if (animating) return false;
  const spec = { from, to };
  if (promotion) spec.promotion = promotion;
  else if (needsPromotion(from, to)) spec.promotion = "q";

  const preview = findVerboseMove(from, to, spec.promotion);
  if (!preview) return false;

  setSelected(null);
  pendingPromo = null;
  promoEl.hidden = true;
  hintOut.hidden = true;
  renderBoard();

  animating = true;
  board3dEl.classList.add("animating");
  try {
    await animateMove(preview);
  } catch {
    /* fall through and still apply move */
  }

  const move = game.move(spec);
  animating = false;
  board3dEl.classList.remove("animating");
  if (typeof clearFx === "function") clearFx();
  if (!move) {
    renderBoard();
    renderStatus();
    return false;
  }

  lastMove = from + to + (move.promotion || "");
  writeUrl();
  renderBoard();
  renderStatus();
  if (!vsAi) saveGame();
  if (vsAi) queueMicrotask(() => maybeAiReply());
  return true;
}

function pickAiMove(depth) {
  const ch = new Chess(game.fen());
  const white = ch.turn() === "w";
  const moves = ch.moves({ verbose: true });
  if (!moves.length) return null;

  // Easy: sometimes play a random legal move
  if (depth <= 1 && Math.random() < 0.35) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const searchDepth = depth <= 1 ? 1 : depth;
  let bestMove = moves[0];
  let bestScore = white ? -Infinity : Infinity;

  // Prefer captures / checks slightly at root for snappier play
  const ordered = moves.slice().sort((a, b) => {
    const sa = (a.captured ? 10 : 0) + (a.san.includes("+") ? 3 : 0);
    const sb = (b.captured ? 10 : 0) + (b.san.includes("+") ? 3 : 0);
    return sb - sa;
  });

  for (const m of ordered) {
    ch.move(m);
    const s = minimax(ch, searchDepth - 1, -Infinity, Infinity, ch.turn() === "w");
    ch.undo();
    if (white ? s > bestScore : s < bestScore) {
      bestScore = s;
      bestMove = m;
    }
  }
  return bestMove;
}

async function maybeAiReply() {
  if (!vsAi || aiBusy || animating || game.isGameOver()) return;
  if (game.turn() === you) return;
  aiBusy = true;
  renderStatus();
  const thinkMs = aiDepth === 1 ? 280 : aiDepth === 3 ? 520 : 380;
  await waitMs(thinkMs);
  try {
    const m = pickAiMove(aiDepth);
    if (!m) return;
    // tryMove animates + applies; it will not re-enter AI while turn is yours after
    await tryMove(m.from, m.to, m.promotion || undefined);
  } finally {
    aiBusy = false;
    renderStatus();
  }
}

function startAiGame() {
  const sel = document.getElementById("ai-diff");
  aiDepth = Math.min(3, Math.max(1, Number(sel && sel.value ? sel.value : 2) || 2));
  vsAi = true;
  you = "w";
  gameId = "";
  game.reset();
  setSelected(null);
  pendingPromo = null;
  lastMove = "";
  lastSeenMoveCount = 0;
  aiBusy = false;
  promoEl.hidden = true;
  hintOut.hidden = true;
  writeUrl();
  renderCoords();
  renderBoard();
  renderStatus();
}

function startFriendGame() {
  vsAi = false;
  aiBusy = false;
  location.href = location.pathname + "?you=w";
}

function needsPromotion(from, to) {
  const piece = game.get(from);
  if (!piece || piece.type !== "p") return false;
  const destRank = to[1];
  return (piece.color === "w" && destRank === "8") || (piece.color === "b" && destRank === "1");
}

function showPromo(from, to) {
  pendingPromo = { from, to };
  const colour = game.get(from).color;
  const kinds = ["q", "r", "b", "n"];
  promoBtns.innerHTML = "";
  kinds.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "promo-choice";
    b.setAttribute("aria-label", "Promote to " + (PIECE_NAME[t] || t));
    b.appendChild(pieceImg(colour + t.toUpperCase()));
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      tryMove(from, to, t);
    });
    promoBtns.appendChild(b);
  });
  promoEl.hidden = false;
}

function setSelected(sq) {
  selected = sq || null;
  if (board3dEl) board3dEl.dataset.selected = selected || "";
}

function onSquare(sq) {
  if (animating || aiBusy) return;
  if (pendingPromo) {
    if (sq === pendingPromo.to) tryMove(pendingPromo.from, pendingPromo.to, "q");
    return;
  }
  if (!myTurn()) return;
  const piece = game.get(sq);
  if (selected) {
    if (sq === selected) {
      setSelected(null);
      renderBoard();
      return;
    }
    if (needsPromotion(selected, sq) && legalTargets(selected).some((m) => m.to === sq)) {
      showPromo(selected, sq);
      return;
    }
    if (tryMove(selected, sq)) return;
  }
  if (piece && piece.color === you) {
    setSelected(sq);
    renderBoard();
  }
}

async function sendWhatsApp() {
  const text = moveMessage();
  const playUrl = opponentUrl();
  // Phone share sheet attaches the play link as a preview card, not in the message.
  if (navigator.share) {
    try {
      await navigator.share({ title: "WhatsApp Chess", text, url: playUrl });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  window.open(
    "https://wa.me/?text=" + encodeURIComponent(text + " " + playUrl),
    "_blank",
    "noopener"
  );
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(opponentUrl());
    lastLine.textContent = "Opponent link copied";
  } catch {
    prompt("Copy this link for your opponent", opponentUrl());
  }
}

function newGame() {
  if (vsAi) {
    startAiGame();
    return;
  }
  startFriendGame();
}

let lastSeenMoveCount = -1;

function loadMovesQuiet(moves) {
  game.reset();
  for (const san of moves) {
    if (!game.move(san)) break;
  }
}

/**
 * Replay the last ply so the opponent also sees slide / TNT / explode.
 * Loads all moves except the last, renders, animates that ply, then commits.
 */
async function replayIncomingMove(moves, lastUci) {
  if (!moves.length) return false;
  const prior = moves.slice(0, -1);
  loadMovesQuiet(prior);
  lastMove = lastUci || "";
  writeUrl();
  renderCoords();
  renderBoard();
  renderStatus();

  const lastSan = moves[moves.length - 1];
  const verbose = game.moves({ verbose: true }).find((m) => m.san === lastSan);
  if (!verbose) {
    // Fallback: apply without animation
    if (!game.move(lastSan)) return false;
    lastMove = lastUci || lastMove;
    renderBoard();
    renderStatus();
    return true;
  }

  animating = true;
  board3dEl.classList.add("animating");
  try {
    await animateMove(verbose);
  } catch {
    /* still apply */
  }
  if (!game.move(lastSan)) {
    animating = false;
    board3dEl.classList.remove("animating");
    if (typeof clearFx === "function") clearFx();
    return false;
  }
  lastMove =
    lastUci ||
    verbose.from + verbose.to + (verbose.promotion || "");
  animating = false;
  board3dEl.classList.remove("animating");
  if (typeof clearFx === "function") clearFx();
  writeUrl();
  renderBoard();
  renderStatus();
  return true;
}

async function applyRecord(rec, { animateLast = false } = {}) {
  if (!rec) return;
  gameId = rec.id;
  const moves = Array.isArray(rec.moves) ? rec.moves : [];
  const incomingCount = moves.length;

  // Animate when we receive a newer position than we already have
  const shouldAnimate =
    animateLast &&
    incomingCount > 0 &&
    incomingCount !== lastSeenMoveCount &&
    !animating;

  if (shouldAnimate && incomingCount > lastSeenMoveCount && lastSeenMoveCount >= 0) {
    // Opponent (or poll) caught a new move — replay it
    await replayIncomingMove(moves, rec.last || "");
  } else if (shouldAnimate && lastSeenMoveCount < 0 && incomingCount > 0) {
    // Fresh open of an in-progress game — replay only the latest ply
    await replayIncomingMove(moves, rec.last || "");
  } else if (moves.length) {
    loadMovesQuiet(moves);
    lastMove = rec.last || "";
    writeUrl();
    renderCoords();
    renderBoard();
    renderStatus();
  } else if (rec.fen) {
    game.load(rec.fen);
    lastMove = rec.last || "";
    writeUrl();
    renderCoords();
    renderBoard();
    renderStatus();
  } else {
    lastMove = rec.last || "";
    writeUrl();
    renderCoords();
    renderBoard();
    renderStatus();
  }

  lastSeenMoveCount = game.history().length;
}

async function saveGame() {
  if (!gameId) return;
  try {
    await fetch("/api/games/" + gameId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fen: game.fen(),
        moves: game.history(),
        last: lastMove,
        san: lastSan(),
      }),
    });
    lastSeenMoveCount = game.history().length;
  } catch {
    /* keep playing from local board */
  }
}

async function boot() {
  if (vsAi) {
    // Solo AI game — no server required
    you = "w";
    gameId = "";
    game.reset();
    lastSeenMoveCount = 0;
    writeUrl();
    renderCoords();
    renderBoard();
    renderStatus();
    return;
  }
  try {
    if (gameId) {
      const res = await fetch("/api/games/" + gameId);
      if (res.ok) {
        await applyRecord(await res.json(), { animateLast: true });
      } else {
        lastLine.textContent = "Game not found — start a new game";
      }
    } else {
      const res = await fetch("/api/games", { method: "POST" });
      if (!res.ok) throw new Error("Could not create game");
      you = "w";
      await applyRecord(await res.json(), { animateLast: false });
    }
  } catch {
    lastLine.textContent = "Could not reach the game server";
    writeUrl();
    renderCoords();
    renderBoard();
    renderStatus();
  }
  pollTimer = setInterval(async () => {
    if (vsAi || !gameId || myTurn() || game.isGameOver() || animating) return;
    try {
      const res = await fetch("/api/games/" + gameId);
      if (!res.ok) return;
      const rec = await res.json();
      if (rec.fen && rec.fen !== game.fen()) {
        await applyRecord(rec, { animateLast: true });
      }
    } catch {}
  }, 2500);
}

const PIECE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function evaluateWhite(ch) {
  if (ch.isCheckmate()) return ch.turn() === "w" ? -100000 : 100000;
  if (ch.isDraw()) return 0;
  let s = 0;
  const board = ch.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const v = PIECE_VAL[p.type] || 0;
      const centre = 3.5 - Math.abs(c - 3.5) + (3.5 - Math.abs(r - 3.5));
      const bonus = p.type === "k" ? 0 : centre * (p.type === "p" ? 6 : 4);
      s += (p.color === "w" ? 1 : -1) * (v + bonus);
    }
  }
  s += (ch.turn() === "w" ? 1 : -1) * ch.moves().length;
  return s;
}

function minimax(ch, depth, alpha, beta, whiteToMove) {
  if (depth === 0 || ch.isGameOver()) return evaluateWhite(ch);
  const moves = ch.moves();
  if (whiteToMove) {
    let best = -Infinity;
    for (const m of moves) {
      ch.move(m);
      best = Math.max(best, minimax(ch, depth - 1, alpha, beta, false));
      ch.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    ch.move(m);
    best = Math.min(best, minimax(ch, depth - 1, alpha, beta, true));
    ch.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function freeHint(fen) {
  const ch = new Chess(fen);
  const white = ch.turn() === "w";
  const moves = ch.moves();
  if (!moves.length) return null;
  const depth = moves.length > 28 ? 2 : 3;
  let bestMove = moves[0];
  let bestScore = white ? -Infinity : Infinity;
  for (const m of moves) {
    ch.move(m);
    const s = minimax(ch, depth - 1, -Infinity, Infinity, ch.turn() === "w");
    ch.undo();
    if (white ? s > bestScore : s < bestScore) {
      bestScore = s;
      bestMove = m;
    }
  }
  return bestMove;
}

async function askHint() {
  if (!myTurn()) {
    hintOut.hidden = false;
    hintOut.textContent = "Hints are for your turn only.";
    return;
  }
  hintOut.hidden = false;
  hintOut.textContent = "Thinking…";
  try {
    const res = await fetch("/api/hint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Chess-Admin": ADMIN_KEY,
      },
      body: JSON.stringify({ fen: game.fen() }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.hint) {
        hintOut.textContent = data.hint;
        return;
      }
    }
  } catch {
    /* fall through to free engine */
  }
  const san = freeHint(game.fen());
  hintOut.textContent = san ? `Hint: ${san}` : "No legal moves.";
}

document.getElementById("btn-whatsapp").addEventListener("click", sendWhatsApp);
document.getElementById("btn-copy").addEventListener("click", copyLink);
document.getElementById("btn-new").addEventListener("click", startFriendGame);
document.getElementById("btn-ai").addEventListener("click", startAiGame);
document.getElementById("ai-diff").addEventListener("change", (e) => {
  aiDepth = Math.min(3, Math.max(1, Number(e.target.value) || 2));
  if (vsAi) writeUrl();
  renderStatus();
});

(function secretHintOnTitle() {
  const title = document.getElementById("title");
  if (!title) return;
  let lastTap = 0;
  title.addEventListener("pointerup", (e) => {
    const now = Date.now();
    if (now - lastTap < 400) {
      e.preventDefault();
      lastTap = 0;
      askHint();
    } else {
      lastTap = now;
    }
  });
})();

renderCoords();
renderBoard();
renderStatus();
boot();
