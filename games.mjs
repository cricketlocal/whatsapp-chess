import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ALPH = "23456789abcdefghjkmnpqrstuvwxyz";
const ID_RE = /^[a-z0-9]{8}$/;
const MAX_GAMES = 400;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

fs.mkdirSync(DIR, { recursive: true });

export function isGameId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

function newId() {
  const bytes = crypto.randomBytes(8);
  let id = "";
  for (const b of bytes) id += ALPH[b % ALPH.length];
  return id;
}

function fileFor(id) {
  return path.join(DIR, id + ".json");
}

function read(id) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(id), "utf8"));
  } catch {
    return null;
  }
}

function write(rec) {
  fs.writeFileSync(fileFor(rec.id), JSON.stringify(rec));
}

function prune() {
  let files;
  try {
    files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  const now = Date.now();
  const rows = files.map((f) => {
    const p = path.join(DIR, f);
    let updated = 0;
    try {
      const rec = JSON.parse(fs.readFileSync(p, "utf8"));
      updated = Date.parse(rec.updated || rec.created) || 0;
    } catch {
      updated = 0;
    }
    let mtime = updated;
    try {
      mtime = fs.statSync(p).mtimeMs;
    } catch {}
    return { p, t: Math.max(updated, mtime) };
  });
  for (const row of rows) {
    if (now - row.t > MAX_AGE_MS) {
      try { fs.unlinkSync(row.p); } catch {}
    }
  }
  const left = rows.filter((r) => now - r.t <= MAX_AGE_MS).sort((a, b) => a.t - b.t);
  while (left.length > MAX_GAMES) {
    const drop = left.shift();
    try { fs.unlinkSync(drop.p); } catch {}
  }
}

export function createGame() {
  prune();
  let id = newId();
  while (read(id)) id = newId();
  const now = new Date().toISOString();
  const rec = {
    id,
    fen: START,
    moves: [],
    last: "",
    san: "",
    created: now,
    updated: now,
  };
  write(rec);
  return rec;
}

export function getGame(id) {
  if (!isGameId(id)) return null;
  return read(id);
}

export function saveGame(id, patch) {
  const rec = getGame(id);
  if (!rec) return null;
  if (typeof patch.fen === "string" && patch.fen.length < 120) rec.fen = patch.fen;
  if (Array.isArray(patch.moves)) rec.moves = patch.moves.map(String).slice(0, 400);
  if (typeof patch.last === "string") rec.last = patch.last.slice(0, 8);
  if (typeof patch.san === "string") rec.san = patch.san.slice(0, 16);
  rec.updated = new Date().toISOString();
  write(rec);
  return rec;
}

export function publicGame(rec) {
  if (!rec) return null;
  return {
    id: rec.id,
    fen: rec.fen,
    moves: rec.moves || [],
    last: rec.last || "",
    san: rec.san || "",
    n: (rec.moves || []).length,
    updated: rec.updated,
  };
}
