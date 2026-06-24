'use client'

import { useEffect } from 'react'

const scrollLockDatasetKey = 'aivaScrollLocked'
const scrollAllowedSelector = '[data-aiva-scroll-lock-allow="true"]'

function recoverOrphanedScrollLock() {
  const looksLikeAivaScrollLock =
    document.body.dataset[scrollLockDatasetKey] === 'true' ||
    (document.body.style.position === 'fixed' &&
      document.body.style.overflow === 'hidden' &&
      document.body.style.top.startsWith('-'))

  if (!looksLikeAivaScrollLock) {
    return
  }

  const lockedTop = document.body.style.top
  const restoreY = lockedTop ? Math.max(0, Number.parseInt(lockedTop, 10) * -1) : window.scrollY

  document.body.style.overflow = ''
  document.body.style.overscrollBehavior = ''
  document.body.style.touchAction = ''
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.width = ''
  document.documentElement.style.overscrollBehavior = ''
  delete document.body.dataset[scrollLockDatasetKey]
  window.scrollTo(0, restoreY)
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) {
      recoverOrphanedScrollLock()
      return
    }

    const previousOverflow = document.body.style.overflow
    const previousOverscrollBehavior = document.body.style.overscrollBehavior
    const previousTouchAction = document.body.style.touchAction
    const previousPosition = document.body.style.position
    const previousTop = document.body.style.top
    const previousWidth = document.body.style.width
    const previousDocumentOverscrollBehavior = document.documentElement.style.overscrollBehavior
    const scrollY = window.scrollY
    let touchStartY = 0

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.touchAction = previousTouchAction
    document.documentElement.style.overscrollBehavior = 'none'
    document.body.dataset[scrollLockDatasetKey] = 'true'

    const findAllowedScrollElement = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return null
      }

      return target.closest(scrollAllowedSelector) as HTMLElement | null
    }

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0
    }

    const onTouchMove = (event: TouchEvent) => {
      const scrollElement = findAllowedScrollElement(event.target)

      if (!scrollElement) {
        event.preventDefault()
        return
      }

      const currentY = event.touches[0]?.clientY ?? touchStartY
      const deltaY = currentY - touchStartY
      const canScroll = scrollElement.scrollHeight > scrollElement.clientHeight
      const isAtTop = scrollElement.scrollTop <= 0
      const isAtBottom =
        scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 1

      if (!canScroll || (isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0)) {
        event.preventDefault()
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (!findAllowedScrollElement(event.target)) {
        event.preventDefault()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('wheel', onWheel)
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscrollBehavior
      document.body.style.touchAction = previousTouchAction
      document.body.style.position = previousPosition
      document.body.style.top = previousTop
      document.body.style.width = previousWidth
      document.documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior
      delete document.body.dataset[scrollLockDatasetKey]
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
