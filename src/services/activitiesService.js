import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const ACTIVITIES_COLLECTION = 'activities';

/**
 * Subscribe to system activities in real-time
 */
export function subscribeActivities(schoolYearIdOrOnData, onDataOrOnError, possibleOnError) {
  let schoolYearId = null;
  let onData = schoolYearIdOrOnData;
  let onError = onDataOrOnError;

  if (typeof schoolYearIdOrOnData === 'string' || schoolYearIdOrOnData === null || schoolYearIdOrOnData === undefined) {
    if (typeof onDataOrOnError === 'function') {
      schoolYearId = schoolYearIdOrOnData;
      onData = onDataOrOnError;
      onError = possibleOnError;
    }
  }

  const q = query(collection(db, ACTIVITIES_COLLECTION), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      let activities = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      if (schoolYearId) {
        activities = activities.filter((item) => {
          if (item.schoolYearId) return item.schoolYearId === schoolYearId;
          return schoolYearId.includes('2026') || schoolYearId === 'sy_2026-2027';
        });
      }
      if (onData) onData(activities);
    },
    (err) => {
      console.error('[subscribeActivities] Error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Add a new activity (Academic or Non-Academic)
 */
export async function addActivity(activityData) {
  const docRef = await addDoc(collection(db, ACTIVITIES_COLLECTION), {
    category: activityData.category || 'academic', // 'academic' | 'non-academic'
    name: (activityData.name || '').trim(),
    objective: (activityData.objective || '').trim(),
    colleges: Array.isArray(activityData.colleges) ? activityData.colleges : [],
    collegeNames: Array.isArray(activityData.collegeNames) ? activityData.collegeNames : [],
    schoolYearId: activityData.schoolYearId || null,
    createdBy: activityData.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Update an activity
 */
export async function updateActivity(activityId, updates) {
  const docRef = doc(db, ACTIVITIES_COLLECTION, activityId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete an activity
 */
export async function deleteActivity(activityId) {
  const docRef = doc(db, ACTIVITIES_COLLECTION, activityId);
  await deleteDoc(docRef);
}
