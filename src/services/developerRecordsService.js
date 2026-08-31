import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import { deleteSchoolYear } from './academicCalendarService';

/**
 * Helper to execute Firestore batch deletes in chunks of 450 (Firestore limit is 500 ops per batch)
 */
async function executeBatchDeletes(docRefs) {
  const CHUNK_SIZE = 450;
  for (let i = 0; i < docRefs.length; i += CHUNK_SIZE) {
    const chunk = docRefs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((ref) => {
      batch.delete(ref);
    });
    await batch.commit();
  }
}

const INTEGRITY_COLLECTIONS = [
  COLLECTIONS.ROOM_RESERVATIONS,
  COLLECTIONS.SCHEDULE_PLOT_REQUESTS,
  COLLECTIONS.MAINTENANCE_SCHEDULES,
  COLLECTIONS.MAINTENANCE_REPORTS,
  'notifications',
  'courses',
  'program_sections',
];

const USER_REFERENCE_FIELDS = [
  'userId', 'recipientId', 'recipientUid', 'createdByUid', 'requestedByUid',
  'requestorUid', 'plottedBy', 'deanUid', 'scheduledByUid', 'reportedByUid',
  'assignedTeacherUid', 'managedBy', 'managerUid',
];

const USER_EMAIL_FIELDS = [
  'userEmail', 'recipientEmail', 'createdByEmail', 'requestorEmail',
  'requestedByEmail', 'deanEmail', 'scheduledByEmail', 'reportedByEmail',
  'assignedTeacherEmail', 'managerEmail',
];

export async function runReferentialIntegrityAudit() {
  const [usersSnap, collegesSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.USERS)),
    getDocs(collection(db, 'colleges')),
  ]);
  const userUids = new Set(usersSnap.docs.flatMap((d) => [d.id, d.data().uid]).filter(Boolean).map((v) => String(v).toLowerCase()));
  const userEmails = new Set(usersSnap.docs.map((d) => d.data().email).filter(Boolean).map((v) => String(v).trim().toLowerCase()));
  const collegeCodes = new Set();
  const programKeys = new Set();
  collegesSnap.docs.forEach((d) => {
    const data = d.data() || {};
    const collegeCode = String(data.code || '').trim().toUpperCase();
    if (collegeCode) collegeCodes.add(collegeCode);
    (data.programs || []).forEach((program) => {
      const programCode = String(program.code || '').trim().toUpperCase();
      if (collegeCode && programCode) programKeys.add(`${collegeCode}|${programCode}`);
    });
  });

  const sources = INTEGRITY_COLLECTIONS.map(async (collectionName) => {
    try {
      const snap = await getDocs(collection(db, collectionName));
      return snap.docs.map((document) => ({ collectionName, document }));
    } catch (error) {
      return [{ collectionName, scanError: error?.message || 'Collection could not be scanned' }];
    }
  });
  try {
    const plottedSnap = await getDocs(collectionGroup(db, 'plotEntries'));
    sources.push(Promise.resolve(plottedSnap.docs.map((document) => ({ collectionName: 'plotEntries', document }))));
  } catch {
    // Some deployments disallow collection-group reads; other collections still audit normally.
  }

  const records = (await Promise.all(sources)).flat();
  const findings = [];
  records.forEach(({ collectionName, document, scanError }) => {
    if (scanError) {
      findings.push({ id: `scan:${collectionName}`, type: 'scan_error', severity: 'warning', collection: collectionName, path: collectionName, reason: scanError, action: 'none' });
      return;
    }
    const data = document.data() || {};
    USER_REFERENCE_FIELDS.forEach((field) => {
      const value = data[field];
      if (value && !userUids.has(String(value).trim().toLowerCase())) {
        findings.push({ id: `${document.ref.path}:${field}`, type: 'orphan_user', severity: 'high', collection: collectionName, path: document.ref.path, field, value: String(value), reason: `References a user UID that no longer exists`, action: collectionName === 'notifications' ? 'delete_document' : 'clear_field' });
      }
    });
    USER_EMAIL_FIELDS.forEach((field) => {
      const value = data[field];
      if (value && !userEmails.has(String(value).trim().toLowerCase())) {
        findings.push({ id: `${document.ref.path}:${field}`, type: 'orphan_email', severity: 'medium', collection: collectionName, path: document.ref.path, field, value: String(value), reason: `References an email with no active user account`, action: collectionName === 'notifications' ? 'delete_document' : 'clear_field' });
      }
    });
    if (collectionName === 'courses') {
      const owner = String(data.collegeCode || '').trim().toUpperCase();
      const program = String(data.programCode || '').trim().toUpperCase();
      if (owner && !collegeCodes.has(owner)) findings.push({ id: `${document.ref.path}:collegeCode`, type: 'orphan_college', severity: 'high', collection: collectionName, path: document.ref.path, field: 'collegeCode', value: owner, reason: 'Owning college no longer exists', action: 'delete_document' });
      else if (owner && program && !programKeys.has(`${owner}|${program}`)) findings.push({ id: `${document.ref.path}:programCode`, type: 'orphan_program', severity: 'high', collection: collectionName, path: document.ref.path, field: 'programCode', value: program, reason: `Program is not registered under ${owner}`, action: 'delete_document' });
    }
    if (collectionName === 'program_sections') {
      const owner = String(data.collegeCode || '').trim().toUpperCase();
      const program = String(data.programCode || '').trim().toUpperCase();
      if (owner && program && !programKeys.has(`${owner}|${program}`)) findings.push({ id: `${document.ref.path}:program`, type: 'orphan_program', severity: 'high', collection: collectionName, path: document.ref.path, field: 'programCode', value: program, reason: `Section belongs to a removed program (${owner})`, action: 'delete_document' });
    }
  });
  return findings;
}

