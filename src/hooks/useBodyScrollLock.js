import { useEffect } from 'react';

let activeLockCount = 0;

/**
 * Hook to lock body scroll when a modal is open.
 * Uses reference counting so multiple open modals (e.g. nested or loading modals)
 * don't prematurely unlock or permanently trap scroll.
 * 
 * @param {boolean} isLocked - Whether scroll locking is active
 */
export function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return;

    activeLockCount++;
    if (activeLockCount === 1) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      document.body.classList.add('modal-open');
    }

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0) {
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        document.body.classList.remove('modal-open');
      }
    };
  }, [isLocked]);
}

export default useBodyScrollLock;

