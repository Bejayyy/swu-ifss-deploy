import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Real-time subscription to user notifications
 */
export function subscribeUserNotifications(user, onData, onError) {
  if (!user || (!user.uid && !user.id && !user.email)) {
    onData([]);
    return () => {};
  }

  const userKeys = [
    user.uid,
    user.id,
    user.email,
    user.email?.toLowerCase(),
  ].filter(Boolean);

  const ref = collection(db, NOTIFICATIONS_COLLECTION);

  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((item) => {
          const itemUserId = String(item.userId || item.recipientId || '').toLowerCase();
          const isTarget = userKeys.some((k) => String(k).toLowerCase() === itemUserId) || !item.userId;
          return isTarget;
        })
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return bTime - aTime;
        });

      onData(items);
    },
    (err) => {
      console.warn('Realtime notification listener warning:', err.message);
      if (onError) onError(err);
    }
  );
}

/**
 * Mark a single notification as read in Firestore
 */
export async function markNotificationAsRead(notificationId) {
  if (!notificationId) return;
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await updateDoc(docRef, {
      read: true,
      readAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Error marking notification as read:', err);
  }
}

/**
 * Mark all notifications for a user as read
 */
export async function markAllNotificationsAsRead(notifications = []) {
  if (!notifications.length) return;
  try {
    const batch = writeBatch(db);
    const unreadItems = notifications.filter((n) => !n.read && n.id);

    for (const item of unreadItems) {
      const docRef = doc(db, NOTIFICATIONS_COLLECTION, item.id);
      batch.update(docRef, {
        read: true,
        readAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
  }
}

/**
 * Delete / clear a single notification
 */
export async function deleteNotification(notificationId) {
  if (!notificationId) return;
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Error deleting notification:', err);
  }
}
