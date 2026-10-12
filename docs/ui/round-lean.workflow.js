export const meta = {
  name: 'watercolourlove-ui-round-lean',
  description: 'One lean design round: one surviving design, one combined critic, one prototype',
  phases: [
    { title: 'Revise', detail: 'The maker rewrites the specification in full' },
    { title: 'Check', detail: 'One combined critic, and the prototype rebuilt' },
  ],
}

const REPO = '/var/www/watercolourlove'
const BRIEF = `${REPO}/docs/ui/brief.md`
const ROUND = args.round
const TEAM = args.team
const PRIOR = args.priorSpec
const CRITIQUES = args.critiqueFile
const GRAFTS = args.grafts
const ROLE = args.role

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    specPath: { type: 'string' },
    summary: { type: 'string', description: 'At most 300 words.' },
    changes: { type: 'string', description: 'A numbered list of what changed against the previous specification, each with the critique point it answers, plus anything you rejected and why. This list is the only thing the critic is told about the revision, so it must be honest and complete.' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['specPath', 'summary', 'changes'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    verdict: { type: 'string' },
    regressions: { type: 'array', items: { type: 'string' }, description: 'Points the previous round raised that are still not answered, or answered worse.' },
    mustFix: { type: 'array', items: { type: 'string' } },
    shouldFix: { type: 'array', items: { type: 'string' } },
    genericRisk: { type: 'string' },
    buildable: { type: 'string', description: 'Could a competent implementer build this without inventing anything? Name what is still missing.' },
  },
  required: ['score', 'verdict', 'mustFix', 'genericRisk', 'buildable'],
}

const PROTO_SCHEMA = {
  type: 'object',
  properties: { path: { type: 'string' }, notes: { type: 'string' } },
  required: ['path', 'notes'],
}

phase('Revise')
const made = await agent(`You are the lead designer of the surviving design for Watercolourlove,
"${TEAM.name}". Round ${ROUND}. The two other designs have been cut; their best parts are grafted
onto yours by the instructions below.

${ROLE}

Read in this order:
1. the brief at ${BRIEF} — binding;
2. your specification as it stands, ${PRIOR};
3. the two critiques of it, ${CRITIQUES} — every "mustFix" must be answered, not deflected;
4. the grafts below, which are decisions already taken, not suggestions.

Grafts from the cut designs:
${GRAFTS}

Write the complete new specification to ${REPO}/docs/ui/round-${ROUND}/${TEAM.key}.md with the Write
tool (create the directory first). It must be self-contained: the implementer reads only this file.

Hard rules:
- Answer every "mustFix" of both critiques. For each one, either fix it or say in "changes" why the
  critic is wrong. Silence counts as a failure.
- The phone layout must be proved, not asserted: give a height budget table that sums the real bands
  against 844, 812 and 667 px of viewport height, and show the picture still has room. The same for
  iPad portrait at 1024 px and iPad landscape at 768 px. Arithmetic that does not add up is the
  defect this round exists to remove.
- Every colour pair in light and dark gets a measured contrast ratio. Any pair below 4.5:1 for text
  or 3:1 for a control edge is a defect.
- No emoji, no decorative unicode symbols, no left-border accents, no utility classes. English.
- Plain CSS, BEM, the house token names, the flat file structure from the brief.
- Every feature of the brief's inventory stays reachable and you say where it lives.
- Do not change anything under ${REPO}/src.
Return the path, a short summary, and the numbered change list.`,
  { label: `${TEAM.key}:spec:r${ROUND}`, phase: 'Revise', schema: SPEC_SCHEMA })

if (!made) return { round: ROUND, error: 'no specification produced' }

phase('Check')
const [critique, proto] = await parallel([
  () => agent(`You are two reviewers in one, reviewing round ${ROUND} of the Watercolourlove UI rework.
You hold both roles and you report once.

Role one: a watercolour painter of thirty years, teaching classes, mixing from pans and tubes, who
has tried the usual paint-by-numbers apps and found them useless. You judge from a table with a wet
brush and gloves on: can I read colour 7 and its recipe from across the table; does the screen tell
me what comes next while a wash dries; are the things I touch big enough and the dangerous ones far
from the ones I touch constantly; does it respect light-to-dark, one wash at a time, and my right to
overrule the maths; on the phone at the easel, does it help or is it a form; would I put paint on a
good sheet of paper from this plan.

Role two: an independent senior UX reviewer. You attack information architecture, the phone layout
screen by screen, touch and motor accuracy, feedback and state, accessibility (contrast in both
themes, focus order, meaning carried by colour alone, how a numbered colour list reads to a screen
reader), consistency between mix mode, layer mode and the dialogs, and specification quality —
anything an implementer would have to guess, any missing token or state, any contradiction.
You check the arithmetic yourself: add up the height budgets, and check the contrast ratios the
document claims. A number that does not hold is a must-fix.

Read: the brief at ${BRIEF}, the specification at ${made.specPath}, and the evidence image
${REPO}/docs/ui/evidence/phone-settings-2026-10-12.png.
Do not read the source tree; the previous round already did that.

What the author says changed this round:
${made.changes}

The critiques this revision was answering are at ${CRITIQUES}. Check whether each "mustFix" there is
genuinely answered; anything dodged goes into "regressions".

Be a critic, not a cheerleader. Judge what is written, not what was meant. Name the exact section you
attack. Score strictly: 7 is good, 9 means you cannot find a real fault.`,
    { label: `${TEAM.key}:critic:r${ROUND}`, phase: 'Check', schema: CRITIQUE_SCHEMA }),
  () => agent(`You build the prototype of a design from its specification alone. This is mechanical,
careful work: follow the document, do not improve it.

Read the "Deliverable per round" section of the brief at ${BRIEF}, then the specification at
${made.specPath}.

Write ONE self-contained HTML file to ${REPO}/public/preview/round-${ROUND}/${TEAM.key}.html
(create the directory). Requirements:
- implement the specification exactly: its tokens, type scale, components, states and layout rules at
  every breakpoint. Where it is silent, choose the dullest sensible option and list it in "notes".
- genuinely responsive — phone, iPad portrait, iPad landscape, desktop — with real CSS. No device
  frames, no screenshots, no faking a breakpoint with a switch.
- a light/dark switch that also honours the system setting, and a switch between the screens: the
  stage with the picture, the colour list with a selected recipe, the settings, the paint box, layer
  mode, and one dialog.
- realistic content: a 20-colour list with three-digit paint numbers, a three-paint recipe with a wash
  bar, a seven-layer plan, 54 paints in the box. Pictures are flat colour fields or inline SVG; load
  no external image.
- house rules: no emoji, no decorative unicode symbols, no left-border accents, BEM class names, the
  house token names, the touch sizes from the brief. English only.
- no CDN script, no stylesheet other than the chosen Google font; plain CSS and a little vanilla
  JavaScript for the switches.
- no horizontal scrollbar and no overlapping label at 390 px wide. Check your own height budgets.
Title it "${TEAM.name} — round ${ROUND}" with a one-line note that it is a prototype of a design
proposal. Return the path and your notes.`,
    { label: `${TEAM.key}:prototype:r${ROUND}`, phase: 'Check', schema: PROTO_SCHEMA, model: 'sonnet' }),
])

return { round: ROUND, team: TEAM.key, specPath: made.specPath, summary: made.summary, changes: made.changes, openQuestions: made.openQuestions || [], critique, prototype: proto }
