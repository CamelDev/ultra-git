import { describe, expect, it } from 'bun:test'
import { getAuthorColor } from '../authorColor'

describe('getAuthorColor', () => {
  it('returns consistent color object for same input', () => {
    const color1 = getAuthorColor('Alice Smith', 'alice@example.com')
    const color2 = getAuthorColor('Alice Smith', 'alice@example.com')
    expect(color1).toEqual(color2)
  })

  it('produces different colors for different authors', () => {
    const alice = getAuthorColor('Alice Smith', 'alice@example.com')
    const bob = getAuthorColor('Bob Jones', 'bob@example.com')
    expect(alice.color).not.toEqual(bob.color)
  })

  it('handles fallback when email or name is missing', () => {
    const colorOnlyName = getAuthorColor('Charlie')
    expect(colorOnlyName).toHaveProperty('backgroundColor')
    expect(colorOnlyName).toHaveProperty('borderColor')
    expect(colorOnlyName).toHaveProperty('color')

    const colorUndefined = getAuthorColor(undefined, undefined)
    expect(colorUndefined).toHaveProperty('backgroundColor')
  })

  it('is case insensitive and trims whitespace', () => {
    const color1 = getAuthorColor('Alice ', ' ALICE@example.com ')
    const color2 = getAuthorColor('alice', 'alice@example.com')
    expect(color1).toEqual(color2)
  })
})
