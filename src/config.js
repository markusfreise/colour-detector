import { isNative } from './lib/native.js'

// The app in the App Store is called Tintmap; the website keeps its name.
export const APP_NAME = isNative ? 'Tintmap' : 'Colour Detector'

// Google Analytics 4 measurement ID ("G-XXXXXXXXXX"). Empty = no analytics and no consent banner.
// VITE_GA_ID overrides it for a single build or dev session.
// The app never loads analytics.
export const GA_MEASUREMENT_ID = isNative ? '' : import.meta.env.VITE_GA_ID || ''

// Where the account API answers ("api" next to the app). Empty = no accounts: the app opens without
// signing in and nothing is locked. A production build has accounts only with VITE_ACCOUNT_API set
// (e.g. in .env.production.local on the server); the dev server looks for a local API under /api.
// The app from the App Store has its own purchase and never signs in here.
export const ACCOUNT_API = isNative ? '' : import.meta.env.VITE_ACCOUNT_API ?? (import.meta.env.DEV ? 'api' : '')
