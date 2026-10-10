import { isNative } from './lib/native.js'

// The app in the App Store is called Tintmap; the website keeps its name.
export const APP_NAME = isNative ? 'Tintmap' : 'Colour Detector'

// Google Analytics 4 measurement ID ("G-XXXXXXXXXX"). Empty = no analytics and no consent banner.
// VITE_GA_ID overrides it for a single build or dev session.
// The app never loads analytics.
export const GA_MEASUREMENT_ID = isNative ? '' : import.meta.env.VITE_GA_ID || ''
