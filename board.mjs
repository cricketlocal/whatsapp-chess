import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PIECE_DIR = path.join(DIR, "public", "pieces-carved");
const TEX_DIR = path.join(DIR, "public", "textures");
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SQ = 96;
const FRAME = 44;
const CAP = 56;
const INK = "#2c3238";
const PIECES = {};

function dataUri(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

const MARBLE = dataUri(path.join(TEX_DIR, "marble.jpg"), "image/jpeg");
const GREY = dataUri(path.join(TEX_DIR, "grey-marble.jpg"), "image/jpeg");
for (const name of ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]) {
  PIECES[name] = dataUri(path.join(PIECE_DIR, name + ".png"), "image/png");
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
  const width = FRAME + board + FRAME;
  const height = CAP + FRAME + board + FRAME;
  const files = flip ? "hgfedcba" : "abcdefgh";
  const ranks = flip ? "12345678" : "87654321";
  const ox = FRAME;
  const oy = CAP + FRAME;
  const inset = SQ * 0.04;
  const pw = SQ * 0.92;

  let defs = "";
  defs += `<clipPath id="board-clip"><rect x="${ox}" y="${oy}" width="${board}" height="${board}"/></clipPath>`;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = ox + col * SQ;
      const y = oy + row * SQ;
      defs += `<clipPath id="s${row}${col}"><rect x="${x}" y="${y}" width="${SQ}" height="${SQ}"/></clipPath>`;
    }
  }

  let body = "";
  body += `<image href="${GREY}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
  body += `<rect width="${width}" height="${CAP + 8}" fill="rgba(255,255,255,0.35)"/>`;
  body += `<text x="${width / 2}" y="38" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" fill="${INK}">${xml(caption || "WhatsApp Chess")}</text>`;
  body += `<rect x="${ox - 6}" y="${oy - 6}" width="${board + 12}" height="${board + 12}" fill="none" stroke="#c9a36a" stroke-width="3"/>`;
  body += `<rect x="${ox - 2}" y="${oy - 2}" width="${board + 4}" height="${board + 4}" fill="none" stroke="#5c6166" stroke-width="2"/>`;
  body += `<image href="${MARBLE}" x="${ox}" y="${oy}" width="${board}" height="${board}" preserveAspectRatio="xMidYMid slice" clip-path="url(#board-clip)"/>`;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = ox + col * SQ;
      const y = oy + row * SQ;
      const dark = (row + col) % 2 === 1;
      if (dark) {
        const tex = 384;
        const offx = (col * 47 + row * 19) % (tex - SQ);
        const offy = (row * 53 + col * 29) % (tex - SQ);
        body += `<image href="${GREY}" x="${x - offx}" y="${y - offy}" width="${tex}" height="${tex}" preserveAspectRatio="none" clip-path="url(#s${row}${col})"/>`;
      }
      const isLast =
        (lastFrom && lastFrom.row === row && lastFrom.col === col) ||
        (lastTo && lastTo.row === row && lastTo.col === col);
      if (isLast) {
        body += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="rgba(232,176,60,0.38)"/>`;
      }
      body += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="none" stroke="rgba(40,22,8,0.18)" stroke-width="1"/>`;
    }
  }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = ox + col * SQ;
      const y = oy + row * SQ;
      const srcRow = flip ? 7 - row : row;
      const srcCol = flip ? 7 - col : col;
      const piece = grid[srcRow][srcCol];
      if (piece && PIECES[piece]) {
        body += `<image href="${PIECES[piece]}" x="${x + inset}" y="${y + inset}" width="${pw}" height="${pw}" preserveAspectRatio="xMidYMax meet"/>`;
      }
    }
  }

  for (let i = 0; i < 8; i++) {
    const cx = ox + i * SQ + SQ / 2;
    body += `<text x="${cx}" y="${oy + board + 28}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="${INK}">${files[i]}</text>`;
    body += `<text x="${ox - 16}" y="${oy + i * SQ + SQ / 2 + 5}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="${INK}">${ranks[i]}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>`;
}

export function boardPng(opts) {
  const svg = boardSvg(opts);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 900 },
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}
