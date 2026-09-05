import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useRoleConfig } from '../../context/RoleConfigContext';
import { subscribeStaffUsers, getActiveDeans } from '../../services/systemUserService';
import { subscribeEquipments, addEquipmentItem, DEFAULT_EQUIPMENT_OPTIONS } from '../../services/equipmentService';
import { subscribeRoomTypes, addRoomType, DEFAULT_ROOM_TYPES, normalizeRoomType } from '../../services/roomTypeService';
import { canManageBuildings, canManageAssignedRooms } from '../../constants/rolePermissions';
import CustomSelect from '../ui/CustomSelect';

const statuses = ['Available', 'Occupied', 'Maintenance'];

export default function AddRoomModal({ buildingId, buildingPrefix, floorId, floor, floorManagedBy, existingRoomsCount = 0, onClose }) {
  const { addRoom } = useApp();
  const { profile } = useAuth();
  const { roleDefinitions } = useRoleConfig();

  const [form, setForm] = useState({
    name: '',
    type: 'Lecture',
    capacity: '40',
    status: 'Available',
    equipment: [],
    managedBy: '',
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

  // Auto-generate default room name (e.g. PH - 101) based on building prefix & floor
  useEffect(() => {
    if (!form.name && floor) {
      const prefix = buildingPrefix || 'RM';
      const num = String(existingRoomsCount + 1).padStart(2, '0');
      setForm((f) => ({ ...f, name: `${prefix} - ${floor}${num}` }));
    }
  }, [buildingPrefix, floor, existingRoomsCount]);

  // Subscribe to staff users to get dean list
  useEffect(() => {
    return subscribeStaffUsers(
      (users) => setStaffUsers(users),
      (err) => console.error('Error loading staff:', err)
    );
  }, []);

  // Real-time subscription to Firestore room types database
  useEffect(() => {
    return subscribeRoomTypes(
      (types) => {
        setRoomTypeChoices((prev) => {
          const merged = new Set([...DEFAULT_ROOM_TYPES, ...types, ...prev].map(normalizeRoomType));
          if (form.type) merged.add(normalizeRoomType(form.type));
          return Array.from(merged);
        });
      },
      (err) => console.error('Error loading room types:', err)
    );
  }, [form.type]);

  // Subscribe to Firestore Equipment Database
  useEffect(() => {
    return subscribeEquipments(
      (equipments) => setEquipmentChoices(equipments),
      (err) => console.error('Error loading equipments:', err)
    );
  }, []);

  // Auto-set room manager based on floor manager
  useEffect(() => {
    if (floorManagedBy && !form.managedBy) {
      setForm((f) => ({ ...f, managedBy: floorManagedBy }));
    }
  }, [floorManagedBy, form.managedBy]);

  const deans = getActiveDeans(staffUsers);

  const toggleEquip = (item) =>
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(item) ? f.equipment.filter((x) => x !== item) : [...f.equipment, item],
    }));

  const handleAddCustomType = async () => {
    const t = normalizeRoomType(newRoomType);
    if (!t) return;

    try {
      setAddingTypeLoading(true);
      if (!roomTypeChoices.some((x) => x.toLowerCase() === t.toLowerCase())) {
        setRoomTypeChoices((prev) => [...prev, t]);
        await addRoomType(t);
      }
      setForm((f) => ({ ...f, type: t }));
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
      }));
      setNewEquipment('');
      setShowAddEquipInput(false);
    } catch (err) {
      console.error('Failed to add equipment:', err);
    } finally {
      setAddingEquipLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.type || !form.capacity) {
      setError('Room name, type, and capacity are required.');
      return;
    }
    if (!floorId) {
      setError('Floor not found. Refresh and try again.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const roomData = {
        ...form,
        type: normalizeRoomType(form.type),
        capacity: Number(form.capacity),
        managedBy: form.managedBy || null,
        managedByName: form.managedBy ? deans.find(d => d.uid === form.managedBy)?.name : null,
      };
      await addRoom(buildingId, floorId, floor, roomData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col relative shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed & Non-Scrollable */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 flex-shrink-0 bg-white">
          <div>
            <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>Add New Room</h2>
            <p className="text-xs text-gray-400">Add a room to Floor {floor}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="add-room-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div>
            <label className="form-label font-bold text-gray-700">
              Room Name / Number <span className="text-red-500">*</span>
            </label>
            <input
              className="form-input font-bold"
              placeholder="e.g., ENG-301"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="form-label font-bold text-gray-700 mb-0">
                Room Type <span className="text-red-500">*</span>
              </label>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowAddTypeInput((prev) => !prev)}
                  className="text-[11px] font-bold text-[#7A0808] hover:text-[#900C3F] flex items-center gap-1 cursor-pointer transition-colors"
                  title="Add custom room type"
                >
                  <Plus size={13} className="stroke-[2.5]" />
                  <span>Add Type</span>
                </button>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <CustomSelect
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  options={roomTypeChoices}
                  placeholder="Select room type"
                  required
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

            {/* Inline Add Custom Room Type input */}
            {showAddTypeInput && (
              <div className="mt-2 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
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

          <div>
            <label className="form-label font-bold text-gray-700">
              Capacity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              className="form-input font-bold bg-white"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              required
              min={1}
            />
          </div>

          <div>
            <label className="form-label font-bold text-gray-700">Status</label>
            <CustomSelect
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              options={statuses}
              placeholder="Select status"
            />
          </div>

          {/* Equipment / Facilities Section with matching Add UI */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="form-label font-bold text-gray-700 mb-0">
                Equipment / Facilities
              </label>
              {canManage && (
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

            {/* Inline Add Custom Equipment / Facility input */}
            {showAddEquipInput && (
              <div className="mb-2 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
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

            {/* Equipment Choices Grid */}
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

          <div>
            <label className="form-label font-bold text-gray-700">Room Manager (Dean)</label>
            <CustomSelect
              value={form.managedBy}
              onChange={(e) => setForm((f) => ({ ...f, managedBy: e.target.value }))}
              options={[
                { value: '', label: 'No manager (registrar managed)' },
                ...deans.map((dean) => ({ value: dean.uid, label: dean.name })),
              ]}
              placeholder="Select room manager"
            />
          </div>
        </form>

        {/* Footer - Fixed & Non-Scrollable */}
        <div className="p-4 px-6 border-t border-gray-100 bg-gray-50/50 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline-maroon flex-1 justify-center py-2.5 font-bold"
            style={{ borderRadius: 10 }}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-room-form"
            className="btn-maroon flex-1 justify-center py-2.5 font-bold shadow-md"
            style={{ borderRadius: 10 }}
            disabled={loading}
          >
            {loading ? 'Adding…' : 'Add Room'}
          </button>
        </div>
      </div>
    </div>
  );
}
