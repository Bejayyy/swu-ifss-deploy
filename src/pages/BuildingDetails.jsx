import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Building2, DoorOpen, Users, CheckSquare, Calendar, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import AddRoomModal from '../components/modals/AddRoomModal';
import AddFloorModal from '../components/modals/AddFloorModal';
import EditBuildingModal from '../components/modals/EditBuildingModal';
import EditRoomModal from '../components/modals/EditRoomModal';
import EditFloorModal from '../components/modals/EditFloorModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { buildingSchedulesById } from '../data/mockSchedules';
import ProgressStatCards from '../components/ProgressStatCards';
import CustomSelect from '../components/ui/CustomSelect';

const statusBadge = { Available: 'badge-available', Occupied: 'badge-occupied', Maintenance: 'badge-maintenance' };

export default function BuildingDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { buildingList, buildingsLoading, updateBuilding, deleteBuilding } = useApp();
  const { profile } = useAuth();
  const { canManageBuildings, canManageAssignedRooms, isDean, canEditRoom, canSubmitReservation, isRegistrar } = useRolePermissions();
  const { openReservation, modals } = useRoomReservationFlow();
  const canManageBuilding = Boolean(canManageBuildings() || canManageAssignedRooms() || isDean || isRegistrar);
  const building = buildingList.find((b) => String(b.id) === String(id));

  const [activeFloor, setActiveFloor] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [showEditBuilding, setShowEditBuilding] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [editFloor, setEditFloor] = useState(null);

  const [roomCurrentPage, setRoomCurrentPage] = useState(1);
  const [roomItemsPerPage, setRoomItemsPerPage] = useState(5);

  useEffect(() => {
    setRoomCurrentPage(1);
    if (building?.floorData?.length) {
      const exists = building.floorData.some((f) => f.floor === activeFloor);
      if (!exists) setActiveFloor(building.floorData[0].floor);
    } else {
      setActiveFloor(null);
    }
  }, [building, activeFloor]);

  if (buildingsLoading && !building) {
    return (
      <Layout title="Building" subtitle="Loading…">
        <p className="text-sm text-gray-500 py-12 text-center">Loading building data…</p>
      </Layout>
    );
  }

  if (!building) {
    return (
      <Layout title="Building not found">
        <button type="button" className="btn-maroon mt-4" onClick={() => navigate('/building-management')}>
          Back to Building Management
        </button>
      </Layout>
    );
  }

  const floorEntry = building.floorData.find((f) => f.floor === activeFloor) || { rooms: [], floorId: null };
  const floorData = floorEntry;
  const profileUid = profile?.uid || profile?.id;
  const canAddRoomToFloor = Boolean(
    isRegistrar
    || canManageBuildings()
    || (
      canManageAssignedRooms()
      && floorEntry.managedBy
      && String(floorEntry.managedBy) === String(profileUid)
    )
  );
  const allRooms = building.floorData.flatMap((f) => f.rooms);
  const availableNow = allRooms.filter((r) => r.status === 'Available').length;

  const floorStats = {
    total: floorData.rooms.length,
    available: floorData.rooms.filter((r) => r.status === 'Available').length,
    occupied: floorData.rooms.filter((r) => r.status === 'Occupied').length,
    capacity: floorData.rooms.reduce((a, r) => a + (r.capacity || 0), 0),
  };

  const handleDeleteBuildingConfirm = async () => {
    setIsDeleting(true);
    try {
      await deleteBuilding(building.id);
      setShowDeleteConfirm(false);
      navigate('/building-management');
    } catch (err) {
      console.error('Failed to delete building:', err);
      alert(err.message || 'Failed to delete building.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Layout title={building.name} subtitle="Building management and room overview">
      <div className="flex items-center justify-between mb-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-bold"
          style={{ color: '#2B3235' }}
        >
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors">
            <ArrowLeft size={15} />
            <span className="text-xs font-bold">Back</span>
          </div>
        </button>
        <div className="flex gap-2 flex-wrap justify-end">
          {canManageBuilding && (
            <>
              <button
                type="button"
                className="px-3.5 py-2 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete Building"
              >
                <Trash2 size={14} /> Delete Building
              </button>
              <button
                type="button"
                className="btn-maroon flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-2xs rounded-xl cursor-pointer"
                onClick={() => setShowEditBuilding(true)}
              >
                <Edit2 size={14} /> Edit Building
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-6">
        <ProgressStatCards
          items={[
            { label: 'Total Floors', value: building.floors, icon: Building2, color: 'maroon' },
            { label: 'Total Rooms', value: building.totalRooms || allRooms.length, icon: DoorOpen, color: 'blue' },
            { label: 'Total Capacity', value: allRooms.reduce((a, r) => a + (r.capacity || 0), 0), icon: Users, color: 'amber' },
            { label: 'Available Now', value: availableNow, icon: CheckSquare, color: 'emerald' },
          ]}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-bold text-base mb-4" style={{ color: '#2B3235' }}>Rooms by Floor</h2>

        {building.floorData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-3">No floors yet. Add a floor to start adding rooms.</p>
            {canManageBuilding && <button type="button" className="btn-maroon text-sm" onClick={() => setShowAddFloor(true)}>Add Floor</button>}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 p-1.5 mb-6 overflow-x-auto scrollbar-thin bg-gray-100/80 rounded-2xl border border-gray-200/60 max-w-full">
              {building.floorData.map((f) => {
                const isSelected = activeFloor === f.floor;
                return (
                  <button
                    key={f.floorId || f.floor}
                    type="button"
                    onClick={() => setActiveFloor(f.floor)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-[#7A0808] text-white shadow-xs scale-[1.02]'
                        : 'bg-white text-[#2B3235] hover:bg-gray-50 hover:text-[#7A0808] border border-gray-200/80'
                    }`}
                  >
                    Floor {f.floor}
                  </button>
                );
              })}
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm" style={{ color: '#2B3235' }}>
                  Floor {activeFloor} Overview
                </h3>
                {canManageBuilding && (
                  <button
                    type="button"
                    onClick={() => setEditFloor(floorEntry)}
                    className="btn-outline-maroon px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    title="Edit floor"
                  >
                    <Edit2 size={13} /> Edit Floor
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Total Rooms', value: floorStats.total, color: '#2B3235' },
                  { label: 'Available', value: floorStats.available, color: '#059669' },
                  { label: 'Occupied', value: floorStats.occupied, color: '#DC2626' },
                  { label: 'Total Capacity', value: floorStats.capacity, color: '#2563EB' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border border-gray-100 rounded-xl p-4 text-center">
                    <p className="text-2xl font-black mb-1" style={{ color }}>{value}</p>
                    <p className="text-xs font-semibold text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="font-bold text-sm mb-4" style={{ color: '#2B3235' }}>Room Details</h3>
            {floorData.rooms.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No rooms on this floor yet.
                {canAddRoomToFloor && <button type="button" onClick={() => setShowAddRoom(true)} className="block mx-auto mt-3 btn-maroon text-xs">
                  Add Room
                </button>}
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const totalFloorRooms = floorData.rooms.length;
                  const totalRoomPages = Math.max(1, Math.ceil(totalFloorRooms / roomItemsPerPage));
                  const roomStartIndex = totalFloorRooms === 0 ? 0 : (roomCurrentPage - 1) * roomItemsPerPage + 1;
                  const roomEndIndex = Math.min(roomCurrentPage * roomItemsPerPage, totalFloorRooms);
                  const paginatedRooms = floorData.rooms.slice((roomCurrentPage - 1) * roomItemsPerPage, roomCurrentPage * roomItemsPerPage);

                  return (
                    <>
                      {paginatedRooms.map((room) => {
                        const isUnderMaintenance = room.maintenanceStatus === 'under-maintenance';
                        
                        return (
                          <div 
                            key={room.docId || room.id} 
                            className={`border border-gray-100 rounded-xl p-5 transition-all ${
                              isUnderMaintenance 
                                ? 'bg-gray-50 opacity-60' 
                                : 'hover:shadow-sm'
                            }`}
                            style={isUnderMaintenance ? { filter: 'blur(0.5px)' } : {}}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                  <h4 className="font-black text-base text-dark">{room.id || room.name}</h4>
                                  {isUnderMaintenance ? (
                                    <span className="badge-maintenance">Under Maintenance</span>
                                  ) : (
                                    <span className={statusBadge[room.status] || 'badge-available'}>{room.status}</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 mb-2">{room.type}</p>
                                <p className="text-xs text-gray-500">Capacity: {room.capacity}</p>
                                {isUnderMaintenance && room.maintenanceEndDate && (
                                  <p className="text-[11px] font-bold text-orange-600 mt-2">
                                    Maintenance until {room.maintenanceEndDate}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                                {canSubmitReservation() && !isUnderMaintenance && (
                                  <button
                                    type="button"
                                    onClick={() => openReservation({
                                      building: building.name,
                                      buildingId: building.id,
                                      room: room.id,
                                      roomDocId: room.docId,
                                      floor: activeFloor,
                                      floorId: floorEntry.floorId,
                                      designatedVenue: `${room.id}, ${building.name} Floor ${activeFloor}`,
                                    })}
                                    className="btn-outline-maroon text-xs py-1.5 px-4"
                                  >
                                    Reserve
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
                                        floor: activeFloor,
                                        floorId: floorEntry.floorId,
                                      },
                                    })
                                  }
                                  className="btn-maroon text-xs py-1.5 px-4"
                                >
                                  View
                                </button>
                                {(canManageBuilding || canEditRoom(room)) && (
                                   <button
                                     type="button"
                                     onClick={() => setEditRoom(room)}
                                     className="btn-outline-maroon px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                                     title="Edit room details and manager"
                                   >
                                     <Edit2 size={13} /> Edit Room
                                   </button>
                                 )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {totalFloorRooms > 0 && (
                        <div className="flex items-center justify-between p-3 bg-gray-50/60 border border-gray-100 rounded-xl flex-wrap gap-3 mt-4">
                          <div className="text-xs font-semibold text-gray-500">
                            Showing <span className="font-bold text-gray-800">{roomStartIndex}</span> to{' '}
                            <span className="font-bold text-gray-800">{roomEndIndex}</span> of{' '}
                            <span className="font-bold text-gray-800">{totalFloorRooms}</span> rooms
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-[130px]">
                              <span>Show</span>
                              <CustomSelect
                                size="sm"
                                value={roomItemsPerPage}
                                onChange={(e) => {
                                  setRoomItemsPerPage(Number(e.target.value));
                                  setRoomCurrentPage(1);
                                }}
                                options={[
                                  { value: 5, label: '5' },
                                  { value: 10, label: '10' },
                                  { value: 20, label: '20' },
                                ]}
                                placeholder="Rows"
                              />
                              <span>per page</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setRoomCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={roomCurrentPage === 1}
                                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 shadow-2xs"
                                title="Previous Page"
                              >
                                <ChevronLeft size={15} />
                              </button>

                              <span className="text-xs font-bold px-2 text-gray-700">
                                Page {roomCurrentPage} of {totalRoomPages}
                              </span>

                              <button
                                type="button"
                                onClick={() => setRoomCurrentPage((p) => Math.min(totalRoomPages, p + 1))}
                                disabled={roomCurrentPage === totalRoomPages || totalRoomPages === 0}
                                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 shadow-2xs"
                                title="Next Page"
                              >
                                <ChevronRight size={15} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {canAddRoomToFloor && (
              <button
                type="button"
                onClick={() => setShowAddRoom(true)}
                disabled={!floorEntry.floorId}
                className="w-full mt-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border-2 border-dashed disabled:opacity-50"
                style={{ borderColor: '#7A0808', color: '#7A0808' }}
              >
                <Plus size={16} /> Add Room to this floor
              </button>
            )}
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-6">
        <h2 className="font-bold text-base mb-1" style={{ color: '#2B3235' }}>Schedules in this building</h2>
        <p className="text-xs font-medium mb-4" style={{ color: '#2B3235', opacity: 0.65 }}>
          Sample schedule data (linked when building ID matches seed data)
        </p>
        {(buildingSchedulesById[building.id] || []).length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: '#2B3235', opacity: 0.55 }}>No schedule rows for this building yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Room</th>
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Course</th>
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Day</th>
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Time</th>
                </tr>
              </thead>
              <tbody>
                {(buildingSchedulesById[building.id] || []).map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-2.5 px-3 font-black">{row.room}</td>
                    <td className="py-2.5 px-3">{row.course}</td>
                    <td className="py-2.5 px-3">{row.day}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">{row.start}–{row.end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modals}

      {canAddRoomToFloor && showAddRoom && floorEntry.floorId && (
        <AddRoomModal
          buildingId={building.id}
          buildingPrefix={building.prefix || building.code}
          floorId={floorEntry.floorId}
          floor={activeFloor}
          floorManagedBy={floorEntry.managedBy}
          existingRoomsCount={floorData.rooms.length}
          onClose={() => setShowAddRoom(false)}
        />
      )}
      {canManageBuilding && showAddFloor && (
        <AddFloorModal
          buildingId={building.id}
          existingFloors={building.floorData}
          onClose={() => setShowAddFloor(false)}
        />
      )}
      {canManageBuilding && showEditBuilding && (
        <EditBuildingModal
          building={building}
          onClose={() => setShowEditBuilding(false)}
          onSave={updateBuilding}
          onDelete={handleDeleteBuildingConfirm}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Building"
          message={`Are you sure you want to delete "${building.name}"? This will permanently delete this building and all of its ${building.floorData?.length || 0} floor(s) and ${allRooms.length} room(s). This action cannot be undone.`}
          confirmText="Yes, Delete Building"
          cancelText="Cancel"
          variant="danger"
          isProcessing={isDeleting}
          onConfirm={handleDeleteBuildingConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {canManageBuilding && editFloor && (
        <EditFloorModal
          buildingId={building.id}
          floor={editFloor}
          onClose={() => setEditFloor(null)}
        />
      )}
      {editRoom && (
        <EditRoomModal
          room={editRoom}
          buildingId={building.id}
          floorId={floorEntry.floorId}
          onClose={() => setEditRoom(null)}
        />
      )}
    </Layout>
  );
}