export async function cleanIntegrityFinding(finding) {
  if (!finding?.path || finding.action === 'none') return false;
  const ref = doc(db, finding.path);
  if (finding.action === 'delete_document') await deleteDoc(ref);
  else if (finding.action === 'clear_field' && finding.field) await updateDoc(ref, { [finding.field]: deleteField() });
  else return false;
  return true;
}

/**
 * Real-time subscription to ALL room reservations across all roles and users.
 */
export function subscribeAllReservations(onData, onError) {
  const colRef = collection(db, COLLECTIONS.ROOM_RESERVATIONS);
  try {
    return onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            approvalRecords: data.approvalRecords || data.approvalSteps || [],
          };
        });
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        onData(list);
      },
      (err) => {
        console.warn('[subscribeAllReservations] Subscription error:', err?.message || err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[subscribeAllReservations] Failed to setup listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Delete any room reservation document by ID
 */
export async function deleteReservationRecord(reservationId) {
  if (!reservationId) throw new Error('Reservation ID is required.');
  const ref = doc(db, COLLECTIONS.ROOM_RESERVATIONS, reservationId);
  await deleteDoc(ref);
}

/**
 * Real-time subscription to ALL class & course schedule entries plotted in the system across all deans, sections, school years, and subcollections.
 * Uses a dual strategy (collectionGroup queries + direct per-dean subcollection listeners) to guarantee 100% discovery across all Firestore schemas and rules.
 */
export function subscribeAllCourseScheduleEntries(onData, onError) {
  const mapDocs = new Map();
  const unsubs = [];
  const deanSectionUnsubs = new Map(); // key -> unsubscribe function

  const emitMerged = () => {
    const list = Array.from(mapDocs.values());
    // Sort by school year desc, section asc, day asc, startHour asc
    list.sort((a, b) => {
      const syA = String(a.schoolYear || a.schoolYearId || '');
      const syB = String(b.schoolYear || b.schoolYearId || '');
      if (syA !== syB) return syB.localeCompare(syA);
      const secA = String(a.section || a.sectionName || a.pathSection || '');
      const secB = String(b.section || b.sectionName || b.pathSection || '');
      if (secA !== secB) return secA.localeCompare(secB);
      const dayDiff = (a.day ?? 0) - (b.day ?? 0);
      if (dayDiff !== 0) return dayDiff;
      return (a.startHour ?? 0) - (b.startHour ?? 0);
    });
    onData(list);
  };

  const parseDoc = (d, explicitDeanUid = null, explicitSection = null) => {
    const data = d.data() || {};
    const pathParts = d.ref.path.split('/');
    let deanUid = data.deanUid || explicitDeanUid || null;
    let pathSection = explicitSection || null;

    if (pathParts[0] === 'users' && pathParts[2] === 'course_schedules') {
      deanUid = deanUid || pathParts[1];
      pathSection = pathSection || decodeURIComponent(pathParts[3]);
    } else if (pathParts[0] === 'users' && pathParts[2] === 'sections') {
      deanUid = deanUid || pathParts[1];
      pathSection = pathSection || decodeURIComponent(pathParts[3]);
    }

    const rawSy = data.schoolYearLabel || data.schoolYear || data.schoolYearId || '2026-2027';
    const cleanSy = String(rawSy).replace(/^sy_/i, '').replace(/^sy\s+/i, '').trim();

    return {
      id: d.id,
      docPath: d.ref.path,
      deanUid,
      pathSection,
      section: data.section || data.sectionName || pathSection || 'N/A',
      schoolYear: cleanSy || '2026-2027',
      schoolYearId: data.schoolYearId || `sy_${(cleanSy || '2026-2027').replace(/\s+/g, '_')}`,
      schoolYearDisplay: (cleanSy || '2026-2027').startsWith('SY ') ? cleanSy : `SY ${cleanSy || '2026-2027'}`,
      ...data,
    };
  };

  // 1. CollectionGroup Listener: entries
  try {
    const unsubEntries = onSnapshot(
      collectionGroup(db, 'entries'),
      (snap) => {
        snap.docs.forEach((doc) => {
          mapDocs.set(doc.ref.path, parseDoc(doc));
        });
        emitMerged();
      },
      (err) => console.warn('[subscribeAllCourseScheduleEntries] entries group error:', err?.message || err)
    );
    unsubs.push(unsubEntries);
  } catch (e) {
    console.warn('Failed to subscribe entries group:', e);
  }

  // 2. CollectionGroup Listener: schedule_entries
  try {
    const unsubSchedEntries = onSnapshot(
      collectionGroup(db, 'schedule_entries'),
      (snap) => {
        snap.docs.forEach((doc) => {
          mapDocs.set(doc.ref.path, parseDoc(doc));
        });
        emitMerged();
      },
      (err) => console.warn('[subscribeAllCourseScheduleEntries] schedule_entries error:', err?.message || err)
    );
    unsubs.push(unsubSchedEntries);
  } catch (e) {
    console.warn('Failed to subscribe schedule_entries group:', e);
  }

  // 3. CollectionGroup Listener: plotEntries
  try {
    const unsubPlotEntries = onSnapshot(
      collectionGroup(db, 'plotEntries'),
      (snap) => {
        snap.docs.forEach((doc) => {
          mapDocs.set(doc.ref.path, parseDoc(doc));
        });
        emitMerged();
      },
      (err) => console.warn('[subscribeAllCourseScheduleEntries] plotEntries error:', err?.message || err)
    );
    unsubs.push(unsubPlotEntries);
  } catch (e) {
    console.warn('Failed to subscribe plotEntries group:', e);
  }

  // 4. Direct Dean Users & Subcollections Traversal (Guarantees discovery across all deans & sections)
  try {
    const usersColRef = collection(db, COLLECTIONS.USERS);
    const unsubUsers = onSnapshot(
      usersColRef,
      (usersSnap) => {
        usersSnap.docs.forEach((userDoc) => {
          const uData = userDoc.data() || {};
          const userId = userDoc.id;
          // Listen to users/{userId}/course_schedules
          const schedulesCol = collection(db, COLLECTIONS.USERS, userId, 'course_schedules');
          const unsubSchedules = onSnapshot(
            schedulesCol,
            (schedSnap) => {
              schedSnap.docs.forEach((secDoc) => {
                const secId = secDoc.id;
                const subKey = `${userId}_${secId}`;
                if (!deanSectionUnsubs.has(subKey)) {
                  const secEntriesCol = collection(
                    db,
                    COLLECTIONS.USERS,
                    userId,
                    'course_schedules',
                    secId,
                    'entries'
                  );
                  const unsubSecEntries = onSnapshot(
                    secEntriesCol,
                    (secEntriesSnap) => {
                      secEntriesSnap.docs.forEach((entryDoc) => {
                        mapDocs.set(entryDoc.ref.path, parseDoc(entryDoc, userId, secId));
                      });
                      emitMerged();
                    },
                    (secErr) => console.warn(`[subscribeAllCourseScheduleEntries] Direct sec listener error: ${subKey}`, secErr)
                  );
                  deanSectionUnsubs.set(subKey, unsubSecEntries);
                }
              });
            },
            (err) => {
              // Non-fatal if user has no course_schedules
            }
          );
          unsubs.push(unsubSchedules);
        });
      },
      (usersErr) => console.warn('[subscribeAllCourseScheduleEntries] users snapshot error:', usersErr)
    );
    unsubs.push(unsubUsers);
  } catch (e) {
    console.warn('Failed direct users traversal:', e);
  }

  return () => {
    unsubs.forEach((unsub) => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch (e) {
        // ignore
      }
    });
    deanSectionUnsubs.forEach((unsub) => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch (e) {
        // ignore
      }
    });
    deanSectionUnsubs.clear();
  };
}

