import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import Layout from '../components/Layout';
import { CategoryFilterTabs } from '../components/FilterControls';
import WorkflowLevelModal from '../components/modals/WorkflowLevelModal';
import {
  subscribeApprovalWorkflows,
  addWorkflowLevel,
  updateWorkflowLevel,
  deleteWorkflowLevel,
  reorderWorkflowLevels,
  seedDefaultWorkflowsIfEmpty,
} from '../services/approvalWorkflowService';
import { APPROVAL_TYPES } from '../constants/approvalWorkflow';

const APPROVAL_WORKFLOW_TYPES = [
  APPROVAL_TYPES.ACADEMIC,
  APPROVAL_TYPES.NON_ACADEMIC,
  APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC,
  APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC,
];

const sortWorkflowLevels = (levels) => [...levels].sort((a, b) => {
  const levelDifference = Number(a.levelNumber || 0) - Number(b.levelNumber || 0);
  if (levelDifference !== 0) return levelDifference;
  const createdDifference = Number(a.createdAt?.seconds || 0) - Number(b.createdAt?.seconds || 0);
  if (createdDifference !== 0) return createdDifference;
  return String(a.id).localeCompare(String(b.id));
});

function WorkflowTable({ levels, onEdit, onDelete, onMoveUp, onMoveDown, onReorder, onAdd }) {
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const dropLevel = (targetId) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const reordered = [...levels];
    const from = reordered.findIndex((level) => level.id === draggedId);
    const to = reordered.findIndex((level) => level.id === targetId);
    if (from >= 0 && to >= 0) {
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      onReorder(reordered);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Level', 'Role', 'Actions'].map((h) => (
                <th key={h} className="text-left text-[10px] font-black uppercase tracking-wider text-gray-400 py-3 px-5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-10 text-center text-sm text-gray-400">
                  No approval levels configured yet.
                </td>
              </tr>
            ) : (
              levels.map((level, index) => (
                <tr
                  key={level.id}
                  draggable
                  onDragStart={(event) => {
                    setDraggedId(level.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', level.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverId(level.id);
                  }}
                  onDragLeave={() => setDragOverId((current) => current === level.id ? null : current)}
                  onDrop={(event) => { event.preventDefault(); dropLevel(level.id); }}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                  className={`border-b border-gray-50 transition-all ${draggedId === level.id ? 'opacity-40 bg-red-50' : dragOverId === level.id ? 'bg-red-50 border-t-2 border-t-[#7A0808]' : 'hover:bg-gray-50/40'}`}
                >
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2">
                      <GripVertical size={16} className="cursor-grab text-gray-400 active:cursor-grabbing" />
                      <span className="text-sm font-bold text-dark">{index + 1}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5 text-sm font-semibold text-dark">{level.roleLabel || level.roleId}</td>
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-1">
                      <button type="button" className="p-1.5 rounded-lg hover:bg-gray-100" onClick={() => onMoveUp(level.id)} disabled={index === 0} title="Move up">
                        <ChevronUp size={14} />
                      </button>
                      <button type="button" className="p-1.5 rounded-lg hover:bg-gray-100" onClick={() => onMoveDown(level.id)} disabled={index === levels.length - 1} title="Move down">
                        <ChevronDown size={14} />
                      </button>
                      <button type="button" className="p-1.5 rounded-lg hover:bg-red-50 text-[#7A0808]" onClick={() => onEdit(level)} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button type="button" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" onClick={() => onDelete(level)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-gray-100">
        <button type="button" className="btn-maroon" onClick={onAdd}>
          <Plus size={16} /> Add Level
        </button>
      </div>
    </div>
  );
}

export default function ApprovalWorkflowManagement() {
  const [tab, setTab] = useState(APPROVAL_TYPES.ACADEMIC);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const normalizingRef = useRef(false);
  const lastNormalizationSignatureRef = useRef('');

  useEffect(() => {
    seedDefaultWorkflowsIfEmpty().catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || normalizingRef.current || workflows.length === 0) return;
    const inconsistentGroups = APPROVAL_WORKFLOW_TYPES.map((approvalType) => ({
      approvalType,
      levels: sortWorkflowLevels(workflows.filter((workflow) => workflow.approvalType === approvalType)),
    })).filter(({ levels }) => levels.some((level, index) => Number(level.levelNumber) !== index + 1));

    if (inconsistentGroups.length === 0) return;
    const signature = inconsistentGroups.map(({ approvalType, levels }) => `${approvalType}:${levels.map((level) => `${level.id}@${level.levelNumber}`).join(',')}`).join('|');
    if (lastNormalizationSignatureRef.current === signature) return;
    lastNormalizationSignatureRef.current = signature;
    normalizingRef.current = true;
    Promise.all(inconsistentGroups.map(({ approvalType, levels }) => (
      reorderWorkflowLevels(approvalType, levels.map((level) => level.id))
    )))
      .catch((err) => {
        lastNormalizationSignatureRef.current = '';
        setError(err.message || 'Failed to normalize workflow rankings.');
      })
      .finally(() => { normalizingRef.current = false; });
  }, [workflows, loading]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeApprovalWorkflows(
      (data) => {
        setWorkflows(data);
        setLoading(false);
        setError('');
      },
      (err) => {
        setError(err.message || 'Failed to load approval workflows.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  const academicLevels = useMemo(
    () => sortWorkflowLevels(workflows.filter((w) => w.approvalType === APPROVAL_TYPES.ACADEMIC)),
    [workflows],
  );
  const nonAcademicLevels = useMemo(
    () => sortWorkflowLevels(workflows.filter((w) => w.approvalType === APPROVAL_TYPES.NON_ACADEMIC)),
    [workflows],
  );
  const deanManagedAcademicLevels = useMemo(
    () => sortWorkflowLevels(workflows.filter((w) => w.approvalType === APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC)),
    [workflows],
  );
  const deanManagedNonAcademicLevels = useMemo(
    () => sortWorkflowLevels(workflows.filter((w) => w.approvalType === APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC)),
    [workflows],
  );

  const currentLevels = tab === APPROVAL_TYPES.ACADEMIC 
    ? academicLevels 
    : tab === APPROVAL_TYPES.NON_ACADEMIC 
      ? nonAcademicLevels 
      : tab === APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC
        ? deanManagedAcademicLevels
        : deanManagedNonAcademicLevels;

  const reorder = async (orderedLevels) => {
    await reorderWorkflowLevels(tab, orderedLevels.map((l) => l.id));
  };

  const moveLevel = async (id, direction) => {
    const list = [...currentLevels];
    const index = list.findIndex((l) => l.id === id);
    if (index === -1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    await reorder(list);
  };

  const handleDelete = async (level) => {
    if (!window.confirm(`Delete Level ${level.levelNumber} (${level.roleLabel})?`)) return;
    await deleteWorkflowLevel(level.id);
    const remaining = currentLevels.filter((l) => l.id !== level.id);
    if (remaining.length) await reorder(remaining);
  };

  return (
    <Layout
      title="Approval Workflow"
      subtitle="Configure multi-level approval chains for academic and non-academic room reservations"
    >
      {error && (
        <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="mb-5 w-fit max-w-full">
        <div className="inline-flex w-fit flex-wrap items-center p-1 gap-1 shadow-sm" style={{ background: '#F9FAFB', borderRadius: 10 }}>
          <button
            type="button"
            onClick={() => setTab(APPROVAL_TYPES.ACADEMIC)}
            className="px-5 py-2 text-sm font-bold transition-all whitespace-nowrap"
            style={
              tab === APPROVAL_TYPES.ACADEMIC
                ? { background: '#7A0808', color: 'white', borderRadius: 10 }
                : { background: 'transparent', color: '#2B3235', borderRadius: 10 }
            }
          >
            Academic ({academicLevels.length})
          </button>
          <button
            type="button"
            onClick={() => setTab(APPROVAL_TYPES.NON_ACADEMIC)}
            className="px-5 py-2 text-sm font-bold transition-all whitespace-nowrap"
            style={
              tab === APPROVAL_TYPES.NON_ACADEMIC
                ? { background: '#7A0808', color: 'white', borderRadius: 10 }
                : { background: 'transparent', color: '#2B3235', borderRadius: 10 }
            }
          >
            Non-Academic ({nonAcademicLevels.length})
          </button>
          <button
            type="button"
            onClick={() => setTab(APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC)}
            className="px-5 py-2 text-sm font-bold transition-all whitespace-nowrap"
            style={
              tab === APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC
                ? { background: '#7A0808', color: 'white', borderRadius: 10 }
                : { background: 'transparent', color: '#2B3235', borderRadius: 10 }
            }
          >
            Dean-Managed Academic ({deanManagedAcademicLevels.length})
          </button>
          <button
            type="button"
            onClick={() => setTab(APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC)}
            className="px-5 py-2 text-sm font-bold transition-all whitespace-nowrap"
            style={
              tab === APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC
                ? { background: '#7A0808', color: 'white', borderRadius: 10 }
                : { background: 'transparent', color: '#2B3235', borderRadius: 10 }
            }
          >
            Dean-Managed Non-Academic ({deanManagedNonAcademicLevels.length})
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-12 text-center">Loading workflow configuration…</p>
      ) : (
        <>
          {(tab === APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC || tab === APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC) && (
            <div className="mb-5 bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h4 className="text-sm font-black text-blue-900 mb-2">
                {tab === APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC 
                  ? 'Dean-Managed Academic Rooms Workflow' 
                  : 'Dean-Managed Non-Academic Rooms Workflow'}
              </h4>
              <p className="text-xs font-medium text-blue-800 mb-2">
                {tab === APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC
                  ? 'This workflow applies to academic reservations for rooms assigned to a specific dean. Typical flow: College Dean → GSD → Room Manager Dean (final approval).'
                  : 'This workflow applies to non-academic reservations for rooms assigned to a specific dean. Typical flow: Student Life → GSD → Room Manager Dean (final approval).'}
              </p>
              <p className="text-xs font-medium text-blue-700">
                💡 The "Room Manager Dean" role is dynamically replaced with the specific dean assigned to manage the room/floor.
              </p>
            </div>
          )}
          
          <WorkflowTable
            levels={currentLevels}
            onEdit={(level) => setModal({ mode: 'edit', level })}
            onDelete={handleDelete}
            onMoveUp={(id) => moveLevel(id, 'up')}
            onMoveDown={(id) => moveLevel(id, 'down')}
            onReorder={reorder}
            onAdd={() => setModal({ mode: 'add', approvalType: tab, nextLevelNumber: currentLevels.length + 1 })}
          />

        </>
      )}

      {modal?.mode === 'add' && (
        <WorkflowLevelModal
          approvalType={modal.approvalType}
          nextLevelNumber={modal.nextLevelNumber}
          onClose={() => setModal(null)}
          onSave={(form) => addWorkflowLevel(form)}
        />
      )}
      {modal?.mode === 'edit' && (
        <WorkflowLevelModal
          initial={modal.level}
          onClose={() => setModal(null)}
          onSave={(form) => updateWorkflowLevel(modal.level.id, form)}
        />
      )}
    </Layout>
  );
}
