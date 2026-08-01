import React, { useState, useEffect } from 'react';
import { X, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { subscribeStaffUsers, getActiveDeans } from '../../services/systemUserService';
import { subscribeEquipments, addEquipmentItem, DEFAULT_EQUIPMENT_OPTIONS } from '../../services/equipmentService';

const roomTypes = ['Classroom', 'Laboratory', 'Lecture Room', 'Seminar Room', 'Conference Room', 'Gymnasium'];
const statuses = ['Available', 'Occupied', 'Maintenance'];

export default function AddRoomModal({ buildingId, buildingPrefix, floorId, floor, floorManagedBy, existingRoomsCount = 0, onClose }) {
  const { addRoom, currentUser } = useApp();
  const [form, setForm] = useState({ name: '', type: 'Classroom', capacity: '40', status: 'Available', equipment: [], managedBy: '' });
  const [types, setTypes] = useState(roomTypes);
  const [equipmentChoices, setEquipmentChoices] = useState(DEFAULT_EQUIPMENT_OPTIONS);
  const [newType, setNewType] = useState('');
  const [newEquipment, setNewEquipment] = useState('');
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRegistrar = currentUser?.role === 'registrar';

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

  const addCustomType = () => {
    const t = newType.trim();
    if (!t) return;
    if (!types.some((x) => x.toLowerCase() === t.toLowerCase())) setTypes((prev) => [...prev, t]);
    setForm((f) => ({ ...f, type: t }));
    setNewType('');
  };

  const addCustomEquipment = async () => {
    const item = newEquipment.trim();
    if (!item) return;
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
        className="bg-white rounded-2xl w-full max-w-md p-7 relative max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>Add New Room</h2>
        <p className="text-xs text-gray-400 mb-6">Add a room to Floor {floor}</p>

        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
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
            <label className="form-label font-bold text-gray-700">
              Room Type <span className="text-red-500">*</span>
            </label>
            <select
              className="form-input font-bold bg-white"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              required
            >
              <option value="">Select room type</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
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
            <select
              className="form-input font-bold bg-white"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Equipment Checkbox Selector */}
          <div>
            <label className="form-label font-bold text-gray-700 mb-1">Equipment / Facilities</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-white rounded-xl border border-gray-200 mb-2">
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
            <div className="flex gap-2">
              <input
                className="form-input bg-white text-xs"
                placeholder="Add custom equipment (e.g. Smart TV)"
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomEquipment())}
              />
              <button
                type="button"
                className="btn-outline-maroon text-xs whitespace-nowrap px-3.5 font-bold"
                onClick={addCustomEquipment}
              >
                + Add
              </button>
            </div>
          </div>

          <div>
            <label className="form-label font-bold text-gray-700">Room Manager (Dean)</label>
            <select
              className="form-input font-bold bg-white"
              value={form.managedBy}
              onChange={(e) => setForm((f) => ({ ...f, managedBy: e.target.value }))}
            >
              <option value="">No manager (registrar managed)</option>
              {deans.map((dean) => (
                <option key={dean.uid} value={dean.uid}>
                  {dean.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
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
              className="btn-maroon flex-1 justify-center py-2.5 font-bold shadow-md"
              style={{ borderRadius: 10 }}
              disabled={loading}
            >
              {loading ? 'Adding…' : 'Add Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
