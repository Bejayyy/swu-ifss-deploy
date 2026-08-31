import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { notifyServiceCollegeDeans } from './notificationService';
import { isCollegeMatch } from './scheduleAccessService';

const SERVICE_RELEASES_COLLECTION = 'service_course_releases';

/**
 * Generates a deterministic document ID for a service course release
 */
export function getServiceReleaseDocId(schoolYearId, semester, courseId, sectionName, component) {
  const cleanSy = String(schoolYearId || '').replace(/[\s\-_]/g, '');
  const cleanSem = String(semester || '1');
  const cleanCourseId = String(courseId || '').trim();
  const cleanSec = String(sectionName || 'ALL').replace(/[\s\-_]/g, '').toUpperCase();
  const cleanComp = String(component || 'ALL').replace(/[\s\-_]/g, '').toUpperCase();
  return `${cleanSy}_sem${cleanSem}_${cleanCourseId}_${cleanSec}_${cleanComp}`;
}

/**
 * Subscribe to all service course releases for a specific school year and semester
 */
export function subscribeServiceCourseReleases(schoolYearId, semester, onData, onError) {
  if (!schoolYearId || !semester) {
    if (onData) onData([]);
    return () => {};
  }

  const q = query(
    collection(db, SERVICE_RELEASES_COLLECTION),
    where('schoolYearId', '==', String(schoolYearId)),
    where('semester', '==', String(semester))
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const releases = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      if (onData) onData(releases);
    },
    (err) => {
      console.error('subscribeServiceCourseReleases error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Check if a specific service course / component / section has been released by the mother college
 */
export function isServiceCourseReleased(releasesList = [], criteria = {}) {
  if (!Array.isArray(releasesList) || releasesList.length === 0) return false;
  const {
    courseId,
    courseCode,
    component, // 'Lecture' | 'Laboratory' | 'Both' | undefined
    sectionName,
    serviceCollegeCode,
    motherCollegeCode,
  } = criteria;

  return releasesList.some((rel) => {
    // 1. Course match (by ID or Code)
    const courseMatch =
      (courseId && rel.courseId === courseId) ||
      (courseCode && String(rel.courseCode || '').trim().toUpperCase() === String(courseCode).trim().toUpperCase());
    if (!courseMatch) return false;

    // 2. Section match: Matches specific section name OR 'ALL' / blank (meaning program-wide)
    if (sectionName && rel.sectionName && rel.sectionName !== 'ALL') {
      const secA = String(sectionName).trim().toUpperCase();
      const secB = String(rel.sectionName).trim().toUpperCase();
      if (secA !== secB) return false;
    }

    // 3. Component match: If specified, check component compatibility
    if (component && rel.component && rel.component !== 'Both' && rel.component !== 'Lecture & Laboratory') {
      const reqComp = String(component).toLowerCase();
      const relComp = String(rel.component).toLowerCase();
      if (!reqComp.includes(relComp) && !relComp.includes(reqComp)) {
        return false;
      }
    }

    // 4. Service College match (if given)
    if (serviceCollegeCode && rel.serviceCollegeCode) {
      if (!isCollegeMatch(serviceCollegeCode, rel.serviceCollegeCode)) {
        return false;
      }
    }

    // 5. Mother College match (if given)
    if (motherCollegeCode && rel.motherCollegeCode) {
      if (!isCollegeMatch(motherCollegeCode, rel.motherCollegeCode)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Release one or multiple service courses to their assigned service colleges and trigger notifications
 */
export async function releaseServiceCourses({
  schoolYearId,
  semester,
  motherCollegeCode,
  motherCollegeName,
  releases = [], // Array of { courseId, courseCode, courseTitle, component, serviceCollegeCode, serviceCollegeName, sectionName, programCode }
  releasedBy = {}, // { uid, name, email }
}) {
  if (!schoolYearId || !semester || !Array.isArray(releases) || releases.length === 0) {
    return { success: false, message: 'Invalid release parameters' };
  }

  const results = [];

  for (const item of releases) {
    const docId = getServiceReleaseDocId(
      schoolYearId,
      semester,
      item.courseId,
      item.sectionName || 'ALL',
      item.component || 'Both'
    );

    const releaseData = {
      schoolYearId: String(schoolYearId),
      semester: String(semester),
      motherCollegeCode: String(motherCollegeCode || '').toUpperCase(),
      motherCollegeName: String(motherCollegeName || motherCollegeCode || ''),
      programCode: String(item.programCode || '').toUpperCase(),
      courseId: item.courseId,
      courseCode: String(item.courseCode || '').trim().toUpperCase(),
      courseTitle: item.courseTitle || '',
      component: item.component || 'Both',
      serviceCollegeCode: String(item.serviceCollegeCode || '').trim().toUpperCase(),
      serviceCollegeName: item.serviceCollegeName || item.serviceCollegeCode || '',
      sectionName: item.sectionName || 'ALL',
      releasedByUid: releasedBy.uid || null,
      releasedByName: releasedBy.name || releasedBy.displayName || 'Mother College Dean',
      releasedByEmail: releasedBy.email || '',
      releasedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      status: 'released',
    };

    const docRef = doc(db, SERVICE_RELEASES_COLLECTION, docId);
    await setDoc(docRef, releaseData, { merge: true });
    results.push(releaseData);

    // Send notifications to the Service College Dean(s)
    try {
      await notifyServiceCollegeDeans({
        serviceCollegeCode: item.serviceCollegeCode,
        motherCollege: motherCollegeName || motherCollegeCode,
        courseCode: item.courseCode,
        courseTitle: item.courseTitle,
        component: item.component || 'Lecture & Laboratory',
        sectionName: item.sectionName !== 'ALL' ? item.sectionName : '',
        statusType: 'ready',
      });
    } catch (notifErr) {
      console.warn('Could not send notification to service college dean:', notifErr);
    }
  }

  return { success: true, count: results.length, releases: results };
}

/**
 * Revoke or delete a service course release
 */
export async function revokeServiceCourseRelease(releaseId) {
  if (!releaseId) return;
  const docRef = doc(db, SERVICE_RELEASES_COLLECTION, releaseId);
  await deleteDoc(docRef);
}
