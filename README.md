# PixelRoute (flat layout, PWA)
All files sit in one folder. Upload them to a NEW repo (not pixel-core: app.js, config.js, index.html, style.css and sw.js would overwrite yours).

Site (GitHub Pages, root): index.html style.css app.js config.js sw.js manifest.webmanifest icon-192.png icon-512.png
Worker (Cloudflare): worker.js schema.sql wrangler.toml

Worker setup: wrangler login -> wrangler d1 create roadpulse (paste id into wrangler.toml) ->
wrangler d1 execute roadpulse --remote --file=schema.sql -> set ALLOWED_ORIGIN ->
wrangler secret put ADMIN_TOKEN -> wrangler deploy.
Then put the workers.dev URL in config.js as API_BASE and commit.
The service worker caches the app shell for offline use and caches /api/ responses (any origin) as a fallback; cached API data is flagged as such in the app.
