import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";

// chess.js uses color "w" / "b". Text-presentation (U+FE0E) so Windows
// does not hide black pieces as same-colour emoji.
const TP = "\uFE0E";
const UNICODE = {
  wK: "♔" + TP, wQ: "♕" + TP, wR: "♖" + TP, wB: "♗" + TP, wN: "♘" + TP, wP: "♙" + TP,
  bK: "♚" + TP, bQ: "♛" + TP, bR: "♜" + TP, bB: "♝" + TP, bN: "♞" + TP, bP: "♟" + TP,
};

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
  document.getElementById("btn-hint").disabled = !myTurn();
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

async function askHint() {
  hintOut.hidden = false;
  hintOut.textContent = "Asking Grok…";
  try {
    const res = await fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen: game.fen() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Hint failed");
    hintOut.textContent = data.hint;
  } catch (err) {
    hintOut.textContent = err.message || "Hint server is not running. Start with node server.mjs and set XAI_API_KEY.";
  }
}

document.getElementById("btn-whatsapp").addEventListener("click", sendWhatsApp);
document.getElementById("btn-copy").addEventListener("click", copyLink);
document.getElementById("btn-new").addEventListener("click", newGame);
document.getElementById("btn-hint").addEventListener("click", askHint);

renderCoords();
renderBoard();
renderStatus();
boot();
