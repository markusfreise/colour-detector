// Google Analytics 4 loader. Nothing is requested from Google before start() is called.

let started = false

export function startAnalytics(id) {
  if (!id || started) return
  started = true
  window[`ga-disable-${id}`] = false
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', id)
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
}

// Withdrawn consent: stop sending and remove the Analytics cookies.
export function stopAnalytics(id) {
  if (!id) return
  window[`ga-disable-${id}`] = true
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim()
    if (!name.startsWith('_ga')) continue
    const host = location.hostname
    const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]
    domains.forEach((domain) => {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`
    })
  }
}
