import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const EQUIPMENTS_COLLECTION = 'equipments';

export const DEFAULT_EQUIPMENT_OPTIONS = [
  'Projector',
  'Whiteboard',
  'Air Conditioning',
  'Audio System',
  'Computers',
  'Smart Board',
  'CCTV',
];

/**
 * Real-time subscription to equipment/facilities in Firestore database.
 * Merges Firestore saved items with DEFAULT_EQUIPMENT_OPTIONS.
 */
export function subscribeEquipments(onData, onError) {
  const q = query(collection(db, EQUIPMENTS_COLLECTION), orderBy('name', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const dbEquipments = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return (data.name || '').trim();
        })
        .filter(Boolean);

      // Merge defaults with DB items, removing duplicates while preserving uniqueness
      const mergedSet = new Set([...DEFAULT_EQUIPMENT_OPTIONS, ...dbEquipments]);
      onData(Array.from(mergedSet));
    },
    (err) => {
      console.warn('Using default equipment options due to fetch error:', err);
      if (onError) onError(err);
      onData(DEFAULT_EQUIPMENT_OPTIONS);
    }
  );
}

/**
 * Add a new equipment item to Firestore database permanently
 */
export async function addEquipmentItem(name) {
  const cleanName = (name || '').trim();
  if (!cleanName) return;

  try {
    await addDoc(collection(db, EQUIPMENTS_COLLECTION), {
      name: cleanName,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to add equipment to database:', err);
  }
}
