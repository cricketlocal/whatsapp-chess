import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3847);
const MODEL = "grok-4.6";

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
