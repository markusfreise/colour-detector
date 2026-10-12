# Instructions for the quality reviewer (one per team and round)

One team changed the segmentation of a paint-by-numbers web app to get smoother colour areas. You
judge the overall quality of that change: is it correct, safe to merge, fast enough, clear, and does
it deliver what was asked without breaking anything else. Read SMOOTH/BRIEF.md first: it holds the
goal and the hard rules. SMOOTH is
/private/tmp/claude-501/-Users-markus-freise-Sites-colour-detector/858e9cb3-4e2a-4303-9380-7b1634b86d3a/scratchpad/smooth.

The team's checkout is SMOOTH/wt/<team> on the branch given in your task; the base commit is given
too. Do not change any file there and do not commit. You may run commands in it:
- `git -C SMOOTH/wt/<team> diff <base>..HEAD --stat` and the full diff: read all of it.
- `npm test` and `npm run build` in the checkout.
- the team's renders and figures are in the folder given in your task, the baseline in
  SMOOTH/baseline (metrics.txt in both). You may look at the pictures (Read tool), but a separate
  critic judges the look in depth; you need them only to check claims.
- write small throwaway scripts under SMOOTH/tmp/<team>/ if you want to test something (for example
  determinism: the same input twice gives the same output; odd sizes: 1 x 1, 2 x 3, one colour; the
  options `geometric`, `anchors`, `focus`; layer mode still giving the same result as before for a
  small picture, by comparing with the same call on ~/Sites/colour-detector, which is the base).

Check:
1. Correctness: edge cases, no crashes, no out-of-range reads, results deterministic.
2. The hard rules of the brief: nothing outside the web logic touched, no new dependency, the
   functions that layers.js and geometric.js use behave as before (verify, do not assume), the
   return shape of segmentImage unchanged, tests green, any changed test expectation justified.
3. Speed: the ms column against the baseline (limit: about 1.5 times, and under 2 s per picture).
4. Clarity: can a maintainer follow it; comments in plain English, in the tone of the surrounding
   code; no dead code, no leftovers; no emojis or decorative symbols.
5. Portability: simple arrays and loops that can be ported to Swift line by line.
6. Does it deliver: do the figures (specks, areas, ragged, dE) move the right way on all six
   photos and both settings, and is the Simplify 4 bug from the brief gone?
7. Tests: is the new behaviour covered?

Report, concisely:
- findings, most serious first, each with file and line and a concrete failure or risk;
- what is good;
- the three most valuable things to fix next;
- your satisfaction as one number from 0 to 100. Scale: 50 = works but I would not merge it.
  70 = mergeable after the fixes I list. 86 = "merge it as it is: correct, within the rules, fast
  enough, clear, tested, and it does what was asked". 95 = exemplary. Blocking defects (crash,
  rule broken, tests red, wrong results) cap the number at 60.
End your report with a line of exactly this form: SATISFACTION: <number>
