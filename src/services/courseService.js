import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const COURSES_COLLECTION = 'courses';

/**
 * Subscribe to courses for a specific college
 */
export function subscribeCollegeCourses(collegeCode, onData, onError) {
  if (!collegeCode) {
    onData([]);
    return () => {};
  }

  const cleanCode = String(collegeCode).trim().toUpperCase();

  const q = query(
    collection(db, COURSES_COLLECTION),
    where('collegeCode', '==', cleanCode)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const courses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      courses.sort((a, b) => {
        const yA = a.yearLevel || '';
        const yB = b.yearLevel || '';
        if (yA !== yB) return yA.localeCompare(yB);
        const sA = a.semester || '';
        const sB = b.semester || '';
        if (sA !== sB) return sA.localeCompare(sB);
        return (a.code || '').localeCompare(b.code || '');
      });

      onData(courses);
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
 * Add a new course
 */
export async function addCourse(courseData) {
  const lecUnits = courseData.lecUnits !== undefined ? Number(courseData.lecUnits) : (courseData.type === 'laboratory' ? 0 : Number(courseData.units) || 3);
  const labUnits = courseData.labUnits !== undefined ? Number(courseData.labUnits) : (courseData.type === 'laboratory' ? Number(courseData.units) || 3 : 0);
  const totalUnits = courseData.units !== undefined ? Number(courseData.units) : (lecUnits + labUnits);

  const cleanData = {
    code: (courseData.code || '').trim().toUpperCase(),
    title: (courseData.title || '').trim(),
    type: courseData.type || (labUnits > 0 && lecUnits > 0 ? 'both' : (labUnits > 0 ? 'laboratory' : 'lecture')),
    yearLevel: courseData.yearLevel || '1st Year',
    semester: courseData.semester || '1st Semester',
    lecUnits: Number(lecUnits) || 0,
    labUnits: Number(labUnits) || 0,
    units: Number(totalUnits) || 0,
    collegeCode: (courseData.collegeCode || '').trim().toUpperCase(),
    programCode: (courseData.programCode || '').trim().toUpperCase(),
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
  if (updates.semester) cleanUpdates.semester = updates.semester;
  if (updates.yearLevel) cleanUpdates.yearLevel = updates.yearLevel;
  if (updates.collegeCode) cleanUpdates.collegeCode = updates.collegeCode.trim().toUpperCase();
  if (updates.programCode) cleanUpdates.programCode = updates.programCode.trim().toUpperCase();

  await updateDoc(docRef, cleanUpdates);
}

/**
 * Delete a course
 */
export async function deleteCourse(courseId) {
  const docRef = doc(db, COURSES_COLLECTION, courseId);
  await deleteDoc(docRef);
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
