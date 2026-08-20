import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { subscribeStaffUsers } from '../../services/systemUserService';
import { subscribeEquipments, addEquipmentItem, DEFAULT_EQUIPMENT_OPTIONS } from '../../services/equipmentService';
import ConfirmModal from './ConfirmModal';
import CustomSelect from '../ui/CustomSelect';

const roomTypes = ['Classroom', 'Laboratory', 'Lecture Room', 'Seminar Room', 'Conference Room', 'Gymnasium'];
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
    const existing = room?.equipment || [];
    const merged = [...DEFAULT_EQUIPMENT_OPTIONS];
    existing.forEach((item) => {
      if (item && !merged.includes(item)) {
        merged.push(item);
      }
    });
    return merged;
  });

  const [newEquipment, setNewEquipment] = useState('');
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState('');

  const canAssignManager = profile?.role === 'registrar';

  // Fetch staff users (deans)
  useEffect(() => {
    const unsub = subscribeStaffUsers(
      (users) => setStaffUsers(users),
      (err) => console.error('EditRoomModal - Error fetching staff:', err)
    );
    return unsub;
  }, []);

  // Real-time subscription to Firestore equipment database
  useEffect(() => {
    const unsub = subscribeEquipments(
      (equipments) => {
        setEquipmentChoices((prev) => {
          const roomEquip = form.equipment || [];
          const merged = new Set([...equipments, ...roomEquip, ...prev]);
          return Array.from(merged);
        });
      },
      (err) => console.error('Error fetching equipments:', err)
    );
    return unsub;
  }, [form.equipment]);

  const getActiveDeans = () => {
    return staffUsers.filter((u) => u.roleValue === 'dean' && u.status === 'Active');
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
      managedByName: dean ? dean.name : '',
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

  const handleInitialSubmit = (e) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.type || form.capacity === '') {
      setError('Name, type, and capacity are required.');
      return;
    }
    setError('');
    setShowConfirmModal(true);
  };

  const handleExecuteSubmit = async () => {
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
      setShowConfirmModal(false);
      onClose(true);
    } catch (err) {
      setError(err.message || 'Failed to update room.');
      setShowConfirmModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="bg-white rounded-2xl w-full max-w-md p-7 relative max-h-[90vh] overflow-y-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>Edit Room</h2>
          <p className="text-xs text-gray-400 mb-5">Update room details and facilities</p>

          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5 mb-4">
              {error}
            </p>
          )}

          <form onSubmit={handleInitialSubmit} className="space-y-4 text-xs">
            <div>
              <label className="form-label font-bold text-gray-700">
                Room name / number <span className="text-red-500">*</span>
              </label>
              <input
                className="form-input font-bold"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="form-label font-bold text-gray-700">
                Room type <span className="text-red-500">*</span>
              </label>
              <CustomSelect
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                options={roomTypes}
                placeholder="Select type"
                required
              />
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

            {/* Equipment / Facilities Checkbox Selector */}
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

            {canAssignManager && (
              <div>
                <label className="form-label font-bold text-gray-700">Room Manager (Dean)</label>
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
                  <CustomSelect
                    value={form.managedBy}
                    onChange={handleManagerChange}
                    options={[
                      { value: '', label: 'No manager (registrar managed)' },
                      ...getActiveDeans().map((dean) => ({ value: dean.uid, label: dean.name })),
                    ]}
                    placeholder="Select room manager"
                  />
                )}
              </div>
            )}

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
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <ConfirmModal
          title="Confirm Room Update"
          message={`Are you sure you want to save changes for room "${form.name}"?`}
          confirmText="Yes, Save Changes"
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
