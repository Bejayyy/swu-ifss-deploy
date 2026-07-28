import React, { useState, useEffect } from 'react';
import { X, Edit2, Layers, CheckSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { subscribeStaffUsers } from '../../services/systemUserService';

const roomTypes = ['Classroom', 'Laboratory', 'Lecture Room', 'Seminar Room', 'Conference Room', 'Gymnasium'];
const equipmentOptions = ['Projector', 'Whiteboard', 'Air Conditioning', 'Audio System', 'Computers', 'Smart Board', 'CCTV'];
const statuses = ['Available', 'Occupied', 'Maintenance'];

export default function BulkEditRoomsModal({ selectedRooms, buildingId, floorId, onClose }) {
  const { updateRoom } = useApp();
  const { profile } = useAuth();

  const [form, setForm] = useState({
    changeType: false,
    type: 'Classroom',
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

  const [equipmentChoices, setEquipmentChoices] = useState(equipmentOptions);
  const [newEquipment, setNewEquipment] = useState('');
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canAssignManager = Boolean(
    profile?.role === 'registrar' ||
      profile?.role === 'dean' ||
      profile?.role === 'system_admin' ||
      profile?.permissions?.includes('rooms.manage.assigned') ||
      profile?.permissions?.includes('buildings.manage')
  );

  useEffect(() => {
    const unsub = subscribeStaffUsers(
      (users) => setStaffUsers(users),
      (err) => console.error('Error fetching staff:', err)
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

  const addCustomEquipment = () => {
    const item = newEquipment.trim();
    if (!item) return;
    if (!equipmentChoices.some((x) => x.toLowerCase() === item.toLowerCase())) {
      setEquipmentChoices((prev) => [...prev, item]);
    }
    setForm((f) => ({
      ...f,
      equipment: f.equipment.some((x) => x.toLowerCase() === item.toLowerCase())
        ? f.equipment
        : [...f.equipment, item],
      changeEquipment: true,
    }));
    setNewEquipment('');
  };

  const handleSubmit = async (e) => {
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

    setLoading(true);
    setError('');

    try {
      const patch = {};
      if (form.changeType) patch.type = form.type;
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

      onClose(true);
    } catch (err) {
      setError(err.message || 'Failed to update selected rooms.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => onClose(false)}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg p-7 relative max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onClose(false)}
          className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-black mb-1 flex items-center gap-2" style={{ color: '#7A0808' }}>
          <Edit2 size={20} /> Bulk Edit Rooms
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Updating <span className="font-bold text-gray-700">{selectedRooms.length} selected room(s)</span>. Check the boxes next to the fields you want to update.
        </p>

        {/* Selected Rooms Preview Pills */}
        <div className="mb-5 p-3 bg-red-50/60 border border-red-100 rounded-xl">
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
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
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
              <select
                className="form-input bg-white font-bold"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {roomTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
              <select
                className="form-input bg-white font-bold"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          {/* Equipment / Facilities */}
          <div className="p-3 border border-gray-100 rounded-xl space-y-2 bg-gray-50/50">
            <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.changeEquipment}
                onChange={(e) => setForm((f) => ({ ...f, changeEquipment: e.target.checked }))}
                className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808]"
              />
              <span>Update Equipment / Facilities</span>
            </label>
            {form.changeEquipment && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {equipmentChoices.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleEquip(item)}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                      style={
                        form.equipment.includes(item)
                          ? { background: '#7A0808', color: 'white', borderColor: '#7A0808' }
                          : { background: 'white', color: '#2B3235', borderColor: '#e2e5e8' }
                      }
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="form-input bg-white"
                    placeholder="Add custom equipment"
                    value={newEquipment}
                    onChange={(e) => setNewEquipment(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomEquipment())}
                  />
                  <button type="button" className="btn-outline-maroon whitespace-nowrap" onClick={addCustomEquipment}>
                    Add
                  </button>
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
                <select
                  className="form-input bg-white font-bold"
                  value={form.managedBy}
                  onChange={handleManagerChange}
                >
                  <option value="">No manager (Registrar managed)</option>
                  {getActiveDeans().map((d) => (
                    <option key={d.uid} value={d.uid}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="btn-outline-maroon flex-1 justify-center py-2.5"
              style={{ borderRadius: 10 }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-maroon flex-1 justify-center py-2.5"
              style={{ borderRadius: 10 }}
              disabled={loading}
            >
              {loading ? 'Saving…' : `Update ${selectedRooms.length} Rooms`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
