import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Plus, MoreVertical, Shield, UserCog, Users, Building2, KeyRound, Trash2, Pencil } from 'lucide-react';
import Layout from '../components/Layout';
import ProgressStatCards from '../components/ProgressStatCards';
import AddUserModal from '../components/modals/AddUserModal';
import UserFilterModal from '../components/modals/UserFilterModal';
import UserActionsModal from '../components/modals/UserActionsModal';
import EditUserModal from '../components/modals/EditUserModal';
import RoleAccessModal from '../components/modals/RoleAccessModal';
import AddRoleModal from '../components/modals/AddRoleModal';
import LoadingModal from '../components/modals/LoadingModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import { useAuth } from '../context/AuthContext';
import { useRoleConfig } from '../context/RoleConfigContext';
import { useModal } from '../hooks/useModal';
import {
  createStaffUserByEmailInvite,
  subscribeStaffUsers,
  updateStaffUser,
  deleteStaffUser,
} from '../services/systemUserService';
import {
  deleteRoleDefinition,
  getRoleOptionsFromDefinitions,
  saveRoleDefinition,
} from '../services/roleDefinitionService';

const roleStyle = (role) => {
  const r = (role || '').toLowerCase();
  if (r.includes('admin') || r.includes('registrar') || r.includes('dean')) return 'bg-sky-100 text-sky-900';
  if (r.includes('teacher')) return 'bg-emerald-100 text-emerald-900';
  if (r.includes('head')) return 'bg-violet-100 text-violet-900';
  return 'bg-gray-100 text-gray-800';
};

