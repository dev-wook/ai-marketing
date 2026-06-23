'use client'

import { useEffect } from 'react'

const scrollLockDatasetKey = 'aivaScrollLocked'

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

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.touchAction = 'none'
    document.documentElement.style.overscrollBehavior = 'none'
    document.body.dataset[scrollLockDatasetKey] = 'true'

    return () => {
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
