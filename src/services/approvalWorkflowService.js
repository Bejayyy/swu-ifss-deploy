import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS, ROLES } from '../firebase/constants';
import { APPROVAL_TYPES } from '../constants/approvalWorkflow';
import { getRoleLabelById } from './roleService';

function workflowCollection() {
  return collection(db, COLLECTIONS.APPROVAL_WORKFLOWS);
}

function mapWorkflowDoc(d) {
  return { id: d.id, ...d.data() };
}

export function subscribeApprovalWorkflows(onData, onError) {
  const q = query(workflowCollection(), orderBy('approvalType'), orderBy('levelNumber'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(mapWorkflowDoc)),
    onError,
  );
}

export async function fetchWorkflowLevels(approvalType) {
  try {
    const q = query(
      workflowCollection(),
      where('approvalType', '==', approvalType),
      orderBy('levelNumber'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapWorkflowDoc);
  } catch (err) {
    console.warn(`Permission notice reading approval_workflows (${approvalType}):`, err?.message || err);
    return [];
  }
}

export async function getWorkflowSnapshot(approvalType) {
  const levels = await fetchWorkflowLevels(approvalType);
  return levels.map((level) => ({
    workflowId: level.id,
    levelNumber: level.levelNumber,
    roleId: level.roleId,
    roleLabel: level.roleLabel || getRoleLabelById(level.roleId),
  }));
}

export async function addWorkflowLevel({ approvalType, roleId, levelNumber }) {
  if (!roleId) throw new Error('Select a role for this approval level.');
  const ref = doc(workflowCollection());
  await setDoc(ref, {
    approvalType,
    roleId,
    roleLabel: getRoleLabelById(roleId),
    levelNumber: Number(levelNumber),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWorkflowLevel(workflowId, { roleId, levelNumber }) {
  if (!roleId) throw new Error('Select a role for this approval level.');
  await setDoc(
    doc(db, COLLECTIONS.APPROVAL_WORKFLOWS, workflowId),
    {
      roleId,
      roleLabel: getRoleLabelById(roleId),
      levelNumber: Number(levelNumber),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteWorkflowLevel(workflowId) {
  await deleteDoc(doc(db, COLLECTIONS.APPROVAL_WORKFLOWS, workflowId));
}

export async function reorderWorkflowLevels(approvalType, orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, COLLECTIONS.APPROVAL_WORKFLOWS, id), {
      levelNumber: index + 1,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function seedDefaultWorkflowsIfEmpty() {
  const snap = await getDocs(workflowCollection());
  if (!snap.empty) return false;

  const defaults = [
    // Standard Academic Workflow
    { approvalType: APPROVAL_TYPES.ACADEMIC, roleId: ROLES.ORGANIZATION_HEAD, levelNumber: 1 },
    { approvalType: APPROVAL_TYPES.ACADEMIC, roleId: ROLES.DEAN, levelNumber: 2 },
    { approvalType: APPROVAL_TYPES.ACADEMIC, roleId: ROLES.REGISTRAR, levelNumber: 3 },
    
    // Standard Non-Academic Workflow
    { approvalType: APPROVAL_TYPES.NON_ACADEMIC, roleId: ROLES.STUDENT_LIFE, levelNumber: 1 },
    { approvalType: APPROVAL_TYPES.NON_ACADEMIC, roleId: ROLES.REGISTRAR, levelNumber: 2 },
    
    // Dean-Managed Academic Rooms Workflow (for academic rooms assigned to specific deans)
    { approvalType: APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC, roleId: ROLES.DEAN, levelNumber: 1, roleLabel: 'College Dean' },
    { approvalType: APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC, roleId: ROLES.GSD, levelNumber: 2 },
    { approvalType: APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC, roleId: 'room-manager-dean', levelNumber: 3, roleLabel: 'Room Manager Dean' },
    
    // Dean-Managed Non-Academic Rooms Workflow (for non-academic rooms assigned to specific deans)
    { approvalType: APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC, roleId: ROLES.STUDENT_LIFE, levelNumber: 1 },
    { approvalType: APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC, roleId: ROLES.GSD, levelNumber: 2 },
    { approvalType: APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC, roleId: 'room-manager-dean', levelNumber: 3, roleLabel: 'Room Manager Dean' },
  ];

  const batch = writeBatch(db);
  defaults.forEach((level) => {
    const ref = doc(workflowCollection());
    batch.set(ref, {
      ...level,
      roleLabel: level.roleLabel || getRoleLabelById(level.roleId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return true;
}
