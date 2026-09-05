import React, { useState, useEffect } from 'react';
import { X, Edit2, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useRoleConfig } from '../../context/RoleConfigContext';
import { subscribeStaffUsers } from '../../services/systemUserService';
import { subscribeEquipments, addEquipmentItem, DEFAULT_EQUIPMENT_OPTIONS } from '../../services/equipmentService';
import { subscribeRoomTypes, addRoomType, DEFAULT_ROOM_TYPES, normalizeRoomType } from '../../services/roomTypeService';
import { canManageBuildings, canManageAssignedRooms } from '../../constants/rolePermissions';
import ConfirmModal from './ConfirmModal';
import CustomSelect from '../ui/CustomSelect';

const statuses = ['Available', 'Occupied', 'Maintenance'];

export default function BulkEditRoomsModal({ selectedRooms, buildingId, floorId, onClose }) {
  const { updateRoom } = useApp();
  const { profile } = useAuth();
  const { roleDefinitions } = useRoleConfig();

  const [form, setForm] = useState({
    changeType: false,
    type: 'Lecture',
    changeCapacity: false,
    capacity: '40',
    changeStatus: false,
    status: 'Available',
    changeEquipment: false,
    equipment: [],
    changeManager: false,
    managedBy: '',
    managedByName: '',
  });

  const [roomTypeChoices, setRoomTypeChoices] = useState(DEFAULT_ROOM_TYPES);
  const [showAddTypeInput, setShowAddTypeInput] = useState(false);
  const [newRoomType, setNewRoomType] = useState('');
  const [addingTypeLoading, setAddingTypeLoading] = useState(false);

  const [showAddEquipInput, setShowAddEquipInput] = useState(false);
  const [equipmentChoices, setEquipmentChoices] = useState(DEFAULT_EQUIPMENT_OPTIONS);
  const [newEquipment, setNewEquipment] = useState('');
  const [addingEquipLoading, setAddingEquipLoading] = useState(false);

  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState('');

  const canManage = Boolean(
    profile?.role === 'registrar' ||
    profile?.role === 'admin' ||
    profile?.role === 'system_admin' ||
    canManageBuildings(profile?.role, roleDefinitions, profile) ||
    canManageAssignedRooms(profile?.role, roleDefinitions, profile) ||
    profile?.permissions?.includes('buildings.manage') ||
    profile?.permissions?.includes('rooms.manage.assigned')
  );

  const canAssignManager = Boolean(profile?.role === 'registrar');

  // Subscribe to Firestore Staff Users (Deans)
  useEffect(() => {
    const unsub = subscribeStaffUsers(
      (users) => setStaffUsers(users),
      (err) => console.error('Error fetching staff:', err)
    );
    return unsub;
  }, []);

  // Subscribe to Firestore Room Types
  useEffect(() => {
    const unsub = subscribeRoomTypes(
      (types) => {
        setRoomTypeChoices((prev) => {
          const merged = new Set([...DEFAULT_ROOM_TYPES, ...types, ...prev].map(normalizeRoomType));
          if (form.type) merged.add(normalizeRoomType(form.type));
          return Array.from(merged);
        });
      },
      (err) => console.error('Error fetching room types:', err)
    );
    return unsub;
  }, [form.type]);

  // Subscribe to Firestore Equipments database
  useEffect(() => {
    const unsub = subscribeEquipments(
      (equipments) => setEquipmentChoices(equipments),
      (err) => console.error('Error fetching equipments:', err)
    );
    return unsub;
  }, []);

  const getActiveDeans = () => staffUsers.filter((u) => u.roleValue === 'dean' && u.status === 'Active');

  const handleManagerChange = (e) => {
    const selectedUid = e.target.value;
    if (!selectedUid) {
      setForm((f) => ({ ...f, managedBy: '', managedByName: '', changeManager: true }));
      return;
    }
    const dean = getActiveDeans().find((d) => d.uid === selectedUid);
    setForm((f) => ({
      ...f,
      managedBy: selectedUid,
      managedByName: dean ? dean.name : '',
      changeManager: true,
    }));
  };

  const toggleEquip = (item) => {
    setForm((f) => {
      const nextEquip = f.equipment.includes(item)
        ? f.equipment.filter((x) => x !== item)
        : [...f.equipment, item];
      return { ...f, equipment: nextEquip, changeEquipment: true };
    });
  };

  const handleAddCustomType = async () => {
    const t = normalizeRoomType(newRoomType);
    if (!t) return;

    try {
      setAddingTypeLoading(true);
      if (!roomTypeChoices.some((x) => x.toLowerCase() === t.toLowerCase())) {
        setRoomTypeChoices((prev) => [...prev, t]);
        await addRoomType(t);
      }
      setForm((f) => ({ ...f, type: t, changeType: true }));
      setNewRoomType('');
      setShowAddTypeInput(false);
    } catch (err) {
      console.error('Failed to add custom room type:', err);
    } finally {
      setAddingTypeLoading(false);
    }
  };

  const addCustomEquipment = async () => {
    const item = newEquipment.trim();
    if (!item) return;

    try {
      setAddingEquipLoading(true);
      if (!equipmentChoices.some((x) => x.toLowerCase() === item.toLowerCase())) {
        setEquipmentChoices((prev) => [...prev, item]);
        await addEquipmentItem(item);
      }

      setForm((f) => ({
        ...f,
        equipment: f.equipment.some((x) => x.toLowerCase() === item.toLowerCase())
          ? f.equipment
          : [...f.equipment, item],
        changeEquipment: true,
      }));
      setNewEquipment('');
      setShowAddEquipInput(false);
    } catch (err) {
      console.error('Failed to add equipment:', err);
    } finally {
      setAddingEquipLoading(false);
    }
  };

  const handleInitialSubmit = (e) => {
    e.preventDefault();
    if (
      !form.changeType &&
      !form.changeCapacity &&
      !form.changeStatus &&
      !form.changeEquipment &&
      !form.changeManager
    ) {
      setError('Please select at least one field to update.');
      return;
    }
    setError('');
    setShowConfirmModal(true);
  };

  const handleExecuteSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const patch = {};
      if (form.changeType) patch.type = normalizeRoomType(form.type);
      if (form.changeCapacity) patch.capacity = Number(form.capacity) || 0;
      if (form.changeStatus) patch.status = form.status;
      if (form.changeEquipment) patch.equipment = form.equipment;
      if (form.changeManager) {
        patch.managedBy = form.managedBy || null;
        patch.managedByName = form.managedByName || null;
      }

      await Promise.all(
        selectedRooms.map((rm) => updateRoom(buildingId, floorId, rm.docId || rm.id, patch))
      );

      setShowConfirmModal(false);
      onClose(true);
    } catch (err) {
      setError(err.message || 'Failed to update selected rooms.');
      setShowConfirmModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={() => onClose(false)}>
        <div
          className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - Fixed & Non-Scrollable */}
          <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 flex-shrink-0 bg-white">
            <div>
              <h2 className="text-xl font-black mb-1 flex items-center gap-2" style={{ color: '#7A0808' }}>
                <Edit2 size={20} /> Bulk Edit Rooms
              </h2>
              <p className="text-xs text-gray-400">
                Updating <span className="font-bold text-gray-700">{selectedRooms.length} selected room(s)</span>. Check fields to update.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onClose(false)}
              className="text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form Content - Scrollable */}
          <form id="bulk-edit-rooms-form" onSubmit={handleInitialSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
            {/* Selected Rooms Preview Pills */}
            <div className="p-3 bg-red-50/60 border border-red-100 rounded-xl">
              <p className="text-[10px] font-bold text-[#7A0808] uppercase tracking-wider mb-1.5">
                Selected Rooms ({selectedRooms.length}):
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedRooms.map((rm) => (
                  <span
                    key={rm.docId || rm.id}
                    className="px-2.5 py-0.5 rounded-md bg-white border border-red-200 text-[#7A0808] font-bold text-xs shadow-2xs"
                  >
                    {rm.id || rm.name}
                  </span>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
                {error}
              </p>
            )}

            {/* Room Type */}
            <div className="p-3 border border-gray-100 rounded-xl space-y-2 bg-gray-50/50">
              <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.changeType}
                  onChange={(e) => setForm((f) => ({ ...f, changeType: e.target.checked }))}
                  className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808]"
                />
                <span>Update Room Type</span>
              </label>
              {form.changeType && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <CustomSelect
                        value={form.type}
                        onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                        options={roomTypeChoices}
                        placeholder="Select Room Type"
                      />
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setShowAddTypeInput((prev) => !prev)}
                        className="h-10 px-3 bg-red-50 hover:bg-red-100 text-[#7A0808] border border-red-200 rounded-xl flex items-center justify-center font-bold text-sm transition-all shadow-2xs cursor-pointer flex-shrink-0"
                        title="Add custom room type"
                      >
                        <Plus size={16} className="stroke-[2.5]" />
                      </button>
                    )}
                  </div>

                  {showAddTypeInput && (
                    <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                        <span>Add Custom Room Type</span>
                        <button
                          type="button"
                          onClick={() => setShowAddTypeInput(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="form-input bg-white text-xs flex-1"
                          placeholder="e.g. Amphitheater, Simulation Lab"
                          value={newRoomType}
                          onChange={(e) => setNewRoomType(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomType();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomType}
                          disabled={addingTypeLoading || !newRoomType.trim()}
                          className="btn-maroon text-xs px-3.5 py-1.5 font-bold whitespace-nowrap"
                        >
                          {addingTypeLoading ? 'Adding…' : '+ Add'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Capacity */}
            <div className="p-3 border border-gray-100 rounded-xl space-y-2 bg-gray-50/50">
              <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.changeCapacity}
                  onChange={(e) => setForm((f) => ({ ...f, changeCapacity: e.target.checked }))}
                  className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808]"
                />
                <span>Update Capacity</span>
              </label>
              {form.changeCapacity && (
                <input
                  type="number"
                  min="1"
                  className="form-input bg-white font-bold"
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  placeholder="e.g. 40"
                />
              )}
            </div>

            {/* Status */}
            <div className="p-3 border border-gray-100 rounded-xl space-y-2 bg-gray-50/50">
              <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.changeStatus}
                  onChange={(e) => setForm((f) => ({ ...f, changeStatus: e.target.checked }))}
                  className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808]"
                />
                <span>Update Status</span>
              </label>
              {form.changeStatus && (
                <CustomSelect
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  options={statuses}
                  placeholder="Select Status"
                />
              )}
            </div>

            {/* Equipment / Facilities */}
            <div className="p-3 border border-gray-100 rounded-xl space-y-2.5 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.changeEquipment}
                    onChange={(e) => setForm((f) => ({ ...f, changeEquipment: e.target.checked }))}
                    className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808]"
                  />
                  <span>Update Equipment / Facilities</span>
                </label>
                {form.changeEquipment && canManage && (
                  <button
                    type="button"
                    onClick={() => setShowAddEquipInput((prev) => !prev)}
                    className="text-[11px] font-bold text-[#7A0808] hover:text-[#900C3F] flex items-center gap-1 cursor-pointer transition-colors"
                    title="Add custom equipment / facility"
                  >
                    <Plus size={13} className="stroke-[2.5]" />
                    <span>Add Item</span>
                  </button>
                )}
              </div>

              {form.changeEquipment && (
                <div className="space-y-3 pt-1">
                  {showAddEquipInput && (
                    <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                        <span>Add Custom Equipment / Facility</span>
                        <button
                          type="button"
                          onClick={() => setShowAddEquipInput(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="form-input bg-white text-xs flex-1"
                          placeholder="e.g. Smart TV, Microphone, Document Camera"
                          value={newEquipment}
                          onChange={(e) => setNewEquipment(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addCustomEquipment();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={addCustomEquipment}
                          disabled={addingEquipLoading || !newEquipment.trim()}
                          className="btn-maroon text-xs px-3.5 py-1.5 font-bold whitespace-nowrap"
                        >
                          {addingEquipLoading ? 'Adding…' : '+ Add'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-white rounded-xl border border-gray-200">
                    {equipmentChoices.map((item) => {
                      const isChecked = form.equipment.includes(item);
                      return (
                        <label
                          key={item}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                            isChecked
                              ? 'bg-red-50/90 border-[#7A0808] text-[#7A0808] font-bold shadow-2xs'
                              : 'bg-gray-50/50 border-gray-200 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleEquip(item)}
                            className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          />
                          <span className="truncate">{item}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Room Manager */}
            {canAssignManager && (
              <div className="p-3 border border-gray-100 rounded-xl space-y-2 bg-gray-50/50">
                <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.changeManager}
                    onChange={(e) => setForm((f) => ({ ...f, changeManager: e.target.checked }))}
                    className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808]"
                  />
                  <span>Update Room Manager (Dean)</span>
                </label>
                {form.changeManager && (
                  <CustomSelect
                    value={form.managedBy}
                    onChange={handleManagerChange}
                    options={[
                      { value: '', label: 'No manager (Registrar managed)' },
                      ...getActiveDeans().map((d) => ({ value: d.uid, label: d.name })),
                    ]}
                    placeholder="Select room manager"
                  />
                )}
              </div>
            )}
          </form>

          {/* Footer - Fixed & Non-Scrollable */}
          <div className="p-4 px-6 border-t border-gray-100 bg-gray-50/50 flex gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="btn-outline-maroon flex-1 justify-center py-2.5 font-bold"
              style={{ borderRadius: 10 }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bulk-edit-rooms-form"
              className="btn-maroon flex-1 justify-center py-2.5 font-bold shadow-md"
              style={{ borderRadius: 10 }}
              disabled={loading}
            >
              {loading ? 'Saving…' : `Update ${selectedRooms.length} Rooms`}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <ConfirmModal
          title="Confirm Bulk Room Update"
          message={`Are you sure you want to update the selected ${selectedRooms.length} room(s) with these changes?`}
          confirmText="Yes, Update Rooms"
          cancelText="Cancel"
          variant="primary"
          isProcessing={loading}
          onConfirm={handleExecuteSubmit}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </>
  );
}
