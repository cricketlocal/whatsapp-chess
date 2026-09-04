import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PIECE_DIR = path.join(DIR, "pieces");
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LIGHT = "#eee8d5";
const DARK = "#769656";
const LAST = "#e8c547";
const INK = "#142018";
const CREAM = "#f4efe4";
const SQ = 96;
const PAD = 28;
const CAP = 64;
const PIECES = {};

for (const name of ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]) {
  const raw = fs.readFileSync(path.join(PIECE_DIR, name + ".svg"), "utf8");
  PIECES[name] = raw.replace(/<\?xml[^>]*>/i, "").replace(/<svg[^>]*>/i, "").replace(/<\/svg>/i, "").trim();
}

function xml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseFen(fen) {
  const placement = String(fen || START).split(" ")[0];
  const ranks = placement.split("/");
  const grid = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    const spec = ranks[r] || "";
    for (const ch of spec) {
      if (ch >= "1" && ch <= "8") {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        const colour = ch === ch.toUpperCase() ? "w" : "b";
        row.push(colour + ch.toUpperCase());
      }
    }
    while (row.length < 8) row.push(null);
    grid.push(row.slice(0, 8));
  }
  return grid;
}

function sqToCell(sq, flip) {
  if (!sq || sq.length < 2) return null;
  let file = sq.charCodeAt(0) - 97;
  let rank = Number(sq[1]) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  if (flip) {
    file = 7 - file;
    rank = 7 - rank;
  }
  return { col: file, row: 7 - rank };
}

export function boardSvg({ fen, last = "", flip = false, caption = "" } = {}) {
  const grid = parseFen(fen);
  const lastFrom = sqToCell(last.slice(0, 2), flip);
  const lastTo = sqToCell(last.slice(2, 4), flip);
  const board = 8 * SQ;
  const width = PAD + board + PAD;
  const height = CAP + PAD + board + PAD;
  const files = flip ? "hgfedcba" : "abcdefgh";
  const ranks = flip ? "12345678" : "87654321";
  const ox = PAD;
  const oy = CAP + PAD;
  const scale = (SQ * 0.86) / 45;
  const inset = (SQ - 45 * scale) / 2;

  let body = "";
  body += `<rect width="${width}" height="${height}" fill="${CREAM}"/>`;
  body += `<text x="${width / 2}" y="42" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700" fill="${INK}">${xml(caption || "WhatsApp Chess")}</text>`;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = ox + col * SQ;
      const y = oy + row * SQ;
      const isLast =
        (lastFrom && lastFrom.row === row && lastFrom.col === col) ||
        (lastTo && lastTo.row === row && lastTo.col === col);
      const dark = (row + col) % 2 === 1;
      const fill = isLast ? LAST : dark ? DARK : LIGHT;
      body += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="${fill}"/>`;
      const srcRow = flip ? 7 - row : row;
      const srcCol = flip ? 7 - col : col;
      const piece = grid[srcRow][srcCol];
      if (piece && PIECES[piece]) {
        body += `<g transform="translate(${x + inset},${y + inset}) scale(${scale.toFixed(4)})">${PIECES[piece]}</g>`;
      }
    }
  }

  for (let i = 0; i < 8; i++) {
    const cx = ox + i * SQ + SQ / 2;
    body += `<text x="${cx}" y="${oy + board + 20}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="${INK}">${files[i]}</text>`;
    body += `<text x="${ox - 10}" y="${oy + i * SQ + SQ / 2 + 5}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="${INK}">${ranks[i]}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

export function boardPng(opts) {
  const svg = boardSvg(opts);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 900 },
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}
