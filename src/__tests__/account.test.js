import { describe, it, expect } from 'vitest'
import { accountsWanted, readReturn, paidUntil } from '../lib/account.js'

describe('accountsWanted', () => {
  const at = (hostname, search = '') => ({ hostname, search })

  it('is off without an API', () => {
    expect(accountsWanted('', at('example.org'))).toBe(false)
    expect(accountsWanted('', at('example.org', '?login'))).toBe(false)
  })

  it('is on for a public host', () => {
    expect(accountsWanted('api', at('watercolourlove.markus-freise.de'))).toBe(true)
  })

  it('is off on development hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'colour-detector.test', 'app.localhost']) {
      expect(accountsWanted('api', at(host))).toBe(false)
    }
  })

  it('is on for a development host when the address asks for it', () => {
    expect(accountsWanted('api', at('localhost', '?login'))).toBe(true)
    expect(accountsWanted('api', at('localhost', '?a=1&login=1'))).toBe(true)
  })

  it('does not take a host that only contains "localhost" for a local one', () => {
    expect(accountsWanted('api', at('localhost.example.org'))).toBe(true)
    expect(accountsWanted('api', at('mytest'))).toBe(true)
  })
})

describe('readReturn', () => {
  it('finds a sign-in code', () => {
    const code = 'ab'.repeat(32)
    expect(readReturn(`#magic=${code}`)).toEqual({ magic: code, signedIn: true, handled: true })
  })

  it('refuses a code of another shape', () => {
    expect(readReturn('#magic=abc').handled).toBe(false)
    expect(readReturn(`#magic=${'zz'.repeat(32)}`).handled).toBe(false)
  })

  it('reads the results of signing in and paying', () => {
    expect(readReturn('#login=ok')).toEqual({ signedIn: true, handled: true })
    expect(readReturn('#login=failed').notice.kind).toBe('error')
    expect(readReturn('#login=no-email').notice.kind).toBe('error')
    expect(readReturn('#billing=ok').notice.kind).toBe('paid')
    expect(readReturn('#billing=cancelled').notice.kind).toBe('info')
  })

  it('leaves other fragments alone', () => {
    expect(readReturn('').handled).toBe(false)
    expect(readReturn('#how-to').handled).toBe(false)
  })
})

describe('paidUntil', () => {
  it('formats a time in seconds as a date', () => {
    expect(paidUntil(Date.UTC(2027, 2, 3, 12) / 1000)).toBe('3 March 2027')
  })

  it('is empty without a time', () => {
    expect(paidUntil(null)).toBe('')
  })
})
