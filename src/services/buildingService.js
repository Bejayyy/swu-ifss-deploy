import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';

function generateBuildingCode(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => w[0]).join('').toUpperCase().slice(0, 4);
  }
  return (name || 'BLD').slice(0, 3).toUpperCase();
}

function mapRoomDoc(roomDoc) {
  const data = roomDoc.data();
  const roomCode = data.roomCode || data.name || roomDoc.id;
  return {
    docId: roomDoc.id,
    id: roomCode,
    name: data.name || roomCode,
    roomCode,
    type: data.type || 'Classroom',
    status: data.status || 'Available',
    capacity: data.capacity ?? 0,
    equipment: data.equipment || [],
    floorId: data.floorId,
    floorNumber: data.floorNumber,
    buildingId: data.buildingId,
    managedBy: data.managedBy || null,
    managedByName: data.managedByName || null,
    // Maintenance fields
    maintenanceStatus: data.maintenanceStatus || 'operational',
    maintenanceStartDate: data.maintenanceStartDate || null,
    maintenanceEndDate: data.maintenanceEndDate || null,
    maintenanceReason: data.maintenanceReason || null,
    maintenanceScheduleId: data.maintenanceScheduleId || null,
  };
}

function mergeBuildingsSnapshot(buildingsMap, floorsByBuilding, roomsByFloorKey) {
  return Object.values(buildingsMap)
    .map((b) => {
      const floors = (floorsByBuilding[b.id] || []).sort((a, z) => a.floorNumber - z.floorNumber);
      const floorData = floors.map((f) => {
        const key = `${b.id}_${f.id}`;
        const rooms = (roomsByFloorKey[key] || [])
          .map(mapRoomDoc)
          .sort((a, z) => a.id.localeCompare(z.id));
        return {
          floor: f.floorNumber,
          floorId: f.id,
          label: f.label || `Floor ${f.floorNumber}`,
          managedBy: f.managedBy || null,
          managedByName: f.managedByName || null,
          rooms,
        };
      });
      const totalRooms = floorData.reduce((sum, f) => sum + f.rooms.length, 0);
      return {
        ...b,
        floorData,
        floors: floorData.length,
        totalRooms,
        manager: b.manager || null,
      };
    })
    .sort((a, z) => (a.name || '').localeCompare(z.name || ''));
}

/** Real-time buildings with nested floors and rooms */
export function subscribeToBuildings(onData, onError) {
  const buildingsMap = {};
  const floorsByBuilding = {};
  const roomsByFloorKey = {};

  const emit = () => {
    onData(mergeBuildingsSnapshot(buildingsMap, floorsByBuilding, roomsByFloorKey));
  };

  const unsubBuildings = onSnapshot(
    collection(db, COLLECTIONS.BUILDINGS),
    (snap) => {
      Object.keys(buildingsMap).forEach((k) => delete buildingsMap[k]);
      snap.docs.forEach((d) => {
        buildingsMap[d.id] = { id: d.id, ...d.data() };
      });
      emit();
    },
    onError,
  );

  const unsubFloors = onSnapshot(
    collectionGroup(db, COLLECTIONS.FLOORS),
    (snap) => {
      Object.keys(floorsByBuilding).forEach((k) => delete floorsByBuilding[k]);
      snap.docs.forEach((d) => {
        const data = d.data();
        const bid = data.buildingId;
        if (!bid) return;
        if (!floorsByBuilding[bid]) floorsByBuilding[bid] = [];
        floorsByBuilding[bid].push({ id: d.id, ...data });
      });
      emit();
    },
    onError,
  );

  const unsubRooms = onSnapshot(
    collectionGroup(db, COLLECTIONS.ROOMS),
    (snap) => {
      Object.keys(roomsByFloorKey).forEach((k) => delete roomsByFloorKey[k]);
      snap.docs.forEach((d) => {
        const data = d.data();
        const key = `${data.buildingId}_${data.floorId}`;
        if (!data.buildingId || !data.floorId) return;
        if (!roomsByFloorKey[key]) roomsByFloorKey[key] = [];
        roomsByFloorKey[key].push(d);
      });
      emit();
    },
    onError,
  );

  return () => {
    unsubBuildings();
    unsubFloors();
    unsubRooms();
  };
}

