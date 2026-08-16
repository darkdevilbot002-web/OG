# OGxISAI License Server (for Render)

This is the **backend** that validates buyer keys and releases **all powers**.
You ship buyers only the browser extension (frontend); the keys you create here
unlock it.

## How the flow works
1. You mint a key (admin) → e.g. `OGX-...`
2. You send the key to a buyer.
3. Buyer installs the extension, a **LOCK screen** appears asking for the key.
4. Buyer enters the key → extension calls `POST /api/verify` on this server.
5. Valid → server returns `powers: ["all"]` → full control panel unlocks and
   the key gets bound to that buyer's device (no sharing).
6. If you revoke the key later (admin), the next time the buyer opens the panel
   the extension re-checks and re-locks. No more powers.

## Deploy on Render
1. Push this folder's contents to a repo (include `server/`).
2. On Render → **New → Blueprint** (or Web Service) → your repo → root dir = `server/`.
   `render.yaml` is included for Blueprint deploy.
3. Set env vars (Blueprint does it from `render.yaml`):
   - `ADMIN_KEY` = a long random secret (you will use it to mint keys).
   - `MONGODB_URI` = *(recommended)* free MongoDB Atlas string so keys survive
     restarts. If you leave it empty, keys live in `data/keys.json` (ephemeral on
     the free plan — a restart wipes them).
   - `SEED_KEYS` = *(optional)* comma-separated keys to recreate after restarts.
4. Note the app URL, e.g. `https://ogxisai-license.onrender.com`.

## Mint keys (you) — after deploying
```bash
# 30-day pro key
curl -X POST https://<your-app>.onrender.com/api/keys \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{"days":30}'

# lifetime pro key
curl -X POST https://<your-app>.onrender.com/api/keys \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{"plan":"pro","days":0}'

# list all keys
curl https://<your-app>.onrender.com/api/keys \
  -H "x-admin-key: YOUR_ADMIN_KEY"

# revoke a buyer's key (kills their powers on next open)
curl -X POST https://<your-app>.onrender.com/api/keys/revoke \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{"key":"OGX-AAAA-BBBB-CCCC"}'
```

## Run locally
```bash
cd server
npm install
npm start        # http://localhost:3000  (Admin key is printed on boot)
```

## Point the extension to your server
Open the shipped `content.js` and replace the placeholder with your live URL:

```js
s.dataset.apiBase = 'https://<your-app>.onrender.com'; // ← set this
```

Then repack the extension. Buyers get only the extension folder — never this
`sdk/` backend, never `ADMIN_KEY`.