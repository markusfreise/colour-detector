export const meta = {
  name: 'watercolourlove-ui-round',
  description: 'One design round for the TASK-40 UI rework: three teams, each maker plus painter critic, UX critic and a prototype build',
  phases: [
    { title: 'Design', detail: 'One maker per team writes the full specification' },
    { title: 'Critique', detail: 'A painter and an independent UX reviewer attack it; a prototype is built' },
  ],
}

const REPO = '/var/www/watercolourlove'
const BRIEF = `${REPO}/docs/ui/brief.md`

const ROUND = args.round
const TEAMS = args.teams

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    specPath: { type: 'string', description: 'Absolute path of the specification file you wrote.' },
    summary: { type: 'string', description: 'At most 400 words: what this design is now, in plain words.' },
    changes: { type: 'string', description: 'What you changed this round, and which critique points you rejected and why.' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['specPath', 'summary', 'changes'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: '0-10. Be strict: 7 is good, 9 means you cannot find a real fault.' },
    verdict: { type: 'string' },
    mustFix: { type: 'array', items: { type: 'string' }, description: 'Problems that would make the design fail in use. Name the exact section and what to do instead.' },
    shouldFix: { type: 'array', items: { type: 'string' } },
    keep: { type: 'array', items: { type: 'string' } },
    genericRisk: { type: 'string', description: 'Where it still reads as a default template or an AI-built webapp, and what gives it away.' },
  },
  required: ['score', 'verdict', 'mustFix', 'keep', 'genericRisk'],
}

const PROTO_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    notes: { type: 'string', description: 'What the prototype shows, and where you had to invent something the specification left open.' },
  },
  required: ['path', 'notes'],
}

const ROLES = {
  1: `You are the UX lead of the team. Round 1 of 5: set the foundation — information architecture,
the user's path, the layout at every breakpoint (phone first, then iPad portrait, iPad landscape,
desktop), the touch model, and what lives on the first level versus a second. Decide how mix mode and
layer mode become one interface instead of two. Decide what happens to the floating recipe panel, the
pointer tooltip and the overloaded settings panel.
Read the brief, then the real code: src/App.vue, all of src/components/, src/css/ and
src/stores/analysis.js, plus docs/ui/evidence/phone-settings-2026-10-12.png and
docs/screenshot.png. Do not edit any file in src/.`,
  2: `You are the UI designer of the team. Round 2 of 5: take the structure and the two critiques and
build the visual system on it — the Google font (argued against at least two alternatives, self-hosted,
tabular figures), the full type scale with weights, line heights and how it steps down on a phone,
every colour token for light and dark with measured contrast ratios, spacing scale, radii, shadows,
borders, and the complete component library (buttons in every variant, segmented controls, sliders,
checkboxes, inputs, panels, cards, chips, swatches, dialogs, sheets, lists, the canvas frame) with
every state. Keep the structure the UX lead set unless a critique forces a change; say so if it does.`,
  3: `You are the UX lead again. Round 3 of 5: work the hard parts the first two rounds painted over —
the paint box with several boxes and own paints, layer mode (list, solo, coats, the spot card, the
step walk), close-ups, the AI panel, the account, plan and collection dialogs, the consent banner, the
sign-in gate, print and PDF. Also every empty, loading, error and limit state, and the phone layout of
each of them. Fold both critiques in. Nothing in the feature inventory may still be hand-waved.`,
  4: `You are the UI designer again. Round 4 of 5: polish and prove. Dark mode in full (a designed
second theme, not an inversion), density and rhythm checked against real content (a 32-colour list, a
54-paint box, a seven-layer plan, a three-paint recipe with a wash bar), motion and feedback rules,
the printed sheet and the PDF, the favicon and app icon direction, and a written check of every
contrast pair. Fold both critiques in.`,
  5: `You are the UX lead, writing the final specification. Round 5 of 5: resolve every remaining
critique, remove every contradiction, and turn the document into something that can be implemented
file by file. It must end with: the complete token list ready to paste into properties.css, the CSS
file structure, a per-component migration table (existing file -> what changes), the exact UI copy,
and an ordered implementation plan in steps that each leave the app working.`,
}

