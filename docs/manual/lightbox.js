// The pictures of the manual at full size: a click on a screenshot or a photo opens it in a
// dialog over the page, with its numbered markers and its caption. The arrows and the arrow keys
// go to the picture before or after it on the page; Escape, the close button or a click beside
// the picture closes it. Without this script a screenshot still opens as a file.
;(() => {
  const words = document.body.dataset
  const figures = () => [...document.querySelectorAll('figure.shot, figure.photo:not(.photo--missing)')]
  let current = -1

  const dialog = document.createElement('dialog')
  dialog.className = 'lightbox'
  dialog.innerHTML = `
    <div class="lightbox__stage"></div>
    <p class="lightbox__caption"></p>
    <button class="lightbox__button lightbox__button--close" type="button" aria-label="${words.lightboxClose}">&times;</button>
    <button class="lightbox__button lightbox__button--prev" type="button" aria-label="${words.lightboxPrev}">&lsaquo;</button>
    <button class="lightbox__button lightbox__button--next" type="button" aria-label="${words.lightboxNext}">&rsaquo;</button>`
  document.body.append(dialog)
  const stage = dialog.querySelector('.lightbox__stage')
  const caption = dialog.querySelector('.lightbox__caption')

  function show(index) {
    const list = figures()
    if (!list.length) return
    current = (index + list.length) % list.length
    const figure = list[current]
    // The frame with its markers, so that the numbers of the list under it still point right.
    const frame = (figure.querySelector('.shot__frame, .photo__frame') ?? figure).cloneNode(true)
    frame.classList.add('lightbox__frame')
    const img = frame.querySelector('img')
    if (img) img.loading = 'eager'
    // The picture at the size it was taken, no larger than the window.
    const width = Number(img?.getAttribute('width')) || img?.naturalWidth || 0
    if (width) frame.style.setProperty('--lightbox-width', `${width}px`)
    stage.replaceChildren(frame)
    caption.textContent = figure.querySelector('figcaption')?.textContent ?? ''
    dialog.querySelector('.lightbox__button--prev').hidden = list.length < 2
    dialog.querySelector('.lightbox__button--next').hidden = list.length < 2
    if (!dialog.open) dialog.showModal()
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('figure.shot a.shot__zoom, figure.photo:not(.photo--missing) img')
    if (!target || event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    show(figures().indexOf(target.closest('figure')))
  })

  dialog.addEventListener('click', (event) => {
    if (event.target.closest('.lightbox__button--close')) return dialog.close()
    if (event.target.closest('.lightbox__button--prev')) return show(current - 1)
    if (event.target.closest('.lightbox__button--next')) return show(current + 1)
    // Beside the picture: the backdrop, the stage around it, the caption.
    if (!event.target.closest('.lightbox__frame')) dialog.close()
  })

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(current - 1)
    else if (event.key === 'ArrowRight') show(current + 1)
  })

  dialog.addEventListener('close', () => stage.replaceChildren())
})()
