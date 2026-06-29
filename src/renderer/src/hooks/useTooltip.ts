/**
 * useTooltip — Global tooltip portal system.
 *
 * Uses mouseover/mouseout (which bubble and expose relatedTarget) instead of
 * mouseenter/mouseleave so moving between child elements inside a [data-tooltip]
 * element (e.g. button → inner SVG icon) doesn't incorrectly trigger hide().
 *
 * Renders a single position:fixed div appended to <body>, escaping all
 * overflow:hidden ancestors so the tooltip is never clipped.
 *
 * Call once at app root: useTooltip()
 */
import { useEffect } from 'react'

const OFFSET = 8 // px gap between element edge and tooltip

export function useTooltip(): void {
  useEffect(() => {
    // Ensure the portal root exists
    let root = document.getElementById('tooltip-root')
    if (!root) {
      root = document.createElement('div')
      root.id = 'tooltip-root'
      document.body.appendChild(root)
    }

    // Single shared tooltip element
    const tip = document.createElement('div')
    tip.className = 'app-tooltip'
    root.appendChild(tip)

    let showTimer: ReturnType<typeof setTimeout> | null = null
    let current: Element | null = null

    const show = (el: Element) => {
      const text = el.getAttribute('data-tooltip')
      if (!text) return

      // Set text and move off-screen so we can measure width/height
      tip.textContent = text
      tip.classList.remove('visible', 'pos-above', 'pos-below')
      tip.style.visibility = 'hidden'
      tip.style.top = '0'
      tip.style.left = '0'

      requestAnimationFrame(() => {
        // Guard: tooltip element might have been removed if unmounted
        if (!tip.isConnected) return

        const rect = el.getBoundingClientRect()
        const tipW = tip.offsetWidth
        const tipH = tip.offsetHeight
        const vw = window.innerWidth
        const vh = window.innerHeight

        // Prefer above; flip below only if not enough space above
        const spaceAbove = rect.top
        const goBelow = spaceAbove < tipH + OFFSET + 4

        let top: number
        if (goBelow) {
          top = rect.bottom + OFFSET
          tip.classList.add('pos-below')
        } else {
          top = rect.top - tipH - OFFSET
          tip.classList.add('pos-above')
        }

        // Center horizontally, clamped inside viewport
        let left = rect.left + rect.width / 2 - tipW / 2
        left = Math.max(8, Math.min(left, vw - tipW - 8))

        tip.style.top = `${top}px`
        tip.style.left = `${left}px`
        tip.style.visibility = ''
        tip.classList.add('visible')
      })
    }

    const hide = () => {
      if (showTimer) { clearTimeout(showTimer); showTimer = null }
      tip.classList.remove('visible')
      current = null
    }

    // mouseover bubbles — fires when mouse enters el or any descendant
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tooltip]') ?? null
      if (!el) {
        // Mouse moved over something outside any tooltip element
        if (current) hide()
        return
      }
      if (el === current) return // still inside the same tooltip element — no change

      // Switching to a different tooltip element: cancel any pending show first
      if (showTimer) { clearTimeout(showTimer); showTimer = null }
      tip.classList.remove('visible')

      current = el
      showTimer = setTimeout(() => show(el), 400)
    }

    // mouseout bubbles — fires when mouse leaves el or any descendant
    const onOut = (e: MouseEvent) => {
      if (!current) return
      const related = e.relatedTarget as Element | null
      // If the mouse moved to a child/descendant of the current element, stay
      if (related && current.contains(related)) return
      // If the mouse moved to the current element itself (from a child), stay
      if (related === current) return
      hide()
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('mousedown', hide, true)
    document.addEventListener('scroll', hide, true)

    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('mousedown', hide, true)
      document.removeEventListener('scroll', hide, true)
      tip.remove()
    }
  }, [])
}
