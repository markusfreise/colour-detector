Deploy `develop` to `main` — this goes live immediately via the webhook (no stage).

1. Check: clean working tree, `npm test` and `npm run build` green, `develop` up to date.
2. Show me `git log main..develop --oneline` and wait for my explicit OK.
3. Merge `develop` → `main` and push.
4. After ~2 minutes check https://markus-freise.de/colour-detective/ returns 200 and serves the new build
   (compare the asset hash in `index.html` with the local `dist/index.html`).

On any failure: stop, roll nothing back, report the state. The deploy log lives on the server (see `webhook-config.php` → `log_file`).
