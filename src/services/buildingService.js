import {
  collection,
  collectionGroup,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
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
      let floorData = [];

      // 1. Check if Firestore subcollections floors exist for this building
      const subFloors = floorsByBuilding[b.id] || [];

      if (subFloors.length > 0) {
        floorData = subFloors
          .sort((a, z) => (Number(a.floorNumber) || 0) - (Number(z.floorNumber) || 0))
          .map((f) => {
            const key = `${b.id}_${f.id}`;
            const floorNumKey = `${b.id}_${f.floorNumber}`;
            const roomDocs = roomsByFloorKey[key] || roomsByFloorKey[floorNumKey] || [];
            
            // Deduplicate rooms by docId or roomCode
            const uniqueRoomDocs = [];
            const seenIds = new Set();
            roomDocs.forEach((rd) => {
              const code = rd.data()?.roomCode || rd.id;
              if (!seenIds.has(code)) {
                seenIds.add(code);
                uniqueRoomDocs.push(rd);
              }
            });

            const rooms = uniqueRoomDocs
              .map(mapRoomDoc)
              .sort((a, z) => (a.roomCode || a.id).localeCompare(z.roomCode || z.id));

            return {
              floor: f.floorNumber,
              floorId: f.id,
              floorNumber: f.floorNumber,
              label: f.label || `Floor ${f.floorNumber}`,
              managedBy: f.managedBy || null,
              managedByName: f.managedByName || null,
              rooms,
            };
          });
      } else if (Array.isArray(b.floorData) && b.floorData.length > 0) {
        // 2. Preserve existing document-level b.floorData if subcollection floors not present
        floorData = b.floorData.map((f) => ({
          ...f,
          floorNumber: f.floorNumber || f.floor || 1,
          label: f.label || `Floor ${f.floorNumber || f.floor || 1}`,
          rooms: Array.isArray(f.rooms)
            ? f.rooms.map((r) => (r.data ? mapRoomDoc(r) : { ...r, roomCode: r.roomCode || r.name || r.id }))
            : [],
        }));
      } else if (Array.isArray(b.rooms) && b.rooms.length > 0) {
        // 3. Group flat b.rooms array by floorNumber if present on building document
        const grouped = {};
        b.rooms.forEach((r) => {
          const fn = r.floorNumber || r.floor || 1;
          if (!grouped[fn]) {
            grouped[fn] = {
              floor: fn,
              floorNumber: fn,
              label: `Floor ${fn}`,
              rooms: [],
            };
          }
          grouped[fn].rooms.push(r.data ? mapRoomDoc(r) : { ...r, roomCode: r.roomCode || r.name || r.id });
        });
        floorData = Object.values(grouped).sort((a, z) => a.floorNumber - z.floorNumber);
      } else {
        // 4. Construct empty floors based on b.floors or b.numFloors count
        const floorCount = Math.max(1, Number(b.floors) || Number(b.numFloors) || 1);
        floorData = Array.from({ length: floorCount }, (_, idx) => {
          const fn = idx + 1;
          return {
            floor: fn,
            floorNumber: fn,
            label: `${fn}${fn === 1 ? 'st' : fn === 2 ? 'nd' : fn === 3 ? 'rd' : 'th'} Floor`,
            rooms: [],
          };
        });
      }

      // Also attach any orphan rooms matching this building ID that were not caught by floor ID
      Object.entries(roomsByFloorKey).forEach(([key, rDocs]) => {
        if (key.startsWith(`${b.id}_`)) {
          rDocs.forEach((rDoc) => {
            const rData = rDoc.data() || {};
            const rNum = rData.floorNumber || 1;
            const targetFloor = floorData.find((f) => f.floorNumber === rNum);
            if (targetFloor) {
              const mapped = mapRoomDoc(rDoc);
              if (!targetFloor.rooms.some((existing) => (existing.roomCode || existing.id) === (mapped.roomCode || mapped.id))) {
                targetFloor.rooms.push(mapped);
              }
            }
          });
        }
      });

      const totalRooms = floorData.reduce((sum, f) => sum + (f.rooms ? f.rooms.length : 0), 0);
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
        const bid = data.buildingId;
        const fid = data.floorId;
        const fnum = data.floorNumber;

        if (!bid) return;
        if (fid) {
          const key1 = `${bid}_${fid}`;
          if (!roomsByFloorKey[key1]) roomsByFloorKey[key1] = [];
          roomsByFloorKey[key1].push(d);
        }
        if (fnum !== undefined) {
          const key2 = `${bid}_${fnum}`;
          if (!roomsByFloorKey[key2]) roomsByFloorKey[key2] = [];
          roomsByFloorKey[key2].push(d);
        }
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

export async function createBuilding({
  name,
  prefix,
  manager,
  numFloors,
  roomsPerFloor = 0,
  floorNames,
  image,
  contact,
  email,
}) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Building name is required.');

  const buildingRef = doc(collection(db, COLLECTIONS.BUILDINGS));
  const code = (prefix?.trim() || generateBuildingCode(trimmedName)).toUpperCase();

  const totalFloors = Math.max(1, numFloors || (Array.isArray(floorNames) ? floorNames.length : 1));
  const rPerFloor = Math.max(0, Number(roomsPerFloor) || 0);
  const totalRooms = totalFloors * rPerFloor;

  const batch = writeBatch(db);

  batch.set(buildingRef, {
    name: trimmedName,
    code,
    prefix: code,
    image: image || '',
    totalRooms,
    floors: totalFloors,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (let fIndex = 1; fIndex <= totalFloors; fIndex += 1) {
    const floorLabel = Array.isArray(floorNames) && floorNames[fIndex - 1]
      ? floorNames[fIndex - 1].trim()
      : `Floor ${fIndex}`;

    const floorRef = doc(collection(buildingRef, COLLECTIONS.FLOORS));
    batch.set(floorRef, {
      buildingId: buildingRef.id,
      floorNumber: fIndex,
      label: floorLabel,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Auto-generate rooms per floor: e.g. TH - 101, TH - 102, etc.
    for (let rIndex = 1; rIndex <= rPerFloor; rIndex += 1) {
      const roomNumPadded = String(rIndex).padStart(2, '0');
      const roomName = `${code} - ${fIndex}${roomNumPadded}`;

      const roomRef = doc(collection(floorRef, COLLECTIONS.ROOMS));
      batch.set(roomRef, {
        buildingId: buildingRef.id,
        floorId: floorRef.id,
        floorNumber: fIndex,
        roomCode: roomName,
        name: roomName,
        type: 'Classroom',
        status: 'Available',
        capacity: 40,
        equipment: [],
        maintenanceStatus: 'operational',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

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

  // Fetch current building snapshot to check for prefix changes
  const buildingSnap = await getDoc(buildingRef);
  const currentData = buildingSnap.exists() ? buildingSnap.data() : {};
  const oldPrefix = (currentData.prefix || currentData.code || '').trim().toUpperCase();

  if (patch.name !== undefined) updates.name = patch.name.trim();

  let newPrefix = oldPrefix;
  if (patch.prefix !== undefined) {
    newPrefix = patch.prefix.trim().toUpperCase();
    updates.prefix = newPrefix;
    updates.code = newPrefix;
  }
  if (patch.image !== undefined) updates.image = patch.image;

  // Sync prefix across all existing rooms under this building if prefix has changed
  if (oldPrefix && newPrefix && oldPrefix !== newPrefix) {
    try {
      const floorsColl = collection(buildingRef, COLLECTIONS.FLOORS);
      const floorsSnap = await getDocs(floorsColl);

      for (const floorDoc of floorsSnap.docs) {
        const roomsColl = collection(floorDoc.ref, COLLECTIONS.ROOMS);
        const roomsSnap = await getDocs(roomsColl);

        for (const roomDoc of roomsSnap.docs) {
          const roomData = roomDoc.data();
          const oldName = roomData.name || roomData.roomCode || '';
          const oldCode = roomData.roomCode || oldName;

          let updatedName = oldName;
          let updatedCode = oldCode;

          if (oldName.toUpperCase().startsWith(oldPrefix)) {
            updatedName = newPrefix + oldName.slice(oldPrefix.length);
          }
          if (oldCode.toUpperCase().startsWith(oldPrefix)) {
            updatedCode = newPrefix + oldCode.slice(oldPrefix.length);
          }

          if (updatedName !== oldName || updatedCode !== oldCode) {
            await updateDoc(roomDoc.ref, {
              name: updatedName,
              roomCode: updatedCode,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    } catch (err) {
      console.error('Error updating room prefixes:', err);
    }
  }

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
