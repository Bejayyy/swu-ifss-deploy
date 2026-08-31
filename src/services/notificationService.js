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
import { isCollegeMatch } from './scheduleAccessService';

const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Real-time subscription to user notifications
 */
export function subscribeUserNotifications(user, onData, onError) {
  if (!user || (!user.uid && !user.id && !user.email)) {
    onData([]);
    return () => {};
  }

  const userKeys = new Set([
    user.uid,
    user.id,
    user.email,
    user.email?.toLowerCase(),
  ].filter(Boolean).map((key) => String(key).trim().toLowerCase()));

  const ref = collection(db, NOTIFICATIONS_COLLECTION);

  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((item) => {
          const recipientKeys = [item.userId, item.recipientId, item.userEmail, item.recipientEmail, item.recipientUid]
            .filter(Boolean)
            .map((key) => String(key).trim().toLowerCase());
          const isExplicitBroadcast = item.broadcast === true || item.audience === 'all' || item.scope === 'global';
          return isExplicitBroadcast || recipientKeys.some((key) => userKeys.has(key));
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
      recipientUid: targetUserId || null,
      recipientEmail: recipientEmail || null,
      userEmail: recipientEmail || null,
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
    const sCodeNorm = String(serviceCollegeCode).trim().toUpperCase();

    // Check if service college is a GE Provider that does not handle its own sections (e.g. CAS)
    const collegesRef = collection(db, 'colleges');
    const colSnap = await getDocs(collegesRef);
    const matchedCollege = colSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((c) => isCollegeMatch(c.code, sCodeNorm) || isCollegeMatch(sCodeNorm, c.code));

    if (
      matchedCollege &&
      matchedCollege.managesGeneralEducationCourses &&
      (matchedCollege.noOwnSections || matchedCollege.doesNotHandleSections)
    ) {
      // GE Providers with no own sections plot directly upon Registrar access and do not require mother college release notifications
      return;
    }

    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);

    const deans = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => {
        const role = String(d.role || d.roleValue || '').toLowerCase();
        if (!role.includes('dean')) return false;

        const dCol = String(d.college || d.department || '').trim();
        if (!dCol) return false;

        return (
          isCollegeMatch(dCol, sCodeNorm) ||
          isCollegeMatch(sCodeNorm, dCol) ||
          dCol.toUpperCase() === sCodeNorm ||
          dCol.toUpperCase().includes(sCodeNorm) ||
          sCodeNorm.includes(dCol.toUpperCase())
        );
      });

    for (const dean of deans) {
      const isReady = statusType === 'ready';
      const title = isReady
        ? `Ready to Schedule: ${courseCode} (${component})`
        : `Service College Assignment: ${courseCode} (${component})`;

      const message = isReady
        ? `${motherCollege || 'Mother College'} has completed internal scheduling and released ${courseCode} - ${courseTitle} (${component})${sectionName ? ` for Section ${sectionName}` : ''}. You may now assign faculty and room.`
        : `Your college (${serviceCollegeCode}) was designated as the Service College for ${courseCode} - ${courseTitle} (${component})${sectionName ? ` for Section ${sectionName}` : ''} by ${motherCollege || 'the Registrar'}.`;

      await sendNotification({
        userId: dean.id || dean.uid,
        recipientId: dean.id || dean.uid,
        recipientUid: dean.id || dean.uid,
        recipientEmail: dean.email,
        userEmail: dean.email,
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
