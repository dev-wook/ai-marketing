'use client'

import { useLayoutEffect } from 'react'

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
  document.body.style.left = ''
  document.body.style.right = ''
  document.body.style.width = ''
  document.body.style.height = ''
  document.documentElement.style.overflow = ''
  document.documentElement.style.overscrollBehavior = ''
  document.documentElement.style.height = ''
  delete document.body.dataset[scrollLockDatasetKey]
  window.scrollTo(0, restoreY)
}

export function useBodyScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) {
      recoverOrphanedScrollLock()
      return
    }

    const previousOverflow = document.body.style.overflow
    const previousOverscrollBehavior = document.body.style.overscrollBehavior
    const previousTouchAction = document.body.style.touchAction
    const previousPosition = document.body.style.position
    const previousTop = document.body.style.top
    const previousLeft = document.body.style.left
    const previousRight = document.body.style.right
    const previousWidth = document.body.style.width
    const previousHeight = document.body.style.height
    const previousDocumentOverflow = document.documentElement.style.overflow
    const previousDocumentOverscrollBehavior = document.documentElement.style.overscrollBehavior
    const previousDocumentHeight = document.documentElement.style.height
    const scrollY = window.scrollY
    let touchStartY = 0

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    document.body.style.height = '100%'
    document.body.style.touchAction = previousTouchAction
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'
    document.documentElement.style.height = '100%'
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
      if (event.touches.length > 1) {
        event.preventDefault()
        return
      }

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

      if (!canScroll) {
        event.preventDefault()
        return
      }

      if (isAtTop && deltaY > 0) {
        scrollElement.scrollTop = 0
        event.preventDefault()
        return
      }

      if (isAtBottom && deltaY < 0) {
        scrollElement.scrollTop = scrollElement.scrollHeight
        event.preventDefault()
      }
    }

    const onWheel = (event: WheelEvent) => {
      const scrollElement = findAllowedScrollElement(event.target)

      if (!scrollElement) {
        event.preventDefault()
        return
      }

      const canScroll = scrollElement.scrollHeight > scrollElement.clientHeight
      const isAtTop = scrollElement.scrollTop <= 0
      const isAtBottom =
        scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 1

      if (
        !canScroll ||
        (isAtTop && event.deltaY < 0) ||
        (isAtBottom && event.deltaY > 0)
      ) {
        event.preventDefault()
      }
    }

    const onScroll = () => {
      if (window.scrollY !== scrollY) {
        window.scrollTo(0, scrollY)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    document.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true })
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('scroll', onScroll)
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscrollBehavior
      document.body.style.touchAction = previousTouchAction
      document.body.style.position = previousPosition
      document.body.style.top = previousTop
      document.body.style.left = previousLeft
      document.body.style.right = previousRight
      document.body.style.width = previousWidth
      document.body.style.height = previousHeight
      document.documentElement.style.overflow = previousDocumentOverflow
      document.documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior
      document.documentElement.style.height = previousDocumentHeight
      delete document.body.dataset[scrollLockDatasetKey]
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
