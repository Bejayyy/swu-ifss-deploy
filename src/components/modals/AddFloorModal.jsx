import React, { useState, useEffect } from 'react';
import { X, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { subscribeStaffUsers, getActiveDeans } from '../../services/systemUserService';
import { updateAllRoomsOnFloor } from '../../services/buildingService';
import CustomSelect from '../ui/CustomSelect';

export default function AddFloorModal({ buildingId, buildingName, onClose }) {
  const { addFloor, currentUser } = useApp();
  const [label, setLabel] = useState('');
  const [managedBy, setManagedBy] = useState(''); // Dean UID
  const [applyToAllRooms, setApplyToAllRooms] = useState(false);
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRegistrar = currentUser?.role === 'registrar';

  // Subscribe to staff users to get dean list
  useEffect(() => {
    return subscribeStaffUsers(
      (users) => setStaffUsers(users),
      (err) => console.error('Error loading staff:', err)
    );
  }, []);

  const deans = getActiveDeans(staffUsers);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const floorData = {
        label,
        managedBy: managedBy || null, // null means managed by registrar
        managedByName: managedBy ? deans.find(d => d.uid === managedBy)?.name : null,
      };
      const result = await addFloor(buildingId, floorData);
      
      // If "Apply to all rooms" is checked and floor was created successfully
      if (applyToAllRooms && managedBy && result?.floorId) {
        await updateAllRoomsOnFloor(buildingId, result.floorId, {
          managedBy: managedBy,
          managedByName: floorData.managedByName,
        });
      }
      
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add floor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-7 relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>Add Floor</h2>
        <p className="text-xs text-gray-400 mb-6">Add a new floor to {buildingName}</p>
        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="form-label">Floor label</label>
            <input
              className="form-input"
              placeholder="e.g., Ground Floor, Floor 5"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          
          {isRegistrar && (
            <div className="mb-6">
              <label className="form-label flex items-center gap-2">
                <User size={14} />
                Floor Manager (Optional)
              </label>
              <CustomSelect
                value={managedBy}
                onChange={(e) => setManagedBy(e.target.value)}
                options={[
                  { value: '', label: 'Managed by Registrar (Default)' },
                  ...deans.map((dean) => ({
                    value: dean.uid,
                    label: `${dean.name}${dean.department ? ` (${dean.department})` : ''}`,
                  })),
                ]}
                placeholder="Select Floor Manager"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                If a dean is assigned, room reservations on this floor will be approved by that dean instead of the registrar.
              </p>
              
              {managedBy && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToAllRooms}
                      onChange={(e) => setApplyToAllRooms(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-bold text-blue-900">Apply to all existing rooms</span>
                      <p className="text-[10px] text-blue-700 mt-0.5">
                        Update all rooms on this floor to be managed by this dean
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}
          
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-outline-maroon flex-1" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 justify-center" disabled={loading}>
              {loading ? 'Adding…' : 'Add Floor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
