Deploy `develop` to `main`. It goes live once Markus starts the deploy webhook: batcave builds `main` (`deploy/remote-deploy.sh`) and copies it to watercolourlove.de. No stage.

1. Check: clean working tree, `npm test` and `npm run build` green, `develop` up to date.
2. Show me `git log main..develop --oneline` and wait for my explicit OK.
3. Merge `develop` → `main` and push.
4. Once Markus has started the deploy, check https://watercolourlove.de/ returns 200 and serves the new build
   (compare the asset hash in `index.html` with the local `dist/index.html`).

On any failure: stop, roll nothing back, report the state. The deploy prints its log where it is started (batcave, LXC 114); its settings are in `/etc/watercolourlove/deploy.env` there.
