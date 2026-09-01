import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { sendNotification } from './notificationService';

const REQUESTS = 'schedule_approval_requests';

export async function submitScheduleApprovalRequest(payload) {
  const requestRef = payload.approvalSubmissionId
    ? doc(db, REQUESTS, payload.approvalSubmissionId)
    : doc(collection(db, REQUESTS));
  const existingRequest = await getDoc(requestRef);
  const scheduleSlot = { day: payload.day, startHour: payload.startHour, endHour: payload.endHour };

  if (existingRequest.exists()) {
    const updates = { scheduleSlots: arrayUnion(scheduleSlot), updatedAt: serverTimestamp() };
    if (payload.entryPaths?.length) updates.entryPaths = arrayUnion(...payload.entryPaths);
    await updateDoc(requestRef, updates);
    return requestRef.id;
  }

  await setDoc(requestRef, {
    ...payload,
    entryPaths: payload.entryPaths || [],
    scheduleSlots: [scheduleSlot],
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const users = await getDocs(collection(db, 'users'));
  const allUsers = users.docs.map((item) => ({ id: item.id, ...item.data() }));
  const approvers = payload.approverUid
    ? allUsers.filter((user) => String(user.uid || user.id) === String(payload.approverUid))
    : allUsers.filter((user) => String(user.roleValue || user.role || '').toLowerCase() === 'registrar');

  await Promise.all(approvers.map((approver) => sendNotification({
    userId: approver.uid || approver.id,
    recipientEmail: approver.email,
    title: `Schedule approval needed: ${payload.courseCode}`,
    message: `${payload.deanName || 'A dean'} submitted ${payload.courseCode} for ${payload.sections?.join(', ') || payload.section}. ${payload.nonBudgetedReason ? `Reason for non-budgeted room: ${payload.nonBudgetedReason}` : ''}`,
    link: '/approvals',
    type: 'schedule_approval',
    metadata: { scheduleApprovalRequestId: requestRef.id },
  })));
  return requestRef.id;
}

export function subscribeScheduleApprovalRequests(onData, onError) {
  return onSnapshot(collection(db, REQUESTS), (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onData(items);
  }, onError);
}

/**
 * Remove approval records whose underlying plotted schedules were reset.
 * Filtering is performed client-side to support existing records without
 * requiring a new composite Firestore index.
 */
export async function deleteScheduleApprovalRequestsForReset({
  deanUids = [],
  semester,
  schoolYearId = null,
}) {
  const resetDeanUids = new Set(deanUids.map(String));
  if (resetDeanUids.size === 0) return 0;

  const snapshot = await getDocs(collection(db, REQUESTS));
  const matchingDocs = snapshot.docs.filter((requestDoc) => {
    const request = requestDoc.data();
    const entryBelongsToResetDean = (request.entryPaths || []).some((path) => {
      const pathParts = String(path).split('/');
      return pathParts[0] === 'users' && resetDeanUids.has(String(pathParts[1]));
    });
    const targetDeanMatches = request.targetDeanUid != null
      && resetDeanUids.has(String(request.targetDeanUid));
    const semesterMatches = semester == null
      || request.semester == null
      || String(request.semester) === String(semester);
    const schoolYearMatches = !schoolYearId
      || !request.schoolYearId
      || String(request.schoolYearId) === String(schoolYearId);

    return (entryBelongsToResetDean || targetDeanMatches)
      && semesterMatches
      && schoolYearMatches;
  });

  // Stay below Firestore's 500-operation batch limit.
  for (let index = 0; index < matchingDocs.length; index += 450) {
    const batch = writeBatch(db);
    matchingDocs.slice(index, index + 450).forEach((requestDoc) => batch.delete(requestDoc.ref));
    await batch.commit();
  }

  return matchingDocs.length;
}

export async function deleteScheduleApprovalRequests(requests = []) {
  const validRequests = requests.filter((request) => request?.id);
  if (validRequests.length === 0) return { deletedRequests: 0, deletedPendingEntries: 0 };

  const refsToDelete = new Map();
  validRequests.forEach((request) => {
    refsToDelete.set(`request:${request.id}`, doc(db, REQUESTS, request.id));
    if (String(request.status || 'pending').toLowerCase() === 'pending') {
      (request.entryPaths || []).forEach((path) => {
        if (path) refsToDelete.set(`entry:${path}`, doc(db, path));
      });
    }
  });

  const refs = [...refsToDelete.values()];
  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(db);
    refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  const deletedPendingEntries = [...refsToDelete.keys()].filter((key) => key.startsWith('entry:')).length;
  return { deletedRequests: validRequests.length, deletedPendingEntries };
}

export async function decideScheduleApproval(request, decision, reviewer, rejectionReason = '') {
  if (!request?.id || !['approved', 'rejected'].includes(decision)) throw new Error('Invalid schedule approval decision.');
  const batch = writeBatch(db);
  for (const path of request.entryPaths || []) {
    const entryRef = doc(db, path);
    if (decision === 'rejected') {
      batch.delete(entryRef);
    } else {
      batch.update(entryRef, {
        approvalStatus: 'approved',
        approved: true,
        reviewedAt: serverTimestamp(),
        reviewedBy: reviewer?.uid || null,
        reviewedByName: reviewer?.displayName || reviewer?.name || '',
      });
    }
  }
  batch.update(doc(db, REQUESTS, request.id), {
    status: decision,
    rejectionReason: decision === 'rejected' ? rejectionReason.trim() : null,
    updatedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewer?.uid || null,
    reviewedByName: reviewer?.displayName || reviewer?.name || '',
  });
  await batch.commit();

  if (request.deanUid || request.deanEmail) {
    await sendNotification({
      userId: request.deanUid,
      recipientEmail: request.deanEmail,
      title: `Schedule ${decision}: ${request.courseCode}`,
      message: `Your ${request.courseCode} schedule for ${request.sections?.join(', ') || request.section} was ${decision} by ${request.approvalTarget === 'room_manager' ? 'the room manager' : 'the Registrar'}.${decision === 'rejected' && rejectionReason ? ` Reason: ${rejectionReason.trim()} Please return to Course Scheduling to select another room or time.` : ''}`,
      link: '/course-scheduling',
      type: 'schedule_approval',
      metadata: { scheduleApprovalRequestId: request.id, decision, rejectionReason: decision === 'rejected' ? rejectionReason.trim() : null },
    });
  }
}