function makerPrompt(team) {
  const prior = team.specPath
    ? `
The specification as it stands is at ${team.specPath}. Read it, then rewrite it in full to
${REPO}/docs/ui/round-${ROUND}/${team.key}.md. The new file must be complete and self-contained:
the next round sees only that file.

The painter's critique of the current state:
${JSON.stringify(team.critiques && team.critiques[0], null, 1)}

The independent UX reviewer's critique:
${JSON.stringify(team.critiques && team.critiques[1], null, 1)}

Answer both. Where you reject a point, say why in "changes".`
    : `
Write the specification to ${REPO}/docs/ui/round-${ROUND}/${team.key}.md.`

  return `You are part of a three-person design team reworking the whole interface of Watercolourlove,
a watercolour planning tool. Team "${team.name}".

${team.stance}

${ROLES[ROUND]}

The brief at ${BRIEF} is binding — read it first.

Hard rules for your output:
- The specification file is the deliverable. Write it with the Write tool; create the directory first
  if it does not exist. Return its path, not its contents.
- Write it so a competent implementer can build it without inventing anything: exact token values,
  exact sizes, exact layout rules per breakpoint, exact component states, the exact copy of every
  label, hint and empty state, and a per-file migration note for the existing components.
- Phone, iPad portrait, iPad landscape and desktop are all specified. "It stacks" is not a layout.
- No emoji, no decorative unicode symbols, no left-border accents, no utility classes. English.
- Plain CSS, BEM, the house token names, the flat file structure from the brief.
- Every feature in the brief's inventory stays reachable, and you say where it lives.
- The touch sizes in the brief are acceptance criteria.
- No metaphors without a consequence, no "delightful", no mood board, no marketing voice.
- Do not change anything under ${REPO}/src — this round is design only.
${prior}`
}

const CRITIC_RULES = `
You are a critic, not a cheerleader. Praise only what you would defend in an argument.
Judge the specification as written, not the intention behind it. If a part is too vague to build
from, that is a defect and you say so. Name the exact section you attack.
Do not propose a different design wholesale; improve this one.`

function painterPrompt(team, specPath) {
  return `You are a watercolour painter with thirty years at the easel, not a designer and not a
software person. You teach watercolour classes, you mix from pans and tubes, and you have tried the
usual paint-by-numbers apps and found them useless for real painting.

Read the brief at ${BRIEF}, then the specification at ${specPath} (team "${team.name}", round
${ROUND} of 5).${ROUND === 1 ? ` You may also look at the running app under ${REPO}/src/components/.` : ''}

Judge it the way a painter would, standing at a table with a wet brush and gloves on:
- Can I see from across the table which colour is number 7 and what goes into it?
- While a wash dries, does the screen tell me what comes next?
- Are the things I touch with a gloved, damp hand big enough, and are the dangerous ones (start over,
  delete a picture, change every colour) far from the ones I touch constantly?
- Does it respect how painting works: light to dark, one wash at a time, the photo as a reference and
  not as the truth, and the fact that I will overrule the maths because I know better?
- On the phone, standing at the easel with the picture on the screen: does it help or is it a form?
- Is anything on screen just software noise I would never look at?
- Would I trust this plan enough to put paint on a good sheet of paper?
Say plainly where it would annoy or mislead a painter. Studio reality beats design theory.
${CRITIC_RULES}`
}

