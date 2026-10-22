import { icons } from '@iconify-json/circle-flags'
import { describe, expect, it } from 'vitest'
import { flagNames, flagSvg } from '../src/model/flags'

describe('flagNames', () => {
  it('prefers the region of the core flag, then the language, then the neutral icon', () => {
    expect(flagNames('pt-BR', '🇧🇷')).toEqual(['br', 'lang-pt-br', 'lang-pt', 'xx'])
    expect(flagNames('es_419', undefined)).toEqual(['lang-es-419', 'lang-es', 'xx'])
  })
})

describe('flagSvg', () => {
  it('renders the first icon the set has', () => {
    expect(flagSvg(icons, ['lang-eo', 'xx'])).toBe(flagSvg(icons, ['lang-eo']))
    expect(flagSvg(icons, ['nope', 'xx'])).toBe(flagSvg(icons, ['xx']))
    expect(flagSvg(icons, ['de'])).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">.+<\/svg>$/)
    expect(flagSvg(icons, ['nope'])).toBeUndefined()
  })
})
