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
  const cleanData = {
    code: (courseData.code || '').trim().toUpperCase(),
    title: (courseData.title || '').trim(),
    type: courseData.type || 'lecture',
    yearLevel: courseData.yearLevel || '1st Year',
    units: Number(courseData.units) || 0,
    description: (courseData.description || '').trim(),
    collegeCode: (courseData.collegeCode || '').trim().toUpperCase(),
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
  if (updates.description !== undefined) cleanUpdates.description = updates.description.trim();
  if (updates.collegeCode) cleanUpdates.collegeCode = updates.collegeCode.trim().toUpperCase();

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
