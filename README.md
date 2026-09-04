# WhatsApp Chess

Two people play chess by sending **one link per turn** in WhatsApp.

WhatsApp will not inject moves into a chat for ordinary users (that needs Meta’s Business Cloud API and a bot number). This app does not fight that. After you move, you tap **Send this turn on WhatsApp**. The opponent opens the link, sees the updated board, moves, and sends it back.

The position lives in the URL (`fen` + whose colour you are). No account, no database.

## Run

```powershell
cd $env:USERPROFILE\whatsapp-chess
node server.mjs
```

Open http://127.0.0.1:3847

On your phone, the WhatsApp button only works if the link is a **public https URL**. Localhost links cannot be opened by your opponent.

## Render

Live URL after deploy: `https://whatsapp-chess.onrender.com` (Render may add a suffix if the name is taken).

Repo: `https://github.com/cricketlocal/whatsapp-chess`

Blueprint: `render.yaml` — Node web service, `node server.mjs`, health check `/`.

Optional: in the Render dashboard set `XAI_API_KEY` (from https://console.x.ai) so **Ask Grok for a hint** works. The game works without it.

Free instances sleep when idle; the first tap after a while can take ~30 seconds.

## Optional Grok hints (SpaceXAI)

1. Create a key at https://console.x.ai
2. Copy `.env.example` to `.env` and set `XAI_API_KEY`
3. Restart the server

Hints call `https://api.x.ai/v1/responses` with **grok-4.6**. The key stays on the server, never in the browser.

The game works without a key.

## Play

1. Open the site — you are White.
2. **Send this turn on WhatsApp** (even before the first move, to invite).
3. Opponent opens the link as Black, moves, sends back.
4. Repeat until checkmate or draw.

**Copy link** if you would rather paste into an existing WhatsApp thread.
