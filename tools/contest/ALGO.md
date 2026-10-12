# Instructions for an algorithm developer (one per team and round)

Read SMOOTH/BRIEF.md first and follow it exactly.

You work in your team's own checkout of the repo: SMOOTH/wt/<team> (a git worktree with node_modules
linked in; `npm test` and `npm run build` work there). Stay in that directory: do not edit files in
~/Sites/colour-detector or in the other teams' checkouts. The branch for this round is already
checked out. Commit your work on it when done (local only; message `feat(TASK-33): <summary>`,
ending with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`).

Look at the baseline renders in SMOOTH/baseline and the photos in SMOOTH/photos before deciding
what to do, and measure what you try rather than guessing. Your team has an angle (given in your
task), but you are free to combine it with other ideas when they clearly help.

Work loop: change src/lib (mainly segment.js; a new file is fine if it keeps things clear), run
`SMOOTH/run.sh SMOOTH/wt/<team> SMOOTH/r<round>/<team>`, look at sheet-s0.png, sheet-s4.png,
closeups-s0.png and closeups-s4.png (Read tool on the PNGs) next to the baseline ones, read
metrics.txt, iterate. Check that small things that matter survive (eyes and mouths, the profile of
the face in the meadow photo, the yellow spire, the caption box). Keep `npm test` green and
`npm run build` working. The final render in SMOOTH/r<round>/<team> must be from your committed code.

Report back, concisely:
- the branch and commit hash;
- what you changed and why it works (a short paragraph);
- the metrics of baseline against yours for all twelve rows;
- what got worse or is still weak;
- test and build results (the output lines);
- your own satisfaction with the result as a number from 0 to 100, where 86 means "I would ship
  this: a painter could comfortably trace and paint these areas", with two or three reasons.
Be honest: other agents judge the renders and the code independently.