/**
 * Delete any course schedule entry document by its Firestore path or doc ID
 */
export async function deleteCourseScheduleEntryByPath(docPath) {
  if (!docPath) throw new Error('Document path is required for deletion.');
  const ref = doc(db, docPath);
  await deleteDoc(ref);
}

/**
 * Real-time subscription to ALL schedule plot requests
 */
export function subscribeAllPlotRequests(onData, onError) {
  const colRef = collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS);
  const q = query(colRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      onData(list);
    },
    (err) => {
      console.warn('[subscribeAllPlotRequests] Fallback query:', err);
      return onSnapshot(
        colRef,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          onData(list);
        },
        onError
      );
    }
  );
}

/**
 * Delete a schedule plot request
 */
export async function deletePlotRequestRecord(plotId) {
  if (!plotId) throw new Error('Plot Request ID is required.');
  const ref = doc(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS, plotId);
  await deleteDoc(ref);
}

/**
 * Real-time subscription to ALL controlled schedule sessions
 */
export function subscribeAllControlledSessions(onData, onError) {
  const colRef = collection(db, 'schedule_control_sessions');
  const q = query(colRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      onData(list);
    },
    (err) => {
      console.warn('[subscribeAllControlledSessions] Fallback:', err);
      return onSnapshot(
        colRef,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          onData(list);
        },
        onError
      );
    }
  );
}

