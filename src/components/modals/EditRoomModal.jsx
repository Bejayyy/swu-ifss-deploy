import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { subscribeStaffUsers } from '../../services/systemUserService';

const roomTypes = ['Classroom', 'Laboratory', 'Lecture Room', 'Seminar Room', 'Conference Room', 'Gymnasium'];
const equipmentOptions = ['Projector', 'Whiteboard', 'Air Conditioning', 'Audio System', 'Computers', 'Smart Board', 'CCTV'];
const statuses = ['Available', 'Occupied', 'Maintenance'];

export default function EditRoomModal({ room, buildingId, floorId, floorManagedBy, onClose }) {
  const { updateRoom } = useApp();
  const { profile } = useAuth();
  
  const [form, setForm] = useState({
    name: room?.name || room?.id || '',
    type: room?.type || '',
    capacity: room?.capacity ?? '',
    status: room?.status || 'Available',
    equipment: room?.equipment || [],
    managedBy: room?.managedBy || floorManagedBy || '',
    managedByName: room?.managedByName || '',
  });
  const [equipmentChoices, setEquipmentChoices] = useState(() => {
    // Merge existing equipment with preset options
    const existing = room?.equipment || [];
    const merged = [...equipmentOptions];
    existing.forEach(item => {
      if (!merged.includes(item)) {
        merged.push(item);
      }
    });
    return merged;
  });
  const [newEquipment, setNewEquipment] = useState('');
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canAssignManager = Boolean(profile?.role === 'registrar' || profile?.role === 'dean' || profile?.role === 'system_admin' || profile?.permissions?.includes('rooms.manage.assigned') || profile?.permissions?.includes('buildings.manage'));

  // Fetch staff users (deans)
  useEffect(() => {
    const unsub = subscribeStaffUsers((users) => {
      setStaffUsers(users);
    }, (error) => {
      console.error('EditRoomModal - Error fetching staff:', error);
    });
    return unsub;
  }, []);

  const getActiveDeans = () => {
    const deans = staffUsers.filter(
      (u) => u.roleValue === 'dean' && u.status === 'Active'
    );
    return deans;
  };

  const handleManagerChange = (e) => {
    const selectedUid = e.target.value;
    if (!selectedUid) {
      setForm((f) => ({ ...f, managedBy: '', managedByName: '' }));
      return;
    }
    const dean = getActiveDeans().find((d) => d.uid === selectedUid);
    setForm((f) => ({
      ...f,
      managedBy: selectedUid,
      managedByName: dean ? dean.name : '', // Use dean.name instead of firstName + lastName
    }));
  };

  const toggleEquip = (item) => {
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(item)
        ? f.equipment.filter((x) => x !== item)
        : [...f.equipment, item],
    }));
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
    }));
    setNewEquipment('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.type || form.capacity === '') {
      setError('Name, type, and capacity are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await updateRoom(buildingId, floorId, room.docId, {
        name: form.name,
        type: form.type,
        status: form.status,
        capacity: form.capacity,
        equipment: form.equipment,
        managedBy: form.managedBy,
        managedByName: form.managedByName,
      });
      onClose(true);
    } catch (err) {
      setError(err.message || 'Failed to update room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md p-7 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>Edit Room</h2>
        <p className="text-xs text-gray-400 mb-6">Update room details and facilities</p>
        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Room name / number</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="form-label">Room type</label>
            <select
              className="form-input"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              required
            >
              <option value="">Select type</option>
              {roomTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Capacity</label>
            <input
              type="number"
              className="form-input"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              required
              min={1}
            />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select
              className="form-input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Equipment / facilities</label>
            <div className="flex flex-wrap gap-2 mt-1 mb-3">
              {equipmentChoices.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleEquip(item)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
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
                className="form-input"
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
          {canAssignManager && (
            <div>
              <label className="form-label">Room Manager (Dean)</label>
              {floorManagedBy ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                    <p className="text-xs font-bold text-blue-900 mb-1">
                      ⚠️ Floor-level manager assigned
                    </p>
                    <p className="text-xs text-blue-700">
                      This room inherits the floor manager. To assign a different manager to this specific room, 
                      first remove the floor manager or use "Apply to specific rooms" when editing the floor.
                    </p>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value="Inherits floor manager"
                    disabled
                    style={{ background: '#f9f9f9', color: '#6b7280', cursor: 'not-allowed' }}
                  />
                </>
              ) : (
                <>
                  <select
                    className="form-input"
                    value={form.managedBy}
                    onChange={handleManagerChange}
                    style={{ color: '#2B3235' }}
                  >
                    <option value="" style={{ color: '#2B3235' }}>No manager (registrar managed)</option>
                    {getActiveDeans().map((dean) => (
                      <option key={dean.uid} value={dean.uid} style={{ color: '#2B3235' }}>
                        {dean.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Assign a specific dean to manage this room
                  </p>
                </>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-outline-maroon flex-1" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 justify-center" disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
