import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

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

const boardEl = document.getElementById("board");
const fxLayer = document.getElementById("fx-layer");
const youLine = document.getElementById("you-line");
const turnLine = document.getElementById("turn-line");
const lastLine = document.getElementById("last-line");
const movesEl = document.getElementById("moves");
const promoEl = document.getElementById("promo");
const promoBtns = document.getElementById("promo-btns");
const hintOut = document.getElementById("hint-out");

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
  if (gameId) next.searchParams.set("g", gameId);
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
  document.getElementById("files-top").innerHTML = files().map((f) => `<span>${f}</span>`).join("");
  document.getElementById("files-bottom").innerHTML = files().map((f) => `<span>${f}</span>`).join("");
  const ranksHtml = ranks().map((r) => `<span>${r}</span>`).join("");
  document.getElementById("ranks-left").innerHTML = ranksHtml;
  document.getElementById("ranks-right").innerHTML = ranksHtml;
}

function legalTargets(from) {
  return game.moves({ square: from, verbose: true });
}

function renderBoard() {
  boardEl.innerHTML = "";
  const lastFrom = lastMove.slice(0, 2);
  const lastTo = lastMove.slice(2, 4);
  const targets = selected ? legalTargets(selected) : [];
  const targetSet = new Set(targets.map((m) => m.to));

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = squareAt(row, col);
      const fileIndex = sq.charCodeAt(0) - 97;
      const rankIndex = Number(sq[1]) - 1;
      const isLight = (fileIndex + rankIndex) % 2 === 1;
      const piece = game.get(sq);
      const el = document.createElement("button");
      el.type = "button";
      el.className = `sq ${isLight ? "light" : "dark"}`;
      el.dataset.square = sq;
      el.setAttribute("aria-label", sq);
      if (sq === selected) el.classList.add("selected");
      if (sq === lastFrom || sq === lastTo) el.classList.add("last");
      if (targetSet.has(sq)) {
        el.classList.add("legal");
        if (piece) el.classList.add("capture");
      }
      if (!isLight) {
        el.style.backgroundPosition = `${(fileIndex / 7) * 100}% ${(rankIndex / 7) * 100}%`;
      }
      if (piece) {
        const code = piece.color + piece.type.toUpperCase();
        const img = pieceImg(code);
        img.alt = colourName(piece.color) + " " + (PIECE_NAME[piece.type] || piece.type);
        el.appendChild(img);
      }
      el.addEventListener("click", () => onSquare(sq));
      boardEl.appendChild(el);
    }
  }
}

function renderStatus() {
  youLine.textContent = gameId
    ? `You are ${colourName(you)} · Game ${gameId}`
    : `You are ${colourName(you)}`;
  const hist = game.history();
  lastLine.textContent = hist.length ? `Last move: ${hist[hist.length - 1]}` : "Opening position";

  if (game.isCheckmate()) {
    turnLine.textContent = `Checkmate — ${colourName(game.turn() === "w" ? "b" : "w")} wins`;
  } else if (game.isStalemate()) {
    turnLine.textContent = "Stalemate — draw";
  } else if (game.isDraw()) {
    turnLine.textContent = "Draw";
  } else if (myTurn()) {
    turnLine.textContent = game.inCheck() ? "Your move — you are in check" : "Your move";
  } else {
    turnLine.textContent = `Waiting for ${colourName(game.turn())} — send the link on WhatsApp`;
  }

  const sans = game.history();
  const pairs = [];
  for (let i = 0; i < sans.length; i += 2) {
    pairs.push(`${i / 2 + 1}. ${sans[i]}${sans[i + 1] ? " " + sans[i + 1] : ""}`);
  }
  movesEl.innerHTML = pairs.map((p) => `<li>${p}</li>`).join("");

  document.getElementById("btn-whatsapp").disabled = false;
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

function playCaptureFx(capSq) {
  const box = squareBox(capSq);
  if (!box || !fxLayer) return;
  const victimBtn = squareButton(capSq);
  const victimImg = victimBtn && victimBtn.querySelector("img.piece");
  if (victimImg) victimImg.classList.add("capture-victim");

  const burst = document.createElement("div");
  burst.className = "fx-burst";
  burst.style.left = `${box.left + box.width / 2}px`;
  burst.style.top = `${box.top + box.height / 2}px`;
  burst.style.width = `${box.width * 0.85}px`;
  burst.style.height = `${box.height * 0.85}px`;
  fxLayer.appendChild(burst);

  const sparkCount = 8;
  for (let i = 0; i < sparkCount; i++) {
    const ang = (Math.PI * 2 * i) / sparkCount;
    const dist = box.width * (0.35 + (i % 2) * 0.12);
    const spark = document.createElement("div");
    spark.className = "fx-spark";
    spark.style.left = `${box.left + box.width / 2}px`;
    spark.style.top = `${box.top + box.height / 2}px`;
    spark.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    spark.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
    fxLayer.appendChild(spark);
  }
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

function animateMove(move) {
  return new Promise((resolve) => {
    const isCapture = !!move.captured;
    const capSq = captureSquareFor(move);
    if (isCapture && capSq) playCaptureFx(capSq);

    const main = spawnFlyer(move.from, move.to, isCapture ? "capturing" : "");
    const rook = castleRookSquares(move);
    const rookFx = rook ? spawnFlyer(rook.from, rook.to, "") : null;
    if (!main) {
      resolve();
      return;
    }

    const slideDelay = isCapture ? 90 : 16;
    const duration = isCapture ? 300 : 320;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearFx();
      resolve();
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          main.flyer.style.transform = `translate(${main.endX}px, ${main.endY}px) scale(${isCapture ? 1.06 : 1})`;
          if (rookFx) {
            rookFx.flyer.style.transform = `translate(${rookFx.endX}px, ${rookFx.endY}px)`;
          }
        }, slideDelay);
      });
    });

    main.flyer.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, slideDelay + duration + 80);
  });
}

