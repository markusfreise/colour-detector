// Google Analytics 4 loader. Nothing is requested from Google before startAnalytics() is called,
// which happens only after consent.

let started = false

export function startAnalytics(id) {
  if (!id) return
  window[`ga-disable-${id}`] = false
  if (started) return
  started = true
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
  // Consent mode: statistics only, nothing for advertising.
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  window.gtag('js', new Date())
  window.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
}

// Withdrawn consent: stop sending and remove the Analytics cookies.
export function stopAnalytics(id) {
  if (!id) return
  window[`ga-disable-${id}`] = true
  if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' })
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
