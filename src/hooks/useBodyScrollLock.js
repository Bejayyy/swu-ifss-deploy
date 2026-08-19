import { useEffect } from 'react';

/**
 * Hook to lock body scroll when a modal is open.
 * Prevents background page scrolling while maintaining layout stability.
 * 
 * @param {boolean} isLocked - Whether scroll locking is active
 */
export function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.classList.add('modal-open');

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      
      // Only remove modal-open class if no other modal-overlays remain in DOM
      if (!document.querySelector('.modal-overlay')) {
        document.body.classList.remove('modal-open');
      }
    };
  }, [isLocked]);
}

export default useBodyScrollLock;
