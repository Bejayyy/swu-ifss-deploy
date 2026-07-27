import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Building2, Calendar } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import AddBuildingModal from '../components/modals/AddBuildingModal';
import AddFloorModal from '../components/modals/AddFloorModal';
import EditBuildingModal from '../components/modals/EditBuildingModal';
import PageSkeleton from '../components/SkeletonLoader';

const statusBadge = { Available: 'badge-available', Occupied: 'badge-occupied', Maintenance: 'badge-maintenance' };

export default function BuildingManagement() {
  const navigate = useNavigate();
  const { buildingList, buildingsLoading, buildingsError, updateBuilding } = useApp();
  const { canManageBuildings, canManageRoomMaintenance, canManageAssignedRooms, canSubmitReservation, roleLabel } = useRolePermissions();
  const { openReservation, modals } = useRoomReservationFlow();
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [showEditBuilding, setShowEditBuilding] = useState(false);

  useEffect(() => {
    if (!buildingList.length) {
      setSelectedBuilding(null);
      return;
    }
    const stillExists = selectedBuilding && buildingList.some((b) => b.id === selectedBuilding.id);
    if (!stillExists) setSelectedBuilding(buildingList[0]);
  }, [buildingList, selectedBuilding]);

  const building = selectedBuilding;
  const allRooms =
    building?.floorData?.flatMap((f) => f.rooms.map((r) => ({ ...r, floor: f.floor, floorLabel: f.label }))) || [];

  return (
    <Layout
      title={canManageBuildings() ? 'Building & Room Management' : 'Buildings & Rooms'}
      subtitle={canManageRoomMaintenance() ? `${roleLabel} — manage room maintenance and view schedules` : canManageAssignedRooms() ? `${roleLabel} — manage assigned classrooms` : 'View buildings and room information'}
    >
      <div className="flex justify-end gap-2 mb-5">
        {canManageBuildings() && (
          <button type="button" className="btn-maroon" onClick={() => setShowAddBuilding(true)}>
            <Plus size={16} /> Add Building
          </button>
        )}
      </div>

      {buildingsError && (
        <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
          {buildingsError}
        </p>
      )}

      {buildingsLoading && buildingList.length === 0 ? (
        <PageSkeleton />
      ) : buildingList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm text-gray-500 mb-4">No buildings yet. Add your first building to get started.</p>
          {canManageBuildings() && (
            <button type="button" className="btn-maroon" onClick={() => setShowAddBuilding(true)}>
              <Plus size={16} /> Add Building
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {buildingList.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBuilding(b)}
                className="px-5 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-all flex-shrink-0"
                style={
                  selectedBuilding?.id === b.id
                    ? { borderColor: '#7A0808', color: '#7A0808' }
                    : { borderColor: 'transparent', color: '#2B3235' }
                }
              >
                {b.name}
              </button>
            ))}
          </div>

          {building && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-4 pb-5 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  {building.image ? (
                    <img src={building.image} alt={building.name} className="w-16 h-16 rounded-2xl object-cover border border-gray-200 shadow-sm" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-[#7A0808]">
                      <Building2 size={28} />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-black text-xl text-dark">{building.name}</h2>
                      {(building.prefix || building.code) && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                          Prefix: {building.prefix || building.code}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 font-medium">
                      <span>Floors: {building.floors}</span>
                      <span>Rooms: {building.totalRooms ?? allRooms.length}</span>
                    </div>
                  </div>
                </div>

                {canManageBuildings() && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" className="btn-outline-maroon flex items-center gap-2" onClick={() => setShowAddFloor(true)}>
                      <Plus size={16} /> Add Floor
                    </button>
                    <button type="button" className="btn-outline-maroon flex items-center gap-2" onClick={() => setShowEditBuilding(true)}>
                      <Edit2 size={14} /> Edit Building
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Room', 'Floor', 'Capacity', 'Facilities', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="text-left text-[10px] font-black uppercase tracking-wider text-gray-400 py-3 pr-4">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allRooms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-gray-400">
                          No rooms yet. Open building details to add rooms per floor.
                        </td>
                      </tr>
                    ) : (
                      allRooms.map((room) => {
                        const floorObj = building.floorData.find((f) => f.floor === room.floor);
                        return (
                          <tr key={room.docId || `${room.id}-${room.floor}`} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                            <td className="py-3 pr-4 text-sm font-bold text-dark">{room.id}</td>
                            <td className="py-3 pr-4 text-sm text-gray-600">{room.floorLabel || `Floor ${room.floor}`}</td>
                            <td className="py-3 pr-4 text-sm text-gray-600">{room.capacity}</td>
                            <td className="py-3 pr-4">
                              <div className="text-xs text-gray-600">
                                {room.equipment?.slice(0, 2).map((e, i) => (
                                  <div key={i}>{e}</div>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={statusBadge[room.status] || 'badge-available'}>{room.status}</span>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex gap-2">
                                {canSubmitReservation() && (
                                  <button
                                    type="button"
                                    onClick={() => openReservation({
                                      building: building.name,
                                      buildingId: building.id,
                                      room: room.id,
                                      roomDocId: room.docId,
                                      floor: room.floor,
                                      floorId: floorObj?.floorId,
                                      designatedVenue: `${room.id}, ${building.name} Floor ${room.floor}`,
                                    })}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                    style={{ color: '#7A0808' }}
                                    title="Reserve room"
                                  >
                                    <Calendar size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/room/${room.id}`, {
                                      state: {
                                        room,
                                        buildingId: building.id,
                                        buildingName: building.name,
                                        floor: room.floor,
                                        floorId: floorObj?.floorId,
                                      },
                                    })
                                  }
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                  style={{ color: '#7A0808' }}
                                  title="View room details"
                                >
                                  <Edit2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/building/${building.id}`)}
                className="w-full mt-5 py-3 rounded-xl font-bold text-sm transition-all"
                style={{ background: '#7A0808', color: 'white' }}
              >
                Manage floors & rooms
              </button>
            </div>
          )}
        </div>
      )}

      {modals}

      {canManageBuildings() && showAddBuilding && <AddBuildingModal onClose={() => setShowAddBuilding(false)} />}
      {canManageBuildings() && showAddFloor && building && (
        <AddFloorModal
          buildingId={building.id}
          buildingName={building.name}
          onClose={() => setShowAddFloor(false)}
        />
      )}
      {canManageBuildings() && showEditBuilding && building && (
        <EditBuildingModal
          building={building}
          onClose={() => setShowEditBuilding(false)}
          onSave={updateBuilding}
        />
      )}
    </Layout>
  );
}