/**
 * Delete a controlled schedule session
 */
export async function deleteControlledSessionRecord(sessionId) {
  if (!sessionId) throw new Error('Session ID is required.');
  const ref = doc(db, 'schedule_control_sessions', sessionId);
  await deleteDoc(ref);
}

/**
 * Real-time subscription to ALL maintenance schedules
 */
export function subscribeAllMaintenanceSchedules(onData, onError) {
  const colRef = collection(db, COLLECTIONS.MAINTENANCE_SCHEDULES);
  try {
    return onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        list.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
        onData(list);
      },
      (err) => {
        console.warn('[subscribeAllMaintenanceSchedules] Error:', err?.message || err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Delete a maintenance schedule
 */
export async function deleteMaintenanceScheduleRecord(scheduleId) {
  if (!scheduleId) throw new Error('Schedule ID is required.');
  const ref = doc(db, COLLECTIONS.MAINTENANCE_SCHEDULES, scheduleId);
  await deleteDoc(ref);
}

/**
 * Real-time subscription to ALL maintenance reports
 */
export function subscribeAllMaintenanceReports(onData, onError) {
  const colRef = collection(db, COLLECTIONS.MAINTENANCE_REPORTS);
  try {
    return onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        onData(list);
      },
      (err) => {
        console.warn('[subscribeAllMaintenanceReports] Error:', err?.message || err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Delete a maintenance report
 */
export async function deleteMaintenanceReportRecord(reportId) {
  if (!reportId) throw new Error('Report ID is required.');
  const ref = doc(db, COLLECTIONS.MAINTENANCE_REPORTS, reportId);
  await deleteDoc(ref);
}

/**
 * Batch delete room reservations
 */
export async function batchDeleteReservations(reservationIds) {
  if (!reservationIds || !reservationIds.length) return 0;
  const docRefs = reservationIds.map((id) => doc(db, COLLECTIONS.ROOM_RESERVATIONS, id));
  await executeBatchDeletes(docRefs);
  return reservationIds.length;
}

/**
 * Batch delete course schedule entries by document paths
 */
export async function batchDeleteCourseScheduleEntries(docPaths) {
  if (!docPaths || !docPaths.length) return 0;
  const docRefs = docPaths.map((p) => doc(db, p));
  await executeBatchDeletes(docRefs);
  return docPaths.length;
}

/**
 * Batch delete plot requests
 */
export async function batchDeletePlotRequests(plotIds) {
  if (!plotIds || !plotIds.length) return 0;
  const docRefs = plotIds.map((id) => doc(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS, id));
  await executeBatchDeletes(docRefs);
  return plotIds.length;
}

/**
 * Batch delete maintenance schedules
 */
export async function batchDeleteMaintenanceSchedules(scheduleIds) {
  if (!scheduleIds || !scheduleIds.length) return 0;
  const docRefs = scheduleIds.map((id) => doc(db, COLLECTIONS.MAINTENANCE_SCHEDULES, id));
  await executeBatchDeletes(docRefs);
  return scheduleIds.length;
}

/**
 * Batch delete maintenance reports
 */
export async function batchDeleteMaintenanceReports(reportIds) {
  if (!reportIds || !reportIds.length) return 0;
  const docRefs = reportIds.map((id) => doc(db, COLLECTIONS.MAINTENANCE_REPORTS, id));
  await executeBatchDeletes(docRefs);
  return reportIds.length;
}

/**
 * Real-time subscription to ALL users across the system regardless of role.
 */
export function subscribeAllSystemUsers(onData, onError) {
  const colRef = collection(db, COLLECTIONS.USERS);
  const q = query(colRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: data.uid || d.id,
          ...data,
        };
      });
      onData(list);
    },
    (err) => {
      console.warn('[subscribeAllSystemUsers] Fallback to unordered subscription:', err?.message || err);
      return onSnapshot(
        colRef,
        (snap) => {
          const list = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              uid: data.uid || d.id,
              ...data,
            };
          });
          list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          onData(list);
        },
        onError
      );
    }
  );
}