function uxPrompt(team, specPath) {
  return `You are a senior UX practitioner brought in as an adversarial reviewer, independent of the
team that wrote this. Your reputation rests on catching what the authors talked themselves past.

Read the brief at ${BRIEF}, then the specification at ${specPath} (team "${team.name}", round
${ROUND} of 5).${ROUND === 1 ? ` The current implementation is at ${REPO}/src — read what you need to check its claims.` : ''}
Also look at ${REPO}/docs/ui/evidence/phone-settings-2026-10-12.png: that is the failure this rework
exists to fix.

Attack it on:
- Information architecture: does the structure match the user's task or the developer's data model?
  Is anything from the feature inventory now unreachable, two levels too deep, or duplicated?
- Phone: is the phone layout actually designed, screen by screen, or described in one sentence?
- Touch and motor accuracy: target sizes, spacing, drag paths, anything needing hover, a tooltip, a
  double tap or precision. iPad in both orientations, gloved hands, a hand resting on the screen.
- Feedback and state: what the user sees while an analysis runs, when nothing is selected, when the
  photo fails to load, when a free account hits a limit, when a recipe cannot be mixed.
- Accessibility: contrast in light and dark, focus order and visible focus, controls carrying meaning
  in colour alone, how a numbered colour list reads to a screen reader, text that scales.
- Consistency: do mix mode and layer mode and the six dialogs really become one design, or is it two
  universes sharing a font?
- Specification quality: anything an implementer would have to guess, any missing token or state, any
  contradiction between two sections.
- Honesty: a design that only works in the author's imagined screenshot.
${CRITIC_RULES}`
}

function protoPrompt(team, specPath) {
  return `You build the prototype of a design, from its specification alone.

Read the brief at ${BRIEF} (the section "Deliverable per round" binds you), then the specification at
${specPath} — team "${team.name}", round ${ROUND} of 5.

Write ONE self-contained HTML file to ${REPO}/public/preview/round-${ROUND}/${team.key}.html
(create the directory first). It must:
- implement the specification as written: its tokens, its type scale, its components, its layout rules
  at every breakpoint. Where the specification is precise, follow it exactly; where it is silent,
  choose the dullest sensible option and list it in "notes".
- be genuinely responsive — phone, iPad portrait, iPad landscape, desktop — with real CSS, no device
  frames, no screenshots, no media-query faking by a switch.
- carry a light/dark switch that also honours the system setting, and a switch between the screens:
  the stage with the picture, the colour list with a selected recipe, the settings, the paint box,
  layer mode, and one dialog.
- use realistic content: a 20-colour list with three-digit paint numbers, a three-paint recipe with a
  wash bar, a seven-layer plan, 54 paints in the box. Pictures may be flat colour fields or an inline
  SVG; do not load an external image.
- obey the house rules: no emoji, no decorative unicode symbols, no left-border accents, BEM class
  names, the house token names, the touch sizes from the brief. English only.
- load no script from a CDN and no stylesheet other than the chosen Google font. Plain CSS and a few
  lines of vanilla JavaScript for the switches, nothing else.
- open on a phone without a horizontal scrollbar and without a single overlapping label.
Title the page "${team.name} — round ${ROUND}" and put a one-line note at the top saying it is a
prototype of a design proposal, with a link back to the other two teams
(../round-${ROUND}/ is the directory; the other files are the other team keys).
Return the path and your notes.`
}

phase('Design')
const results = await parallel(TEAMS.map(team => async () => {
  const made = await agent(makerPrompt(team), { label: `${team.key}:spec:r${ROUND}`, phase: 'Design', schema: SPEC_SCHEMA })
  if (!made) return null
  const specPath = made.specPath
  const [painter, ux, proto] = await parallel([
    () => agent(painterPrompt(team, specPath), { label: `${team.key}:painter:r${ROUND}`, phase: 'Critique', schema: CRITIQUE_SCHEMA }),
    () => agent(uxPrompt(team, specPath), { label: `${team.key}:ux-critic:r${ROUND}`, phase: 'Critique', schema: CRITIQUE_SCHEMA }),
    () => agent(protoPrompt(team, specPath), { label: `${team.key}:prototype:r${ROUND}`, phase: 'Critique', schema: PROTO_SCHEMA }),
  ])
  log(`${team.name}: painter ${painter ? painter.score : '-'} / ux ${ux ? ux.score : '-'}`)
  return {
    key: team.key,
    name: team.name,
    specPath,
    summary: made.summary,
    changes: made.changes,
    openQuestions: made.openQuestions || [],
    critiques: [painter, ux],
    prototype: proto,
  }
}))

return { round: ROUND, teams: results.filter(Boolean) }
