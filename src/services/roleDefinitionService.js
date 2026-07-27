import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import { DEFAULT_ROLE_DEFINITIONS } from '../constants/rolePermissions';

function roleDefRef(id) {
  return doc(db, COLLECTIONS.ROLE_DEFINITIONS, id);
}

export function subscribeRoleDefinitions(onData, onError) {
  const q = query(collection(db, COLLECTIONS.ROLE_DEFINITIONS), orderBy('label'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(list);
    },
    onError,
  );
}

export function roleDefinitionsToMap(list = []) {
  return list.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

export async function seedDefaultRoleDefinitions() {
  await Promise.all(
    DEFAULT_ROLE_DEFINITIONS.map((def) => setDoc(
      roleDefRef(def.id),
      {
        label: def.label,
        isSystem: def.isSystem,
        permissions: def.permissions,
        navKeys: def.navKeys,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )),
  );
}

export async function saveRoleDefinition({ id, label, permissions, navKeys, isSystem = false }, existingDefinitions = []) {
  if (!id?.trim()) throw new Error('Role key is required.');
  if (!label?.trim()) throw new Error('Role label is required.');

  const roleKey = id.trim().toLowerCase().replace(/\s+/g, '_');
  const roleLabelLower = label.trim().toLowerCase();

  if (Array.isArray(existingDefinitions) && existingDefinitions.length > 0) {
    const duplicate = existingDefinitions.find(
      (r) => (r.id || '').toLowerCase() === roleKey || (r.label || '').toLowerCase() === roleLabelLower,
    );
    if (duplicate) {
      throw new Error(`A role with key or label "${duplicate.label || duplicate.id}" already exists.`);
    }
  }

  await setDoc(
    roleDefRef(roleKey),
    {
      label: label.trim(),
      isSystem: Boolean(isSystem),
      permissions: permissions || [],
      navKeys: navKeys || [],
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
  );
  return roleKey;
}

export async function deleteRoleDefinition(roleId) {
  if (!roleId) throw new Error('Role id is required.');
  await deleteDoc(roleDefRef(roleId));
}

export function getRoleOptionsFromDefinitions(roleDefinitions = []) {
  return roleDefinitions.map((r) => ({ value: r.id, label: r.label || r.id }));
}