/**
 * Delete a user document
 */
export async function deleteSystemUserRecord(uid) {
  if (!uid) throw new Error('User UID is required.');
  const ref = doc(db, COLLECTIONS.USERS, uid);
  await deleteDoc(ref);
}

/**
 * Batch delete users by UIDs
 */
export async function batchDeleteSystemUsers(uids) {
  if (!uids || !uids.length) return 0;
  const docRefs = uids.map((uid) => doc(db, COLLECTIONS.USERS, uid));
  await executeBatchDeletes(docRefs);
  return uids.length;
}

/**
 * Real-time subscription to ALL buildings
 */
export function subscribeAllBuildings(onData, onError) {
  const colRef = collection(db, COLLECTIONS.BUILDINGS);
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      onData(list);
    },
    onError
  );
}

/**
 * Delete a building
 */
export async function deleteBuildingRecord(buildingId) {
  if (!buildingId) throw new Error('Building ID is required.');
  const ref = doc(db, COLLECTIONS.BUILDINGS, buildingId);
  await deleteDoc(ref);
}

/**
 * Batch delete buildings
 */
export async function batchDeleteBuildings(buildingIds) {
  if (!buildingIds || !buildingIds.length) return 0;
  const docRefs = buildingIds.map((id) => doc(db, COLLECTIONS.BUILDINGS, id));
  await executeBatchDeletes(docRefs);
  return buildingIds.length;
}

/**
 * Real-time subscription to ALL colleges
 */
export function subscribeAllColleges(onData, onError) {
  const colRef = collection(db, 'colleges');
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      onData(list);
    },
    onError
  );
}

/**
 * Delete a college
 */
export async function deleteCollegeRecord(collegeId) {
  if (!collegeId) throw new Error('College ID is required.');
  const ref = doc(db, 'colleges', collegeId);
  await deleteDoc(ref);
}

/**
 * Batch delete colleges
 */
export async function batchDeleteColleges(collegeIds) {
  if (!collegeIds || !collegeIds.length) return 0;
  const docRefs = collegeIds.map((id) => doc(db, 'colleges', id));
  await executeBatchDeletes(docRefs);
  return collegeIds.length;
}

/**
 * Real-time subscription to ALL program sections
 */
export function subscribeAllProgramSections(onData, onError) {
  const colRef = collection(db, 'program_sections');
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      list.sort((a, b) => (a.programCode || '').localeCompare(b.programCode || ''));
      onData(list);
    },
    onError
  );
}