export async function createBuilding({ name, prefix, manager, floorNames, image, contact, email }) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Building name is required.');

  const buildingRef = doc(collection(db, COLLECTIONS.BUILDINGS));
  const code = (prefix?.trim() || generateBuildingCode(trimmedName)).toUpperCase();
  const batch = writeBatch(db);

  batch.set(buildingRef, {
    name: trimmedName,
    code,
    prefix: code,
    image: image || '',
    totalRooms: 0,
    floors: floorNames.length,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  floorNames.forEach((label, index) => {
    const floorRef = doc(collection(buildingRef, COLLECTIONS.FLOORS));
    batch.set(floorRef, {
      buildingId: buildingRef.id,
      floorNumber: index + 1,
      label: (label || `Floor ${index + 1}`).trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return buildingRef.id;
}

export async function addFloorToBuilding(buildingId, floorData) {
  const buildingRef = doc(db, COLLECTIONS.BUILDINGS, buildingId);
  const buildingSnap = await getDoc(buildingRef);
  if (!buildingSnap.exists()) throw new Error('Building not found.');

  const currentFloors = buildingSnap.data().floors || 0;
  const floorNumber = currentFloors + 1;
  const floorRef = doc(collection(buildingRef, COLLECTIONS.FLOORS));

  // Handle both old format (string) and new format (object)
  const label = typeof floorData === 'string' ? floorData : floorData.label;
  const managedBy = typeof floorData === 'object' ? floorData.managedBy || null : null;
  const managedByName = typeof floorData === 'object' ? floorData.managedByName || null : null;

  await setDoc(floorRef, {
    buildingId,
    floorNumber,
    label: (label || `Floor ${floorNumber}`).trim(),
    managedBy,
    managedByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(buildingRef, {
    floors: floorNumber,
    updatedAt: serverTimestamp(),
  });

  return { floorId: floorRef.id, floorNumber };
}

export async function updateBuildingRecord(buildingId, patch) {
  const buildingRef = doc(db, COLLECTIONS.BUILDINGS, buildingId);
  const updates = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.prefix !== undefined) {
    const p = patch.prefix.trim().toUpperCase();
    updates.prefix = p;
    updates.code = p;
  }
  if (patch.image !== undefined) updates.image = patch.image;

  if (Array.isArray(patch.floorNames)) {
    updates.floors = patch.floorNames.length;

    const floorsColl = collection(buildingRef, COLLECTIONS.FLOORS);
    const floorsSnap = await getDocs(query(floorsColl, orderBy('floorNumber', 'asc')));
    const existingDocs = floorsSnap.docs;

    for (let i = 0; i < patch.floorNames.length; i += 1) {
      const label = patch.floorNames[i].trim() || `Floor ${i + 1}`;
      if (i < existingDocs.length) {
        await updateDoc(existingDocs[i].ref, {
          label,
          floorNumber: i + 1,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newFloorRef = doc(floorsColl);
        await setDoc(newFloorRef, {
          buildingId,
          floorNumber: i + 1,
          label,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (existingDocs.length > patch.floorNames.length) {
      for (let i = patch.floorNames.length; i < existingDocs.length; i += 1) {
        await deleteDoc(existingDocs[i].ref);
      }
    }
  }

  await updateDoc(buildingRef, updates);
}

export async function addRoomToFloor(buildingId, floorId, floorNumber, room) {
  const roomCode = (room.name || '').trim().toUpperCase();
  if (!roomCode) throw new Error('Room name / number is required.');

  const roomRef = doc(
    collection(db, COLLECTIONS.BUILDINGS, buildingId, COLLECTIONS.FLOORS, floorId, COLLECTIONS.ROOMS),
  );

  await setDoc(roomRef, {
    buildingId,
    floorId,
    floorNumber,
    roomCode,
    name: room.name.trim(),
    type: room.type,
    status: room.status || 'Available',
    capacity: Number(room.capacity) || 0,
    equipment: room.equipment || [],
    managedBy: room.managedBy || null,
    managedByName: room.managedByName || null,
    // Maintenance fields
    maintenanceStatus: 'operational', // operational, under-maintenance
    maintenanceStartDate: null,
    maintenanceEndDate: null,
    maintenanceReason: null,
    maintenanceScheduleId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, COLLECTIONS.BUILDINGS, buildingId), {
    totalRooms: increment(1),
    updatedAt: serverTimestamp(),
  });

  return { docId: roomRef.id, id: roomCode };
}

export async function updateRoomRecord(buildingId, floorId, roomDocId, patch) {
  const roomRef = doc(
    db,
    COLLECTIONS.BUILDINGS,
    buildingId,
    COLLECTIONS.FLOORS,
    floorId,
    COLLECTIONS.ROOMS,
    roomDocId,
  );

  const updates = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    updates.name = name;
    updates.roomCode = name.toUpperCase();
  }
  if (patch.type !== undefined) updates.type = patch.type;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.capacity !== undefined) updates.capacity = Number(patch.capacity) || 0;
  if (patch.equipment !== undefined) updates.equipment = patch.equipment;
  if (patch.managedBy !== undefined) updates.managedBy = patch.managedBy || null;
  if (patch.managedByName !== undefined) updates.managedByName = patch.managedByName || null;

  await updateDoc(roomRef, updates);
}

export async function updateFloorRecord(buildingId, floorId, patch) {
  const floorRef = doc(db, COLLECTIONS.BUILDINGS, buildingId, COLLECTIONS.FLOORS, floorId);

  const updates = { updatedAt: serverTimestamp() };
  if (patch.label !== undefined) updates.label = patch.label.trim();
  if (patch.managedBy !== undefined) updates.managedBy = patch.managedBy || null;
  if (patch.managedByName !== undefined) updates.managedByName = patch.managedByName || null;

  await updateDoc(floorRef, updates);
}

export async function updateAllRoomsOnFloor(buildingId, floorId, patch) {
  const floorRef = doc(db, COLLECTIONS.BUILDINGS, buildingId, COLLECTIONS.FLOORS, floorId);
  const roomsCollection = collection(floorRef, COLLECTIONS.ROOMS);
  
  // Get all rooms on this floor
  const roomsSnapshot = await getDocs(roomsCollection);
  
  if (roomsSnapshot.empty) return { updated: 0 };
  
  // Batch update all rooms
  const batch = writeBatch(db);
  const updates = { updatedAt: serverTimestamp() };
  
  if (patch.managedBy !== undefined) updates.managedBy = patch.managedBy || null;
  if (patch.managedByName !== undefined) updates.managedByName = patch.managedByName || null;
  
  roomsSnapshot.docs.forEach((roomDoc) => {
    batch.update(roomDoc.ref, updates);
  });
  
  await batch.commit();
  return { updated: roomsSnapshot.size };
}
