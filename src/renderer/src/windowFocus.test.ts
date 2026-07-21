import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initWindowFocus } from './windowFocus'

const BLURRED = 'is-window-blurred'

describe('initWindowFocus', () => {
  let dispose: (() => void) | undefined

  beforeEach(() => {
    document.body.className = ''
  })

  afterEach(() => {
    dispose?.()
    dispose = undefined
    vi.restoreAllMocks()
  })

  it('stamps the blurred class when the window loses focus', () => {
    dispose = initWindowFocus()
    window.dispatchEvent(new Event('blur'))
    expect(document.body.classList.contains(BLURRED)).toBe(true)
  })

  it('clears the class when focus returns', () => {
    dispose = initWindowFocus()
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    expect(document.body.classList.contains(BLURRED)).toBe(false)
  })

  it('seeds from the current focus state rather than assuming focused', () => {
    // The renderer can finish booting while the user is already in another
    // window. Assuming focused would leave the tint stuck off until the next
    // focus change, which may never come.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    dispose = initWindowFocus()
    expect(document.body.classList.contains(BLURRED)).toBe(true)
  })

  it('removes the class and stops listening once disposed', () => {
    dispose = initWindowFocus()
    dispose()
    dispose = undefined
    window.dispatchEvent(new Event('blur'))
    expect(document.body.classList.contains(BLURRED)).toBe(false)
  })
})
