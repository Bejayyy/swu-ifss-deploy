import React, { useState, useEffect } from 'react';
import { X, User, AlertCircle } from 'lucide-react';
import { subscribeStaffUsers, getActiveDeans } from '../../services/systemUserService';
import { updateRoomRecord } from '../../services/buildingService';
import CustomSelect from '../ui/CustomSelect';

export default function RoomManagerSettingsModal({ room, buildingId, floorId, floorManagedBy, onClose, onSuccess }) {
  const [managedBy, setManagedBy] = useState(room.managedBy || '');
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      const selectedDean = managedBy ? deans.find(d => d.uid === managedBy) : null;
      
      await updateRoomRecord(buildingId, floorId, room.docId, {
        managedBy: managedBy || null,
        managedByName: selectedDean?.name || null,
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update room manager.');
    } finally {
      setLoading(false);
    }
  };

  const effectiveManager = managedBy || (floorManagedBy && !managedBy) 
    ? deans.find(d => d.uid === (managedBy || floorManagedBy))?.name 
    : 'Registrar (Default)';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-7 relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        
        <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>
          Room Manager Settings
        </h2>
        <p className="text-xs text-gray-400 mb-6">
          Configure who approves reservations for {room.name}
        </p>

        {error && (
          <div className="mb-4 p-3 border border-red-200 bg-red-50 rounded-lg flex items-start gap-2">
            <AlertCircle size={16} className="text-red-700 mt-0.5 shrink-0" />
            <p className="text-xs font-semibold text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Current Manager Display */}
          <div className="p-4 rounded-xl border-2 border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <User size={14} className="text-gray-500" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Current Manager
              </p>
            </div>
            <p className="text-sm font-bold" style={{ color: '#2B3235' }}>
              {room.managedByName || (floorManagedBy ? deans.find(d => d.uid === floorManagedBy)?.name : null) || 'Registrar (Default)'}
            </p>
            {!room.managedBy && floorManagedBy && (
              <p className="text-[10px] text-gray-500 mt-1">
                Inherited from floor manager
              </p>
            )}
          </div>

          {/* Manager Selection */}
          <div>
            <label className="form-label flex items-center gap-2">
              <User size={14} />
              Assign Room Manager
            </label>
            <CustomSelect
              value={managedBy}
              onChange={(e) => setManagedBy(e.target.value)}
              options={[
                {
                  value: '',
                  label: floorManagedBy
                    ? `Inherit from Floor (${deans.find(d => d.uid === floorManagedBy)?.name || 'Assigned Dean'})`
                    : 'Managed by Registrar (Default)',
                },
                ...deans.map((dean) => ({
                  value: dean.uid,
                  label: `${dean.name}${dean.department ? ` (${dean.department})` : ''}`,
                })),
              ]}
              placeholder="Select Room Manager"
            />
            <p className="text-[10px] text-gray-500 mt-2">
              Room reservations will be routed to this manager for approval instead of the default workflow.
            </p>
          </div>

          {/* Preview */}
          {managedBy && managedBy !== (room.managedBy || '') && (
            <div className="p-4 rounded-xl border-2 border-blue-100 bg-blue-50">
              <p className="text-xs font-bold text-blue-900 mb-1">
                ⚠️ Approval Workflow Change
              </p>
              <p className="text-[10px] text-blue-800">
                New reservations for <span className="font-bold">{room.name}</span> will be approved by{' '}
                <span className="font-bold">{effectiveManager}</span> instead of following the standard approval process.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-outline-maroon flex-1" 
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-maroon flex-1 justify-center" 
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
