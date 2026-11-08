# PixelRoute — RoadPulse Intelligence (flat layout, PWA)

Site (GitHub Pages, repo root): index.html style.css app.js config.js sw.js manifest.webmanifest icon-192.png icon-512.png
Worker (Cloudflare): worker.js schema.sql wrangler.toml
Tests: test.mjs

## Run the tests (Node 22+, no dependencies)
    DIR=. node --test --test-reporter=spec test.mjs

## Cloudflare deployment
1. npm i -g wrangler && wrangler login
2. wrangler d1 create roadpulse  -> paste database_id into wrangler.toml
3. wrangler d1 execute roadpulse --remote --file=schema.sql
   (An already-created D1 database keeps its old tables; CREATE IF NOT EXISTS will not add the new CHECK constraints. Drop the fares table first if it holds no data you need.)
4. Set ALLOWED_ORIGIN in wrangler.toml to https://pixelprotech-za.github.io (origin only, no path)
5. wrangler secret put ADMIN_TOKEN   (24+ random characters; the admin API stays disabled if shorter)
6. wrangler deploy
7. Verify: open <worker-url>/api/health — expect {"ok":true,"db":"connected"}
8. Put the worker URL in config.js as API_BASE and commit. Until then the app runs in DEVICE-ONLY mode.
9. Add a Cloudflare Rate Limiting rule on /api/* (the in-Worker limiter is per-isolate, best effort).

If your API is not on *.workers.dev, add its origin to connect-src in the CSP meta tag in index.html.
Never put ADMIN_TOKEN in any file in this repo.
