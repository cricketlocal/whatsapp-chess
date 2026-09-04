import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

// chess.js uses color "w" / "b". Text-presentation (U+FE0E) so Windows
// does not hide black pieces as same-colour emoji.
const TP = "\uFE0E";
const UNICODE = {
  wK: "♔" + TP, wQ: "♕" + TP, wR: "♖" + TP, wB: "♗" + TP, wN: "♘" + TP, wP: "♙" + TP,
  bK: "♚" + TP, bQ: "♛" + TP, bR: "♜" + TP, bB: "♝" + TP, bN: "♞" + TP, bP: "♟" + TP,
};

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

const boardEl = document.getElementById("board");
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
      if (piece) {
        const span = document.createElement("span");
        span.className = "piece piece-" + piece.color;
        span.textContent = UNICODE[piece.color + piece.type.toUpperCase()] || "";
        el.appendChild(span);
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

function tryMove(from, to, promotion) {
  const spec = { from, to };
  if (promotion) spec.promotion = promotion;
  else if (needsPromotion(from, to)) spec.promotion = "q";
  const move = game.move(spec);
  if (!move) return false;
  lastMove = from + to + (move.promotion || "");
  selected = null;
  pendingPromo = null;
  promoEl.hidden = true;
  hintOut.hidden = true;
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
  const kinds = [
    { t: "q", g: UNICODE[colour + "Q"] },
    { t: "r", g: UNICODE[colour + "R"] },
    { t: "b", g: UNICODE[colour + "B"] },
    { t: "n", g: UNICODE[colour + "N"] },
  ];
  promoBtns.innerHTML = "";
  kinds.forEach((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "promo-choice piece-" + colour;
    b.setAttribute("aria-label", "Promote to " + k.t);
    b.textContent = k.g;
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      tryMove(from, to, k.t);
    });
    promoBtns.appendChild(b);
  });
  promoEl.hidden = false;
}

function onSquare(sq) {
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
