# Contest harness

Used for the smoothing contest of TASK-33 (three teams, each with an algorithm developer, a rendering critic and a quality reviewer; scores in `scores.txt`). Kept so that a later contest, for example for the sketch (TASK-39), can start from it.

- `BRIEF.md`, `ALGO.md`, `CRITIC.md`, `QUALITY.md`: the briefs for the teams and roles.
- `run.sh <repo path> <out dir>`: renders the six sample photos with that checkout's `src/lib` the way the app draws mix mode, and writes contact sheets and `metrics.txt`.
- `photos.py`: prepares the photos from `public/sample-*.webp` and `local-samples/` (four of the six are not in the repo; needs Python with Pillow). `photos/` is not committed.
