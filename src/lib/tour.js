// Where the card of the guided tour goes (GuidedTour.vue): beside what it points at, on the first
// side with room in this order: right, left, below, above; always inside the window.

/** The rectangle around several, or null when none has a size (hidden or folded away). */
export function unionRect(rects) {
  const seen = rects.filter((r) => r && r.width > 0 && r.height > 0)
  if (!seen.length) return null
  const left = Math.min(...seen.map((r) => r.left))
  const top = Math.min(...seen.map((r) => r.top))
  const right = Math.max(...seen.map((r) => r.left + r.width))
  const bottom = Math.max(...seen.map((r) => r.top + r.height))
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * The card's top left corner. `target` and `card` as { left, top, width, height } / { width, height },
 * `view` the window's { width, height }; `gap` between target and card, `gutter` to the window's edge.
 */
export function placeCard(target, card, view, gap = 12, gutter = 16) {
  const clampX = (x) => Math.min(Math.max(x, gutter), view.width - gutter - card.width)
  const clampY = (y) => Math.min(Math.max(y, gutter), view.height - gutter - card.height)
  if (!target) return { left: clampX((view.width - card.width) / 2), top: clampY((view.height - card.height) / 2), side: 'centre' }
  const middleY = clampY(target.top + target.height / 2 - card.height / 2)
  const middleX = clampX(target.left + target.width / 2 - card.width / 2)
  const right = target.left + target.width + gap
  if (right + card.width <= view.width - gutter) return { left: right, top: middleY, side: 'right' }
  const left = target.left - gap - card.width
  if (left >= gutter) return { left, top: middleY, side: 'left' }
  const below = target.top + target.height + gap
  if (below + card.height <= view.height - gutter) return { left: middleX, top: below, side: 'below' }
  const above = target.top - gap - card.height
  if (above >= gutter) return { left: middleX, top: above, side: 'above' }
  // No side has room (a large target on a small screen): over it, at the bottom of the window.
  return { left: middleX, top: clampY(view.height - gutter - card.height), side: 'over' }
}