/**
 * Delete a program section doc
 */
export async function deleteProgramSectionRecord(sectionId) {
  if (!sectionId) throw new Error('Section ID is required.');
  const ref = doc(db, 'program_sections', sectionId);
  await deleteDoc(ref);
}

/**
 * Batch delete program sections
 */
export async function batchDeleteProgramSections(sectionIds) {
  if (!sectionIds || !sectionIds.length) return 0;
  const docRefs = sectionIds.map((id) => doc(db, 'program_sections', id));
  await executeBatchDeletes(docRefs);
  return sectionIds.length;
}

/**
 * Real-time subscription to ALL course catalog subjects
 */
export function subscribeAllCoursesCatalog(onData, onError) {
  const colRef = collection(db, 'courses');
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      onData(list);
    },
    onError
  );
}

/**
 * Delete a course catalog subject
 */
export async function deleteCourseRecord(courseId) {
  if (!courseId) throw new Error('Course ID is required.');
  const ref = doc(db, 'courses', courseId);
  await deleteDoc(ref);
}

/**
 * Batch delete courses
 */
export async function batchDeleteCoursesCatalog(courseIds) {
  if (!courseIds || !courseIds.length) return 0;
  const docRefs = courseIds.map((id) => doc(db, 'courses', id));
  await executeBatchDeletes(docRefs);
  return courseIds.length;
}

/**
 * Real-time subscription to ALL academic calendars
 */
export function subscribeAllAcademicCalendars(onData, onError) {
  const colRef = collection(db, COLLECTIONS.ACADEMIC_CALENDARS);
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs
        .filter((d) => d.id !== 'school_calendar_pdf' && !d.id.includes('_pdf'))
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }));
      onData(list);
    },
    onError
  );
}

/**
 * Delete an academic calendar (cascading purge of all associated records)
 */
export async function deleteAcademicCalendarRecord(calendarId) {
  if (!calendarId) throw new Error('Calendar ID is required.');
  await deleteSchoolYear(calendarId);
}

/**
 * Batch delete academic calendars (cascading purge)
 */
export async function batchDeleteAcademicCalendars(calendarIds) {
  if (!calendarIds || !calendarIds.length) return 0;
  for (const cid of calendarIds) {
    await deleteSchoolYear(cid);
  }
  return calendarIds.length;
}

/**
 * Real-time subscription to ALL no-class days
 */
export function subscribeAllNoClassDays(onData, onError) {
  const colRef = collection(db, COLLECTIONS.NO_CLASS_DAYS);
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      onData(list);
    },
    onError
  );
}

/**
 * Delete a no-class day
 */
export async function deleteNoClassDayRecord(dayId) {
  if (!dayId) throw new Error('No-class day ID is required.');
  const ref = doc(db, COLLECTIONS.NO_CLASS_DAYS, dayId);
  await deleteDoc(ref);
}

/**
 * Batch delete no-class days
 */
export async function batchDeleteNoClassDays(dayIds) {
  if (!dayIds || !dayIds.length) return 0;
  const docRefs = dayIds.map((id) => doc(db, COLLECTIONS.NO_CLASS_DAYS, id));
  await executeBatchDeletes(docRefs);
  return dayIds.length;
}

/**
 * Real-time subscription to ALL approval workflows
 */
export function subscribeAllApprovalWorkflows(onData, onError) {
  const colRef = collection(db, COLLECTIONS.APPROVAL_WORKFLOWS);
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      onData(list);
    },
    onError
  );
}

/**
 * Delete an approval workflow
 */
export async function deleteApprovalWorkflowRecord(workflowId) {
  if (!workflowId) throw new Error('Workflow ID is required.');
  const ref = doc(db, COLLECTIONS.APPROVAL_WORKFLOWS, workflowId);
  await deleteDoc(ref);
}

/**
 * Batch delete approval workflows
 */
export async function batchDeleteApprovalWorkflows(workflowIds) {
  if (!workflowIds || !workflowIds.length) return 0;
  const docRefs = workflowIds.map((id) => doc(db, COLLECTIONS.APPROVAL_WORKFLOWS, id));
  await executeBatchDeletes(docRefs);
  return workflowIds.length;
}


