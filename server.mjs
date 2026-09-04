import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boardPng, boardSvg } from "./board.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3847);
const MODEL = "grok-4.6";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function originOf(req) {
  const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function boardOpts(url) {
  const san = url.searchParams.get("san") || "";
  const you = url.searchParams.get("you") === "b" ? "b" : "w";
  return {
    fen: url.searchParams.get("fen") || START,
    last: url.searchParams.get("last") || "",
    flip: you === "b",
    caption: san ? `I made my move: ${san}` : "WhatsApp Chess — your move",
  };
}

function injectShareMeta(html, { pageUrl, imageUrl, title, description }) {
  const block = [
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta property="og:image" content="${esc(imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${esc(imageUrl)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="900">`,
    `<meta property="og:image:height" content="1020">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${esc(imageUrl)}">`,
  ].join("\n  ");
  if (html.includes('property="og:title"')) {
    html = html.replace(/<meta property="og:title"[^>]*>/, "");
    html = html.replace(/<meta property="og:description"[^>]*>/, "");
    html = html.replace(/<meta property="og:type"[^>]*>/, "");
  }
  return html.replace("</head>", `  ${block}\n</head>`);
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

async function hint(fen) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    const err = new Error("Set XAI_API_KEY for Grok hints (console.x.ai). The game still works without it.");
    err.status = 501;
    throw err;
  }
  const prompt =
    `You are a chess coach. Position FEN: ${fen}. ` +
    `Suggest one good legal move in SAN and one short sentence why. ` +
    `Format: MOVE — reason. No extra lines.`;
  const r = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: prompt }),
  });
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data.error?.message || `SpaceXAI ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const text = data.output_text
    || data.output?.map((o) => o.content?.map((c) => c.text).join("") || "").join("")
    || "";
  return (text || "No hint").trim();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && (url.pathname === "/board.png" || url.pathname === "/board.svg")) {
    try {
      const opts = boardOpts(url);
      if (url.pathname === "/board.svg") {
        res.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        });
        res.end(boardSvg(opts));
        return;
      }
      const png = boardPng(opts);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      });
      res.end(png);
    } catch (err) {
      send(res, 500, err.message || "board render failed");
    }
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    fs.readFile(path.join(PUBLIC, "index.html"), "utf8", (err, html) => {
      if (err) {
        send(res, 404, "Not found");
        return;
      }
      if (url.searchParams.get("fen") || url.searchParams.get("you") || url.searchParams.get("san")) {
        const origin = originOf(req);
        const pageUrl = origin + url.pathname + url.search;
        const imgQs = new URLSearchParams();
        imgQs.set("fen", url.searchParams.get("fen") || START);
        if (url.searchParams.get("last")) imgQs.set("last", url.searchParams.get("last"));
        if (url.searchParams.get("you")) imgQs.set("you", url.searchParams.get("you"));
        if (url.searchParams.get("san")) imgQs.set("san", url.searchParams.get("san"));
        const san = url.searchParams.get("san") || "";
        html = injectShareMeta(html, {
          pageUrl,
          imageUrl: `${origin}/board.png?${imgQs}`,
          title: san ? `I made my move: ${san}` : "WhatsApp Chess — your move",
          description: "Tap the board to play this turn.",
        });
      }
      send(res, 200, html, TYPES[".html"]);
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hint") {
    try {
      const { fen } = JSON.parse(await readBody(req) || "{}");
      if (!fen || typeof fen !== "string") {
        send(res, 400, JSON.stringify({ error: "fen required" }), TYPES[".json"]);
        return;
      }
      const text = await hint(fen);
      send(res, 200, JSON.stringify({ hint: text }), TYPES[".json"]);
    } catch (err) {
      send(res, err.status || 500, JSON.stringify({ error: err.message }), TYPES[".json"]);
    }
    return;
  }

  let filePath = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(PUBLIC)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, buf, TYPES[path.extname(filePath)] || "application/octet-stream");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WhatsApp Chess http://0.0.0.0:${PORT}`);
  console.log(process.env.XAI_API_KEY ? "Grok hints: on (grok-4.6)" : "Grok hints: off (no XAI_API_KEY)");
});
