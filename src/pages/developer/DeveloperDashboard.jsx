import React, { useEffect, useMemo, useState } from 'react';
import { Filter, MoreVertical, Plus, Search, UserCheck, UserMinus, Users } from 'lucide-react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import ProgressStatCards from '../../components/ProgressStatCards';
import CreateRegistrarModal from '../../components/developer/modals/CreateRegistrarModal';
import EditRegistrarModal from '../../components/developer/modals/EditRegistrarModal';
import RegistrarActionsModal from '../../components/developer/modals/RegistrarActionsModal';
import RegistrarFilterModal from '../../components/developer/modals/RegistrarFilterModal';
import { TableSkeleton } from '../../components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { USER_STATUS } from '../../firebase/constants';
import {
  createRegistrarAccount,
  deleteRegistrarAccount,
  resetRegistrarPassword,
  setRegistrarStatus,
  subscribeRegistrars,
  updateRegistrarAccount,
} from '../../services/registrarService';

export default function DeveloperDashboard() {
  const { profile } = useAuth();
  const [registrars, setRegistrars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ status: 'any' });
  const [showCreate, setShowCreate] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [editRegistrar, setEditRegistrar] = useState(null);
  const [actionRegistrar, setActionRegistrar] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribeRegistrars(
      (list) => {
        setRegistrars(list);
        setLoadError('');
        setLoading(false);
      },
      (err) => {
        setLoadError(err.message || 'Unable to load registrars.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registrars.filter((r) => {
      if (filter.status !== 'any' && r.status !== filter.status) return false;
      if (!q) return true;
      return (
        (r.displayName || '').toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q)
        || (r.department || '').toLowerCase().includes(q)
      );
    });
  }, [registrars, search, filter]);

  const activeCount = registrars.filter((r) => r.status === USER_STATUS.ACTIVE).length;
  const inactiveCount = registrars.length - activeCount;

  const stats = [
    { label: 'Total registrars', value: registrars.length, icon: Users, accent: 'neutral' },
    { label: 'Active', value: activeCount, icon: UserCheck, accent: 'approved' },
    { label: 'Inactive', value: inactiveCount, icon: UserMinus, accent: 'rejected' },
    { label: 'Filtered view', value: filtered.length, icon: Search, accent: 'pending' },
  ];

  const handleCreate = async (form) => {
    setBusy(true);
    try {
      await createRegistrarAccount(form, profile.uid);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (payload) => {
    setBusy(true);
    try {
      await updateRegistrarAccount(payload.uid, payload, profile.uid);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (registrar) => {
    setBusy(true);
    try {
      const next = registrar.status === USER_STATUS.ACTIVE ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE;
      await setRegistrarStatus(registrar.uid, next, profile.uid);
      setActionRegistrar(null);
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (registrar) => {
    setBusy(true);
    try {
      await resetRegistrarPassword(registrar.email);
      alert(`Password reset email sent to ${registrar.email}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (registrar) => {
    setBusy(true);
    try {
      await deleteRegistrarAccount(registrar.uid);
      setActionRegistrar(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DeveloperLayout title="Registrar Account Management" subtitle="Create and manage Registrar access only — no system scheduling features">
      <ProgressStatCards items={stats} />

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-6 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="form-input pl-9"
            placeholder="Search by name, email, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="button" className="btn-outline-maroon gap-2" style={{ borderRadius: 10, borderColor: '#800000', color: '#800000' }} onClick={() => setShowFilter(true)}>
          <Filter size={16} /> Filter
        </button>
        <button type="button" className="gap-2 text-white font-semibold px-5 py-2 rounded-[10px] flex items-center" style={{ background: '#800000' }} onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Create Registrar
        </button>
      </div>

      {loadError && (
        <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{loadError}</p>
      )}

      {filter.status !== 'any' && (
        <p className="text-xs font-semibold mb-2" style={{ color: '#800000' }}>
          Status filter: {filter.status} ({filtered.length} shown)
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider">Name</th>
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider">Email</th>
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider">Department</th>
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider">Permissions</th>
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider">Status</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.uid} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: '#800000', borderRadius: 10 }}>
                        {r.initials || 'R'}
                      </div>
                      <span className="font-bold">{r.displayName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium opacity-85">{r.email}</td>
                  <td className="py-3 px-4 font-medium opacity-80">{r.department || '—'}</td>
                  <td className="py-3 px-4 text-xs font-semibold opacity-75">{(r.permissions || []).length} assigned</td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1.5 text-xs font-bold">
                      <span className={`w-2 h-2 rounded-full ${r.status === USER_STATUS.ACTIVE ? 'bg-green-500' : 'bg-red-500'}`} />
                      {r.status === USER_STATUS.ACTIVE ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button type="button" className="p-1.5 hover:bg-gray-100 rounded-lg" onClick={() => setActionRegistrar(r)}>
                      <MoreVertical size={16} className="opacity-55" />
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm font-medium text-gray-500">
                    No registrar accounts match your search. Create one to allow login.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showCreate && <CreateRegistrarModal onClose={() => setShowCreate(false)} onSave={handleCreate} saving={busy} />}
      {showFilter && (
        <RegistrarFilterModal
          onClose={() => setShowFilter(false)}
          onApply={setFilter}
          initialStatus={filter.status}
        />
      )}
      {editRegistrar && (
        <EditRegistrarModal
          registrar={editRegistrar}
          onClose={() => setEditRegistrar(null)}
          onSave={handleUpdate}
          saving={busy}
        />
      )}
      {actionRegistrar && (
        <RegistrarActionsModal
          registrar={actionRegistrar}
          onClose={() => setActionRegistrar(null)}
          onEdit={(r) => setEditRegistrar(r)}
          onToggleStatus={handleToggleStatus}
          onResetPassword={handleResetPassword}
          onDelete={handleDelete}
          busy={busy}
        />
      )}
    </DeveloperLayout>
  );
}