export default function SystemAdministration() {
  const { profile } = useAuth();
  const { roleDefinitionsList, roleDefinitions, loading: rolesLoading, error: rolesError } = useRoleConfig();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filter, setFilter] = useState({ role: 'Any', status: 'Any' });
  const [actionUser, setActionUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [editRole, setEditRole] = useState(null);
  const [showAddRole, setShowAddRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');

  const roleValues = useMemo(
    () => roleDefinitionsList.map((r) => r.id),
    [roleDefinitionsList],
  );

  const roleOptions = useMemo(
    () => getRoleOptionsFromDefinitions(roleDefinitionsList),
    [roleDefinitionsList],
  );

  useEffect(() => {
    if (!roleValues.length) return undefined;
    const unsub = subscribeStaffUsers(
      (list) => {
        setUsers(list);
        setLoadError('');
      },
      (err) => setLoadError(err.message || 'Failed to load users.'),
      roleValues,
      roleDefinitions,
    );
    return unsub;
  }, [roleValues, roleDefinitions]);

  const addUser = async (form) => {
    setIsLoading(true);
    setLoadingMessage('Creating user...');
    
    try {
      await createStaffUserByEmailInvite(
        {
          name: form.name,
          email: form.email,
          department: form.department,
          college: form.college,
          roleValue: form.role,
          permissions: form.permissions,
          navKeys: form.navKeys,
        },
        profile?.uid,
      );
      showNotification({
        type: 'success',
        title: 'User added',
        message: `${form.name} has been added successfully.`,
      });
      setShowAdd(false);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to add user',
        message: error.message || 'An error occurred while adding the user.',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const saveUserEdits = async (payload) => {
    const confirmed = await showConfirm({
      title: 'Save changes?',
      message: `Update user information for ${payload.name}?`,
      confirmText: 'Save changes',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Updating user...');
    setSavingUser(true);
    
    try {
      await updateStaffUser(payload);
      showNotification({
        type: 'success',
        title: 'User updated',
        message: 'User information has been updated successfully.',
      });
      setEditUser(null);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message || 'Failed to update user information.',
      });
    } finally {
      setSavingUser(false);
      setIsLoading(false);
    }
  };

  const saveRoleAccess = async (payload) => {
    const confirmed = await showConfirm({
      title: 'Update role access?',
      message: `This will affect all users with the "${payload.label}" role who don't have custom access.`,
      confirmText: 'Update role',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Updating role access...');
    setSavingRole(true);
    
    try {
      await saveRoleDefinition(payload);
      showNotification({
        type: 'success',
        title: 'Role updated',
        message: `"${payload.label}" role access has been updated.`,
      });
      setEditRole(null);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message || 'Failed to update role access.',
      });
    } finally {
      setSavingRole(false);
      setIsLoading(false);
    }
  };

  const createRole = async (payload) => {
    setIsLoading(true);
    setLoadingMessage('Creating role...');
    setSavingRole(true);
    
    try {
      const roleKey = await saveRoleDefinition(payload, roleDefinitionsList);
      showNotification({
        type: 'success',
        title: 'Role created',
        message: `"${payload.label}" role has been created successfully.`,
      });
      setShowAddRole(false);
      return roleKey;
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Creation failed',
        message: error.message || 'Failed to create role.',
      });
      throw error;
    } finally {
      setSavingRole(false);
      setIsLoading(false);
    }
  };

  const removeRole = async (role) => {
    if (role.isSystem) {
      showNotification({
        type: 'warning',
        title: 'Cannot delete',
        message: 'Built-in roles cannot be deleted.',
      });
      return;
    }

    const inUse = users.some((u) => u.roleValue === role.id);
    if (inUse) {
      showNotification({
        type: 'warning',
        title: 'Role in use',
        message: 'Cannot delete a role that is assigned to users. Reassign those users first.',
      });
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete role?',
      message: `Are you sure you want to delete "${role.label}"? This action cannot be undone.`,
      confirmText: 'Delete role',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Deleting role...');
    
    try {
      await deleteRoleDefinition(role.id);
      showNotification({
        type: 'success',
        title: 'Role deleted',
        message: `"${role.label}" has been deleted successfully.`,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Deletion failed',
        message: err.message || 'Failed to delete role.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (user) => {
    const confirmed = await showConfirm({
      title: 'Delete user?',
      message: `Are you sure you want to delete "${user.name}"? This will remove their access to the system.`,
      confirmText: 'Delete user',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Deleting user...');
    
    try {
      await deleteStaffUser(user.uid);
      showNotification({
        type: 'success',
        title: 'User deleted',
        message: `${user.name} has been removed from the system.`,
      });
      setActionUser(null);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Delete failed',
        message: error.message || 'Failed to delete user.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filter.role !== 'Any' && u.roleValue !== filter.role) return false;
      if (filter.status !== 'Any' && u.status !== filter.status) return false;
      return true;
    });
  }, [users, filter]);

  const deans = users.filter((u) => u.roleValue === 'dean').length;
  const teachers = users.filter((u) => u.roleValue === 'teacher').length;
  const customAccess = users.filter((u) => u.useCustomAccess).length;

  const stats = [
    { label: 'Total users', value: users.length, icon: Users, accent: 'total' },
    { label: 'Roles configured', value: roleDefinitionsList.length, icon: KeyRound, accent: 'approved' },
    { label: 'Deans', value: deans, icon: UserCog, accent: 'pending' },
    { label: 'Custom access users', value: customAccess, icon: Shield, accent: 'neutral' },
  ];

  return (
    <Layout title="User Management" subtitle="Manage users, roles, navigation access, and permissions">
      <ProgressStatCards items={stats} />

      {(loadError || rolesError) && (
        <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3 mt-4">
          {loadError || rolesError}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-6 mb-4">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-bold rounded-[10px] ${tab === 'users' ? 'btn-maroon' : 'btn-outline-maroon'}`}
          onClick={() => setTab('users')}
        >
          Users
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-bold rounded-[10px] ${tab === 'roles' ? 'btn-maroon' : 'btn-outline-maroon'}`}
          onClick={() => setTab('roles')}
        >
          Roles & access
        </button>
      </div>

      {tab === 'users' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <button type="button" className="btn-maroon gap-2" style={{ borderRadius: 10 }} onClick={() => setShowFilter(true)}>
              <Filter size={16} /> Filter
            </button>
            <button type="button" className="btn-maroon gap-2" style={{ borderRadius: 10 }} onClick={() => setShowAdd(true)} disabled={rolesLoading}>
              <Plus size={16} /> Add user
            </button>
          </div>

          {(filter.role !== 'Any' || filter.status !== 'Any') && (
            <p className="text-xs font-semibold mb-2" style={{ color: '#800000' }}>
              Filtered: {filter.role} · {filter.status} ({filteredUsers.length} shown)
            </p>
          )}

          <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Name</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Email</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Role</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Access</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>College/Dept</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Status</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider w-12" style={{ color: '#2B3235' }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: '#800000', borderRadius: 10 }}>
                            {u.initials}
                          </div>
                          <span className="font-bold" style={{ color: '#2B3235' }}>{u.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium" style={{ color: '#2B3235', opacity: 0.85 }}>{u.email}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-black px-2 py-1 uppercase ${roleStyle(u.role)}`} style={{ borderRadius: 8 }}>{u.role}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full border border-gray-200" style={{ color: '#2B3235' }}>
                          {u.useCustomAccess ? 'Custom' : 'Role default'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium" style={{ color: '#2B3235', opacity: 0.8 }}>{u.department}</td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#2B3235' }}>
                          <span className={`w-2 h-2 rounded-full ${u.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`} />
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button type="button" className="p-1.5 hover:bg-gray-100" style={{ borderRadius: 10 }} onClick={() => setActionUser(u)}>
                          <MoreVertical size={16} style={{ color: '#2B3235', opacity: 0.55 }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 text-xs font-semibold" style={{ color: '#2B3235', opacity: 0.75 }}>
              <span>Showing {filteredUsers.length} user(s)</span>
            </div>
          </div>
        </>
      )}

      {tab === 'roles' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-xs font-medium" style={{ color: '#2B3235', opacity: 0.7 }}>
              Configure default navigation and permissions for each role. Users inherit these unless given custom access.
            </p>
            <button type="button" className="btn-maroon gap-2" style={{ borderRadius: 10 }} onClick={() => setShowAddRole(true)}>
              <Plus size={16} /> Add role
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {roleDefinitionsList.map((role) => (
              <div key={role.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-black text-base" style={{ color: '#2B3235' }}>{role.label}</p>
                    <p className="text-[10px] font-semibold uppercase opacity-50 mt-0.5">{role.id}</p>
                  </div>
                  {role.isSystem && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-900">Built-in</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-4 text-[10px] font-bold" style={{ color: '#2B3235' }}>
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                    {role.navKeys?.length || 0} nav items
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                    {role.permissions?.length || 0} permissions
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                    {users.filter((u) => u.roleValue === role.id).length} user(s)
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-maroon text-xs flex-1 justify-center py-2 gap-1" onClick={() => setEditRole(role)}>
                    <Pencil size={12} /> Edit access
                  </button>
                  {!role.isSystem && (
                    <button type="button" className="btn-outline-maroon text-xs px-3 py-2" onClick={() => removeRole(role)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onSave={addUser}
          roleOptions={roleOptions}
          roleDefinitions={roleDefinitions}
          roleDefinitionsList={roleDefinitionsList}
          onSaveRole={createRole}
        />
      )}
      {showFilter && (
        <UserFilterModal
          onClose={() => setShowFilter(false)}
          onApply={setFilter}
          initialRole={filter.role}
          initialStatus={filter.status}
          roleOptions={roleOptions}
        />
      )}
      {actionUser && (
        <UserActionsModal
          user={actionUser}
          onClose={() => setActionUser(null)}
          onEdit={setEditUser}
          onDelete={deleteUser}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          roleDefinitionsList={roleDefinitionsList}
          roleDefinitions={roleDefinitions}
          onClose={() => setEditUser(null)}
          onSave={saveUserEdits}
          saving={savingUser}
        />
      )}
      {editRole && (
        <RoleAccessModal
          role={editRole}
          onClose={() => setEditRole(null)}
          onSave={saveRoleAccess}
          saving={savingRole}
        />
      )}
      {showAddRole && (
        <AddRoleModal
          onClose={() => setShowAddRole(false)}
          onSave={createRole}
          saving={savingRole}
          existingRoles={roleDefinitionsList}
        />
      )}

      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </Layout>
  );
}
