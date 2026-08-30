import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/firebase';

import { isCollegeMatch } from './scheduleAccessService';

const COURSES_COLLECTION = 'courses';

/**
 * Subscribe to courses for a specific college (matches acronyms, names, and program codes)
 */
export function subscribeCollegeCourses(collegeCode, onData, onError) {
  if (!collegeCode) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, COURSES_COLLECTION));

  return onSnapshot(
    q,
    (snapshot) => {
      const allCourses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const filtered = allCourses.filter((c) => {
        const cCode = c.collegeCode || c.college || '';
        const pCode = c.programCode || '';
        return (
          isCollegeMatch(collegeCode, cCode) ||
          isCollegeMatch(collegeCode, pCode) ||
          (cCode && String(collegeCode).toUpperCase().includes(String(cCode).toUpperCase())) ||
          (pCode && String(collegeCode).toUpperCase().includes(String(pCode).toUpperCase())) ||
          (cCode && String(cCode).toUpperCase().includes(String(collegeCode).toUpperCase())) ||
          (pCode && String(pCode).toUpperCase().includes(String(collegeCode).toUpperCase()))
        );
      });

      filtered.sort((a, b) => {
        const yA = a.yearLevel || '';
        const yB = b.yearLevel || '';
        if (yA !== yB) return yA.localeCompare(yB);
        const sA = a.semester || '';
        const sB = b.semester || '';
        if (sA !== sB) return sA.localeCompare(sB);
        return (a.code || '').localeCompare(b.code || '');
      });

      onData(filtered);
    },
    (err) => {
      console.error('subscribeCollegeCourses error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to all courses (for Registrar)
 */
export function subscribeAllCourses(onData, onError) {
  const q = query(collection(db, COURSES_COLLECTION));

  return onSnapshot(
    q,
    (snapshot) => {
      const courses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      courses.sort((a, b) => {
        const cA = a.collegeCode || '';
        const cB = b.collegeCode || '';
        if (cA !== cB) return cA.localeCompare(cB);
        const yA = a.yearLevel || '';
        const yB = b.yearLevel || '';
        if (yA !== yB) return yA.localeCompare(yB);
        return (a.code || '').localeCompare(b.code || '');
      });

      onData(courses);
    },
    (err) => {
      console.error('subscribeAllCourses error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to courses assigned to a specific college as a SERVICE college
 */
export function subscribeServiceCollegeCourses(serviceCollegeCode, onData, onError) {
  if (!serviceCollegeCode) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, COURSES_COLLECTION));

  return onSnapshot(
    q,
    (snapshot) => {
      const allCourses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const serviceCourses = allCourses.filter((c) => {
        const lecSvc = c.lecServiceCollege || '';
        const labSvc = c.labServiceCollege || '';
        return (
          (lecSvc && (isCollegeMatch(serviceCollegeCode, lecSvc) || String(serviceCollegeCode).toUpperCase() === String(lecSvc).toUpperCase())) ||
          (labSvc && (isCollegeMatch(serviceCollegeCode, labSvc) || String(serviceCollegeCode).toUpperCase() === String(labSvc).toUpperCase()))
        );
      });

      onData(serviceCourses);
    },
    (err) => {
      console.error('subscribeServiceCollegeCourses error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Add a new course
 */
export async function addCourse(courseData) {
  const lecUnits = courseData.lecUnits !== undefined ? Number(courseData.lecUnits) : (courseData.type === 'laboratory' ? 0 : Number(courseData.units) || 3);
  const labUnits = courseData.labUnits !== undefined ? Number(courseData.labUnits) : (courseData.type === 'laboratory' ? Number(courseData.units) || 3 : 0);
  const totalUnits = courseData.units !== undefined ? Number(courseData.units) : (lecUnits + labUnits);

  const numLecUnits = Number(lecUnits) || 0;
  const numLabUnits = Number(labUnits) || 0;

  const lecHours = courseData.lecHours !== undefined && courseData.lecHours !== null && courseData.lecHours !== ''
    ? Number(courseData.lecHours)
    : numLecUnits * 1.0;
  const labHours = courseData.labHours !== undefined && courseData.labHours !== null && courseData.labHours !== ''
    ? Number(courseData.labHours)
    : numLabUnits * 3.0;
  const totalHours = courseData.totalHours !== undefined && courseData.totalHours !== null && courseData.totalHours !== ''
    ? Number(courseData.totalHours)
    : (lecHours + labHours);

  const cleanData = {
    code: (courseData.code || '').trim().toUpperCase(),
    title: (courseData.title || '').trim(),
    type: courseData.type || (numLabUnits > 0 && numLecUnits > 0 ? 'both' : (numLabUnits > 0 ? 'laboratory' : 'lecture')),
    yearLevel: courseData.yearLevel || '1st Year',
    semester: courseData.semester || '1st Semester',
    lecUnits: numLecUnits,
    labUnits: numLabUnits,
    units: Number(totalUnits) || 0,
    lecHours: Number(lecHours) || 0,
    labHours: Number(labHours) || 0,
    totalHours: Number(totalHours) || 0,
    collegeCode: (courseData.collegeCode || '').trim().toUpperCase(),
    programCode: (courseData.programCode || '').trim().toUpperCase(),
    requiresServiceCollege: Boolean(courseData.requiresServiceCollege),
    lecServiceCollege: courseData.lecServiceCollege ? (courseData.lecServiceCollege).trim().toUpperCase() : null,
    labServiceCollege: courseData.labServiceCollege ? (courseData.labServiceCollege).trim().toUpperCase() : null,
    rememberedLecServiceCollege: courseData.rememberedLecServiceCollege ? String(courseData.rememberedLecServiceCollege).trim().toUpperCase() : null,
    rememberedLabServiceCollege: courseData.rememberedLabServiceCollege ? String(courseData.rememberedLabServiceCollege).trim().toUpperCase() : null,
    serviceStatus: courseData.serviceStatus || 'pending',
    assignedTeacherUid: courseData.assignedTeacherUid || null,
    assignedTeacherName: courseData.assignedTeacherName || null,
    assignedTeacherEmail: courseData.assignedTeacherEmail || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COURSES_COLLECTION), cleanData);
  return docRef.id;
}

/**
 * Update an existing course
 */
export async function updateCourse(courseId, updates) {
  const docRef = doc(db, COURSES_COLLECTION, courseId);
  const cleanUpdates = {
    ...updates,
    updatedAt: serverTimestamp(),
  };

  if (updates.code) cleanUpdates.code = updates.code.trim().toUpperCase();
  if (updates.title) cleanUpdates.title = updates.title.trim();
  if (updates.type) cleanUpdates.type = updates.type;
  if (updates.lecUnits !== undefined) cleanUpdates.lecUnits = Number(updates.lecUnits) || 0;
  if (updates.labUnits !== undefined) cleanUpdates.labUnits = Number(updates.labUnits) || 0;
  if (updates.units !== undefined) cleanUpdates.units = Number(updates.units) || 0;
  if (updates.lecHours !== undefined) cleanUpdates.lecHours = Number(updates.lecHours) || 0;
  if (updates.labHours !== undefined) cleanUpdates.labHours = Number(updates.labHours) || 0;
  if (updates.totalHours !== undefined) cleanUpdates.totalHours = Number(updates.totalHours) || 0;
  if (updates.semester) cleanUpdates.semester = updates.semester;
  if (updates.yearLevel) cleanUpdates.yearLevel = updates.yearLevel;
  if (updates.collegeCode) cleanUpdates.collegeCode = updates.collegeCode.trim().toUpperCase();
  if (updates.programCode) cleanUpdates.programCode = updates.programCode.trim().toUpperCase();
  if (updates.requiresServiceCollege !== undefined) cleanUpdates.requiresServiceCollege = Boolean(updates.requiresServiceCollege);
  if (updates.lecServiceCollege !== undefined) cleanUpdates.lecServiceCollege = updates.lecServiceCollege ? String(updates.lecServiceCollege).trim().toUpperCase() : null;
  if (updates.labServiceCollege !== undefined) cleanUpdates.labServiceCollege = updates.labServiceCollege ? String(updates.labServiceCollege).trim().toUpperCase() : null;
  if (updates.serviceStatus !== undefined) cleanUpdates.serviceStatus = updates.serviceStatus;

  await updateDoc(docRef, cleanUpdates);
}

/**
 * Delete a course
 */
export async function deleteCourse(courseId) {
  const docRef = doc(db, COURSES_COLLECTION, courseId);
  await deleteDoc(docRef);
}

/** Delete the course catalogue records owned by a removed college program. */
export async function deleteProgramCourses(collegeCode, programCode) {
  if (!collegeCode || !programCode) return;

  const normalizedCollegeCode = String(collegeCode).trim().toUpperCase();
  const normalizedProgramCode = String(programCode).trim().toUpperCase();
  const snapshot = await getDocs(
    query(collection(db, COURSES_COLLECTION), where('programCode', '==', normalizedProgramCode))
  );
  const docsToDelete = snapshot.docs.filter(
    (courseDoc) => String(courseDoc.data().collegeCode || '').trim().toUpperCase() === normalizedCollegeCode
  );

  for (let start = 0; start < docsToDelete.length; start += 500) {
    const batch = writeBatch(db);
    docsToDelete.slice(start, start + 500).forEach((courseDoc) => batch.delete(courseDoc.ref));
    await batch.commit();
  }
}

/** Remove orphaned course records whose program is no longer in a college. */
export async function deleteCollegeCoursesOutsidePrograms(collegeCode, activeProgramCodes = []) {
  if (!collegeCode) return;
  const normalizedCollegeCode = String(collegeCode).trim().toUpperCase();
  const activeCodes = new Set(
    activeProgramCodes.map((code) => String(code).trim().toUpperCase()).filter(Boolean)
  );
  const snapshot = await getDocs(
    query(collection(db, COURSES_COLLECTION), where('collegeCode', '==', normalizedCollegeCode))
  );
  const docsToDelete = snapshot.docs.filter((courseDoc) => {
    const programCode = String(courseDoc.data().programCode || '').trim().toUpperCase();
    return programCode && !activeCodes.has(programCode);
  });

  for (let start = 0; start < docsToDelete.length; start += 500) {
    const batch = writeBatch(db);
    docsToDelete.slice(start, start + 500).forEach((courseDoc) => batch.delete(courseDoc.ref));
    await batch.commit();
  }
}

/**
 * Assign a teacher to a course
 */
export async function assignTeacherToCourse(courseId, teacherUid, teacherName, teacherEmail) {
  const docRef = doc(db, COURSES_COLLECTION, courseId);
  await updateDoc(docRef, {
    assignedTeacherUid: teacherUid || null,
    assignedTeacherName: teacherName || null,
    assignedTeacherEmail: teacherEmail || null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Unassign a teacher from a course
 */
export async function unassignTeacherFromCourse(courseId) {
  const docRef = doc(db, COURSES_COLLECTION, courseId);
  await updateDoc(docRef, {
    assignedTeacherUid: null,
    assignedTeacherName: null,
    assignedTeacherEmail: null,
    updatedAt: serverTimestamp(),
  });
}
