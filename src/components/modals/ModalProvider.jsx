import React from 'react';
import { useModal } from '../../hooks/useModal';
import ConfirmModal from './ConfirmModal';
import NotificationModal from './NotificationModal';

import useBodyScrollLock from '../../hooks/useBodyScrollLock';

/**
 * Modal provider component that handles both confirmation and notification modals
 * Wrap this around components that need modal functionality
 */
export function ModalProvider({ children }) {
  const { confirmState, notificationState } = useModal();
  const isAnyOpen = Boolean(confirmState?.isOpen || notificationState?.isOpen);
  useBodyScrollLock(isAnyOpen);

  return (
    <>
      {children}
      {confirmState.isOpen && <ConfirmModal {...confirmState} />}
      {notificationState.isOpen && <NotificationModal {...notificationState} />}
    </>
  );
}

/**
 * Render function for modals - use with useModal hook
 */
export function ModalRenderer({ confirmState, notificationState }) {
  const isAnyOpen = Boolean(confirmState?.isOpen || notificationState?.isOpen);
  useBodyScrollLock(isAnyOpen);

  return (
    <>
      {confirmState?.isOpen && <ConfirmModal {...confirmState} />}
      {notificationState?.isOpen && <NotificationModal {...notificationState} />}
    </>
  );
}