async function tryMove(from, to, promotion) {
  if (animating) return false;
  const spec = { from, to };
  if (promotion) spec.promotion = promotion;
  else if (needsPromotion(from, to)) spec.promotion = "q";

  const preview = findVerboseMove(from, to, spec.promotion);
  if (!preview) return false;

  selected = null;
  pendingPromo = null;
  promoEl.hidden = true;
  hintOut.hidden = true;
  renderBoard();

  animating = true;
  boardEl.classList.add("animating");
  try {
    await animateMove(preview);
  } catch {
    /* fall through and still apply move */
  }

  const move = game.move(spec);
  animating = false;
  boardEl.classList.remove("animating");
  clearFx();
  if (!move) {
    renderBoard();
    renderStatus();
    return false;
  }

  lastMove = from + to + (move.promotion || "");
  writeUrl();
  renderBoard();
  renderStatus();
  saveGame();
  return true;
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

function onSquare(sq) {
  if (animating) return;
  if (pendingPromo) {
    if (sq === pendingPromo.to) tryMove(pendingPromo.from, pendingPromo.to, "q");
    return;
  }
  if (!myTurn()) return;
  const piece = game.get(sq);
  if (selected) {
    if (sq === selected) {
      selected = null;
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
    selected = sq;
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
  location.href = location.pathname + "?you=w";
}

function applyRecord(rec) {
  if (!rec) return;
  gameId = rec.id;
  if (Array.isArray(rec.moves) && rec.moves.length) {
    game.reset();
    for (const san of rec.moves) {
      if (!game.move(san)) break;
    }
  } else if (rec.fen) {
    game.load(rec.fen);
  }
  lastMove = rec.last || "";
  writeUrl();
  renderCoords();
  renderBoard();
  renderStatus();
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
  } catch {
    /* keep playing from local board */
  }
}

async function boot() {
  try {
    if (gameId) {
      const res = await fetch("/api/games/" + gameId);
      if (res.ok) {
        applyRecord(await res.json());
      } else {
        lastLine.textContent = "Game not found — start a new game";
      }
    } else {
      const res = await fetch("/api/games", { method: "POST" });
      if (!res.ok) throw new Error("Could not create game");
      you = "w";
      applyRecord(await res.json());
    }
  } catch {
    lastLine.textContent = "Could not reach the game server";
    writeUrl();
    renderCoords();
    renderBoard();
    renderStatus();
  }
  pollTimer = setInterval(async () => {
    if (!gameId || myTurn() || game.isGameOver()) return;
    try {
      const res = await fetch("/api/games/" + gameId);
      if (!res.ok) return;
      const rec = await res.json();
      if (rec.fen && rec.fen !== game.fen()) applyRecord(rec);
    } catch {}
  }, 3000);
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
document.getElementById("btn-new").addEventListener("click", newGame);

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
