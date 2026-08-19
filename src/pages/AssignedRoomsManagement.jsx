import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DoorOpen, Layers, Search, Eye, Edit2, Plus, Building2, CheckSquare, Wrench
} from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import EditRoomModal from '../components/modals/EditRoomModal';
import EditFloorModal from '../components/modals/EditFloorModal';
import PageSkeleton from '../components/SkeletonLoader';

const statusBadge = {
  Available: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Occupied: 'bg-red-50 text-red-800 border-red-200',
  Maintenance: 'bg-amber-50 text-amber-800 border-amber-200',
};

export default function AssignedRoomsManagement() {
  const navigate = useNavigate();
  const { buildingList, buildingsLoading } = useApp();
  const { profile } = useAuth();
  const { roleLabel } = useRolePermissions();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('all');
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [editRoom, setEditRoom] = useState(null);
  const [editFloor, setEditFloor] = useState(null);

  // Extract rooms & floors assigned to this user
  const assignedData = useMemo(() => {
    if (!buildingList || !profile) return { buildings: [], rooms: [] };

    const uid = profile.uid || profile.id;
    const profileName = (profile.name || profile.displayName || '').toLowerCase();
    const assignedRoomIds = profile.assignedRoomIds || [];
    const assignedBuildingIds = (profile.assignedBuildingIds || []).map(String);

    const resultBuildings = [];
    const resultRooms = [];

    buildingList.forEach((b) => {
      const isBuildingAssigned = assignedBuildingIds.includes(String(b.id));

      const matchedFloors = [];
      (b.floorData || []).forEach((f) => {
        const isFloorAssigned =
          isBuildingAssigned ||
          (f.managedBy && (f.managedBy === uid || String(f.managedBy) === String(uid))) ||
          (f.managedByName && profileName && f.managedByName.toLowerCase() === profileName);

        const matchedRooms = [];
        (f.rooms || []).forEach((r) => {
          const roomId = r.docId || r.id || r.roomCode;
          const isRoomAssigned =
            isFloorAssigned ||
            assignedRoomIds.includes(roomId) ||
            (r.managedBy && (r.managedBy === uid || String(r.managedBy) === String(uid))) ||
            (r.managedByName && profileName && r.managedByName.toLowerCase() === profileName) ||
            profile.role === 'dean'; // Dean sees college assigned rooms by default

          if (isRoomAssigned) {
            const roomObj = {
              ...r,
              buildingId: b.id,
              buildingName: b.name,
              floor: f.floor,
              floorId: f.floorId,
              floorLabel: f.label || `Floor ${f.floor}`,
            };
            matchedRooms.push(roomObj);
            resultRooms.push(roomObj);
          }
        });

        if (isFloorAssigned || matchedRooms.length > 0) {
          matchedFloors.push({
            ...f,
            rooms: matchedRooms,
          });
        }
      });

      if (isBuildingAssigned || matchedFloors.length > 0) {
        resultBuildings.push({
          ...b,
          floorData: matchedFloors,
        });
      }
    });

    return { buildings: resultBuildings, rooms: resultRooms };
  }, [buildingList, profile]);

  // Filtered rooms search
  const filteredRooms = useMemo(() => {
    return assignedData.rooms.filter((r) => {
      if (selectedBuildingId !== 'all' && String(r.buildingId) !== String(selectedBuildingId)) {
        return false;
      }
      if (selectedFloor !== 'all' && String(r.floor) !== String(selectedFloor)) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const roomName = (r.name || r.id || '').toLowerCase();
        const type = (r.type || '').toLowerCase();
        const status = (r.status || '').toLowerCase();
        const bName = (r.buildingName || '').toLowerCase();
        return roomName.includes(q) || type.includes(q) || status.includes(q) || bName.includes(q);
      }
      return true;
    });
  }, [assignedData.rooms, selectedBuildingId, selectedFloor, searchTerm]);

  return (
    <Layout
      title="Assigned Rooms & Floors"
      subtitle={`${roleLabel} — Manage room details, capacity, equipment, and status for your assigned facilities`}
    >
      {/* Top Filter Bar */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search assigned room by name, type, building..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:border-[#7A0808] focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Building Filter */}
          {assignedData.buildings.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-600">Building:</label>
              <select
                value={selectedBuildingId}
                onChange={(e) => {
                  setSelectedBuildingId(e.target.value);
                  setSelectedFloor('all');
                }}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-[#7A0808]"
              >
                <option value="all">All Buildings ({assignedData.buildings.length})</option>
                {assignedData.buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {buildingsLoading ? (
        <PageSkeleton />
      ) : assignedData.rooms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-12 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#7A0808] flex items-center justify-center mx-auto">
            <DoorOpen size={24} />
          </div>
          <h3 className="text-base font-black text-gray-900">No Assigned Rooms Found</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto font-medium">
            You currently do not have specific rooms or floors assigned to your account. The Registrar can assign specific room management responsibility in System Administration.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Rooms Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRooms.map((room) => {
              const isUnderMaintenance = room.maintenanceStatus === 'under-maintenance';

              return (
                <div
                  key={room.docId || room.id}
                  className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-2xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block mb-0.5">
                          {room.buildingName} · {room.floorLabel}
                        </span>
                        <h4 className="text-base font-black text-gray-900">
                          {room.name || room.id}
                        </h4>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${
                          statusBadge[room.status] || 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        {isUnderMaintenance ? 'Maintenance' : room.status}
                      </span>
                    </div>

                    {/* Room Metadata */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                        <span className="text-[10px] font-extrabold text-gray-400 block">Type</span>
                        <span className="font-extrabold text-gray-800">{room.type || 'Classroom'}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                        <span className="text-[10px] font-extrabold text-gray-400 block">Capacity</span>
                        <span className="font-extrabold text-gray-800">{room.capacity || 0} seats</span>
                      </div>
                    </div>

                    {/* Equipment Tags */}
                    {room.equipment?.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                          Equipment & Amenities
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {room.equipment.map((eq, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-[#7A0808] border border-red-100"
                            >
                              {eq}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/room/${room.id || room.name}`, {
                          state: {
                            room,
                            buildingId: room.buildingId,
                            buildingName: room.buildingName,
                            floor: room.floor,
                            floorId: room.floorId,
                          },
                        })
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Eye size={14} /> Schedule
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditRoom(room)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#7A0808] hover:bg-[#600000] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <Edit2 size={14} /> Edit Room
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {editRoom && (
        <EditRoomModal
          room={editRoom}
          buildingId={editRoom.buildingId}
          floorId={editRoom.floorId}
          floorManagedBy={editRoom.managedBy}
          onClose={() => setEditRoom(null)}
        />
      )}

      {/* Edit Floor Modal */}
      {editFloor && (
        <EditFloorModal
          buildingId={editFloor.buildingId}
          floor={editFloor}
          onClose={() => setEditFloor(null)}
        />
      )}
    </Layout>
  );
}
