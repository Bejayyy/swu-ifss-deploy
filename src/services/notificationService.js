import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  addDoc,
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

/**
 * Send a notification to a specific user or role
 */
export async function sendNotification({
  userId = null,
  recipientId = null,
  recipientEmail = null,
  title = 'System Notification',
  message = '',
  link = null,
  type = 'info',
  metadata = {},
}) {
  try {
    const targetUserId = userId || recipientId;
    const cleanPayload = {
      userId: targetUserId || null,
      recipientId: targetUserId || null,
      recipientEmail: recipientEmail || null,
      title,
      message,
      link,
      type,
      read: false,
      createdAt: serverTimestamp(),
      ...metadata,
    };

    const docRef = await addDoc(collection(db, NOTIFICATIONS_COLLECTION), cleanPayload);
    return docRef.id;
  } catch (err) {
    console.error('Error sending notification:', err);
    return null;
  }
}

/**
 * Notify Dean(s) of a Service College regarding an assignment or ready status
 */
export async function notifyServiceCollegeDeans({
  serviceCollegeCode,
  motherCollege,
  courseCode,
  courseTitle,
  component = 'Lecture',
  sectionName = '',
  statusType = 'ready', // 'assigned' | 'ready'
}) {
  if (!serviceCollegeCode) return;

  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'dean'));
    const snap = await getDocs(q);

    const sCodeNorm = String(serviceCollegeCode).trim().toUpperCase();

    const deans = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => {
        const dCol = String(d.college || d.department || '').trim().toUpperCase();
        return dCol === sCodeNorm || dCol.includes(sCodeNorm) || sCodeNorm.includes(dCol);
      });

    for (const dean of deans) {
      const isReady = statusType === 'ready';
      const title = isReady
        ? `🏛️ Ready to Schedule: ${courseCode} (${component})`
        : `🏛️ Service College Assignment: ${courseCode} (${component})`;

      const message = isReady
        ? `${motherCollege || 'Mother College'} has completed internal scheduling and released ${courseCode} - ${courseTitle} (${component})${sectionName ? ` for Section ${sectionName}` : ''}. You may now assign faculty and room.`
        : `Your college (${serviceCollegeCode}) was designated as the Service College for ${courseCode} - ${courseTitle} (${component})${sectionName ? ` for Section ${sectionName}` : ''} by ${motherCollege || 'the Registrar'}.`;

      await sendNotification({
        userId: dean.id || dean.uid,
        recipientEmail: dean.email,
        title,
        message,
        link: '/course-scheduling',
        type: 'course_scheduling',
        metadata: {
          serviceCollegeCode,
          motherCollege,
          courseCode,
          courseTitle,
          component,
          sectionName,
          statusType,
        },
      });
    }
  } catch (err) {
    console.error('Error notifying service college deans:', err);
  }
}
