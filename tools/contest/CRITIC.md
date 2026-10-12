# Instructions for the rendering critic (one per team and round)

You judge pictures, not code. A paint-by-numbers web app turns a photo into flat colour areas that
a watercolour painter traces and fills in. The owner's complaint about the current version: the
areas are restless (ragged outlines, specks, mottled zones) and should be "way smoother", while the
picture stays recognisable. One team has changed the algorithm; you say how good the result is.

SMOOTH is /private/tmp/claude-501/-Users-markus-freise-Sites-colour-detector/858e9cb3-4e2a-4303-9380-7b1634b86d3a/scratchpad/smooth.
Look at (Read tool on the PNG files):
- SMOOTH/photos/sheet-photos.png: the six photos (meadow, family, stage, portrait, street, idwal);
  single photos are in SMOOTH/photos/<name>.png.
- SMOOTH/baseline/: the current version, rendered as the app draws it in its default "Mixed paint"
  view with outlines: sheet-s0.png and closeups-s0.png (default settings), sheet-s4.png and
  closeups-s4.png (the "Simplify areas" slider at 4), single pictures <name>-s0.png, <name>-s4.png,
  and metrics.txt.
- the team's folder given in your task, with the same files. Open single pictures of it wherever a
  sheet is too small to judge; always look at family, meadow and portrait singly at s0.
Figures in metrics.txt: areas, specks (areas under 40 px), border (outline length per 1,000 px),
ragged (lower is smoother), dE (mean distance to the photo; lower is closer), ms.

Judge as a painter who has to trace these outlines onto paper and fill them in:
1. Smoothness: are the outlines calm curves a brush can follow? Any specks, frayed edges, mottled
   zones, staircase steps, comb-like fringes?
2. Readability: is the subject still clear? Do the small things that matter survive: eyes and
   mouths (family, portrait), the profile of the face (meadow), the yellow spire (street), the
   caption box (stage)? Has anything turned into meaningless blobs?
3. Paintability: is the number and size of areas sensible for a brush? Not thousands, and not so
   few that the picture is empty.
4. Colour: are the colours still those of the photo, with the variety the photo has?
5. Both settings: default (s0) must already be calm; s4 must be calmer still, not broken.
6. New faults the change brought in (blockiness, smeared edges, halos, shapes that look artificial).

Report, concisely:
- what is clearly better than the baseline, what is worse, per photo where it matters;
- the three most important things still wrong, most important first, each with the photo and place
  where you see it, concrete enough for a developer to act on;
- your satisfaction as one number from 0 to 100. Scale: the baseline is about 30. 50 = clearly
  better but a painter would still curse. 70 = good, with visible faults. 86 = "I would ship this:
  a painter can comfortably trace and paint it, and the picture reads well". 95 = hard to improve.
  Do not round up out of kindness, and do not hold back points for faults you cannot point to.
End your report with a line of exactly this form: SATISFACTION: <number>
