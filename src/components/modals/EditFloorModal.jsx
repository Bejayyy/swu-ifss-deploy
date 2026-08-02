import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeStaffUsers } from '../../services/systemUserService';
import { updateFloorRecord, updateAllRoomsOnFloor, updateRoomRecord } from '../../services/buildingService';
import { collection, getDocs, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { COLLECTIONS } from '../../firebase/constants';

export default function EditFloorModal({ buildingId, floor, onClose }) {
  const { profile } = useAuth();
  const isRegistrar = profile?.role === 'registrar';
  const [form, setForm] = useState({
    label: floor?.label || `Floor ${floor?.floor}`,
    managedBy: floor?.managedBy || '',
    managedByName: floor?.managedByName || '',
    applyToAllRooms: true, // Default to true
  });
  const [staffUsers, setStaffUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch staff users (deans)
  useEffect(() => {
    const unsub = subscribeStaffUsers((users) => {
      setStaffUsers(users);
    }, (error) => {
      console.error('EditFloorModal - Error fetching staff:', error);
    });
    return unsub;
  }, []);

  // Fetch rooms on this floor
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const floorRef = doc(db, COLLECTIONS.BUILDINGS, buildingId, COLLECTIONS.FLOORS, floor.floorId);
        const roomsCollection = collection(floorRef, COLLECTIONS.ROOMS);
        const roomsSnap = await getDocs(roomsCollection);
        const roomsList = roomsSnap.docs.map(doc => ({
          docId: doc.id,
          ...doc.data()
        }));
        setRooms(roomsList);
        // Initially select all rooms
        setSelectedRooms(roomsList.map(r => r.docId));
      } catch (err) {
        console.error('Error fetching rooms:', err);
      }
    };
    fetchRooms();
  }, [buildingId, floor.floorId]);

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
      managedByName: dean ? `${dean.name}` : '',
    }));
  };

  const toggleRoomSelection = (roomDocId) => {
    setSelectedRooms(prev => 
      prev.includes(roomDocId) 
        ? prev.filter(id => id !== roomDocId)
        : [...prev, roomDocId]
    );
  };

  const toggleAllRooms = () => {
    if (form.applyToAllRooms) {
      // If currently all rooms, deselect all
      setSelectedRooms([]);
    } else {
      // If not all rooms, select all
      setSelectedRooms(rooms.map(r => r.docId));
    }
    setForm((f) => ({ ...f, applyToAllRooms: !f.applyToAllRooms }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.label?.trim()) {
      setError('Floor label is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Update floor
      await updateFloorRecord(buildingId, floor.floorId, {
        label: form.label,
        managedBy: form.managedBy,
        managedByName: form.managedByName,
      });
      
      // Update selected rooms
      if (form.applyToAllRooms && rooms.length > 0) {
        // Update all rooms
        await updateAllRoomsOnFloor(buildingId, floor.floorId, {
          managedBy: form.managedBy,
          managedByName: form.managedByName,
        });
      } else if (selectedRooms.length > 0) {
        // Update only selected rooms
        await Promise.all(
          selectedRooms.map(roomDocId =>
            updateRoomRecord(buildingId, floor.floorId, roomDocId, {
              managedBy: form.managedBy,
              managedByName: form.managedByName,
            })
          )
        );
      }
      
      onClose(true);
    } catch (err) {
      setError(err.message || 'Failed to update floor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-3xl w-full max-w-md p-7 relative shadow-2xl border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
        <h2 className="text-xl font-black mb-0.5" style={{ color: '#7A0808' }}>
          Edit Floor
        </h2>
        <p className="text-xs text-gray-400 mb-6 font-medium">Update floor details and manager</p>
        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mb-4">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="form-label font-bold text-xs" style={{ color: '#2B3235' }}>Floor Label</label>
            <input
              type="text"
              className="form-input text-sm rounded-xl py-2.5 px-3 border-gray-200 mt-1"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Floor 1"
              required
            />
          </div>
          {isRegistrar && (
            <div>
              <label className="form-label font-bold text-xs" style={{ color: '#2B3235' }}>Floor Manager (Dean)</label>
              <select
                className="form-input text-sm rounded-xl py-2.5 px-3 border-gray-200 mt-1"
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
              <p className="text-xs text-gray-400 mt-1.5 font-medium">
                Rooms on this floor will inherit this manager by default
              </p>
            </div>
          )}
          
          {form.managedBy && rooms.length > 0 && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.applyToAllRooms}
                    onChange={toggleAllRooms}
                    className="mt-0.5 rounded text-[#7A0808]"
                  />
                  <div>
                    <span className="text-xs font-bold text-blue-900">Apply to all rooms</span>
                    <p className="text-[10px] text-blue-700 mt-0.5 font-medium">
                      Update all {rooms.length} rooms on this floor to be managed by this dean
                    </p>
                  </div>
                </label>
              </div>
              
              {!form.applyToAllRooms && (
                <div className="border border-gray-200 rounded-xl p-3 max-h-52 overflow-y-auto">
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    Select specific rooms ({selectedRooms.length} of {rooms.length} selected)
                  </p>
                  <div className="space-y-2">
                    {rooms.map((room) => (
                      <label
                        key={room.docId}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRooms.includes(room.docId)}
                          onChange={() => toggleRoomSelection(room.docId)}
                        />
                        <span className="text-xs text-gray-700">
                          {room.name || room.id} - {room.type}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline-maroon flex-1 py-2.5 rounded-xl font-bold text-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-maroon flex-1 justify-center py-2.5 rounded-xl font-bold text-sm"
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
