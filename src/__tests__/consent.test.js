import { describe, expect, it } from 'vitest'
import { CONSENT_MAX_AGE, CONSENT_VERSION, validChoice } from '../lib/consent.js'

describe('validChoice', () => {
  const now = Date.UTC(2026, 9, 15)
  const choice = { analytics: true, version: CONSENT_VERSION, at: now - 1000 }

  it('keeps a recent choice of this version', () => {
    expect(validChoice(choice, now)).toEqual(choice)
    expect(validChoice({ ...choice, analytics: false }, now)?.analytics).toBe(false)
  })

  it('asks again after 13 months, for another version, or for anything unreadable', () => {
    expect(validChoice({ ...choice, at: now - CONSENT_MAX_AGE - 1 }, now)).toBeNull()
    expect(validChoice({ ...choice, version: CONSENT_VERSION - 1 }, now)).toBeNull()
    expect(validChoice({ ...choice, at: now + 60_000 }, now)).toBeNull()
    expect(validChoice('granted', now)).toBeNull()
    expect(validChoice(null, now)).toBeNull()
    expect(validChoice({ analytics: 'yes', version: CONSENT_VERSION, at: now }, now)).toBeNull()
  })
})
