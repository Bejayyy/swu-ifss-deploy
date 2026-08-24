import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const ROOM_TYPES_COLLECTION = 'roomTypes';

export const DEFAULT_ROOM_TYPES = ['Lecture', 'Laboratory'];

/**
 * Real-time subscription to room types in Firestore database.
 * Merges Firestore saved items with DEFAULT_ROOM_TYPES.
 */
export function subscribeRoomTypes(onData, onError) {
  const q = query(collection(db, ROOM_TYPES_COLLECTION), orderBy('name', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const dbRoomTypes = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return (data.name || '').trim();
        })
        .filter(Boolean);

      // Merge defaults with DB items, removing duplicates while preserving uniqueness
      const mergedSet = new Set([...DEFAULT_ROOM_TYPES, ...dbRoomTypes]);
      onData(Array.from(mergedSet));
    },
    (err) => {
      console.warn('Using default room types due to fetch error:', err);
      if (onError) onError(err);
      onData(DEFAULT_ROOM_TYPES);
    }
  );
}

/**
 * Add a new room type to Firestore database permanently
 */
export async function addRoomType(name) {
  const cleanName = (name || '').trim();
  if (!cleanName) return null;

  try {
    const docRef = await addDoc(collection(db, ROOM_TYPES_COLLECTION), {
      name: cleanName,
      createdAt: serverTimestamp(),
    });
    return { id: docRef.id, name: cleanName };
  } catch (err) {
    console.error('Failed to add room type to database:', err);
    throw err;
  }
}
