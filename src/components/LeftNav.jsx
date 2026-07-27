import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Calendar, BookOpen,
  Search, Clock, Building2, GraduationCap, BarChart2,
  Settings, ChevronDown, ChevronRight, Plus, Layers, DoorOpen, GitBranch, Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../constants/layout';
import systemLogo from '../assets/logo.png';

const MAROON = '#800000';
const TEXT = '#2B3235';

const NAV_ICONS = {
  '/dashboard': LayoutDashboard,
  '/system-administration': Users,
  '/building-management': Building2,
  '/room-finder': Search,
  '/academic-calendar': GraduationCap,
  '/course-scheduling': Calendar,
  '/college-inventory': GraduationCap,
  '/approval-workflow': GitBranch,
  '/approvals': CheckSquare,
  '/reports': BarChart2,
  '/maintenance-dashboard': Building2,
};

export default function LeftNav({
  onAddBuilding,
  isDesktop = true,
  isOpen = false,
  onClose = () => {},
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { navItems, approvalsNavLabel, canManageBuildings, filterRequests } = useRolePermissions();
  const { buildingList, requests, expandedBuildings, expandedFloors, toggleBuilding, toggleFloor } = useApp();
  const pendingCount = filterRequests(requests).filter(
    (r) => r.status === 'Pending' || r.status === 'In Progress',
  ).length;

  const resolvedNavItems = navItems.map((item) => ({
    ...item,
    icon: NAV_ICONS[item.path] || LayoutDashboard,
    label: item.path === '/approvals' ? approvalsNavLabel : item.label,
  }));

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <>
      {!isDesktop && isOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-40 bg-black/35"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed left-0 top-0 bottom-0 flex flex-col bg-white overflow-hidden transition-transform duration-300 ease-out ${
          isDesktop ? 'z-50 translate-x-0' : `z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
        }`}
        style={{ width: NAV_WIDTH_PX, borderRight: '1px solid #f0f0f0' }}
      >
        <header
          className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0"
          style={{ minHeight: TOP_NAV_HEIGHT_PX, borderBottom: '1px solid #f0f0f0' }}
        >
          {systemLogo ? (
            <img src={systemLogo} alt="SWU-IFSS logo" className="h-14 w-auto object-contain flex-shrink-0" />
          ) : null}
          <div className="min-w-0">
          <p className="font-bold text-xl leading-tight truncate" style={{ color: MAROON }}>SWU-IFSS</p>
          <p className="text-[11px] font-medium leading-tight truncate" style={{ color: TEXT, opacity: 0.75 }}>
            Integrated Facility Scheduling System
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2">
        {resolvedNavItems.map(({ label, icon: Icon, path }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              type="button"
              onClick={() => {
                navigate(path);
                if (!isDesktop) onClose();
              }}
              className={`nav-item group w-full text-left mb-0.5 ${active ? 'active' : ''}`}
            >
              <Icon
                size={17}
                className={`nav-icon flex-shrink-0 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#800000]'}`}
                style={{ color: active ? MAROON : undefined }}
              />
              <span
                className={`nav-label flex-1 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#800000]'}`}
                style={{ color: active ? MAROON : undefined }}
              >
                {label}
              </span>
              {path === '/approvals' && pendingCount > 0 && (
                <span className="bg-[#800000] text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-md flex items-center justify-center flex-shrink-0">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}

        <div className="mt-4 mb-1 px-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: TEXT, opacity: 0.45 }}>Buildings</span>
            {canManageBuildings() && (
              <button
                type="button"
                onClick={onAddBuilding}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors group"
                title="Add Building"
              >
                <Plus size={14} className="text-[#2B3235] group-hover:text-[#800000]" />
              </button>
            )}
          </div>
        </div>

        {buildingList.map((building) => {
          const isExpanded = expandedBuildings[building.id];
          const buildingActive = location.pathname.includes(`/building/${building.id}`);

          return (
            <div key={building.id}>
              <div
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group hover:bg-gray-100"
                onClick={() => toggleBuilding(building.id)}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBuilding(building.id);
                  }}
                  className={`flex-shrink-0 ${buildingActive ? 'text-[#800000] opacity-100' : 'text-[#2B3235] opacity-50 group-hover:opacity-80'}`}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <Building2
                  size={14}
                  className={`flex-shrink-0 transition-colors ${buildingActive ? 'text-[#800000]' : 'text-[#2B3235]'}`}
                />
                <span
                  className={`flex-1 text-[12px] font-semibold truncate transition-colors ${buildingActive ? 'text-[#800000]' : 'text-[#2B3235]'}`}
                >
                  {building.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/building/${building.id}`);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-[10px] font-bold px-1.5 py-0.5 transition-all"
                  style={{ color: MAROON, background: '#FFF0F0', borderRadius: 8 }}
                >
                  View
                </button>
              </div>

              {isExpanded && building.floorData.map((floorObj) => {
                const floorKey = `${building.id}-${floorObj.floor}`;
                const isFloorExpanded = expandedFloors[floorKey];
                return (
                  <div key={floorKey}>
                    <div
                      className="flex items-center gap-1.5 py-1 pl-8 pr-2 rounded-lg cursor-pointer hover:bg-gray-100 group"
                      onClick={() => toggleFloor(floorKey)}
                    >
                      {isFloorExpanded ? (
                        <ChevronDown size={10} className="text-[#2B3235] opacity-45 group-hover:text-[#800000]" />
                      ) : (
                        <ChevronRight size={10} className="text-[#2B3235] opacity-45 group-hover:text-[#800000]" />
                      )}
                      <Layers size={10} className="text-[#2B3235] opacity-50 group-hover:text-[#800000]" />
                      <span className="text-[11px] font-medium text-[#2B3235] group-hover:text-[#800000]">
                        Floor {floorObj.floor}
                      </span>
                    </div>
                    {isFloorExpanded && floorObj.rooms.map((room) => {
                      const roomActive = location.pathname === `/room/${room.id}`;
                      const isUnderMaintenance = room.maintenanceStatus === 'under-maintenance';
                      
                      return (
                        <div
                          key={room.id}
                          className={`flex items-center gap-1.5 py-1 pl-12 pr-2 rounded-lg cursor-pointer group ${
                            roomActive ? 'bg-gray-100' : 'hover:bg-gray-100'
                          } ${isUnderMaintenance ? 'opacity-50' : ''}`}
                          onClick={() =>
                            navigate(`/room/${room.id}`, {
                              state: {
                                room,
                                buildingId: building.id,
                                buildingName: building.name,
                                floor: floorObj.floor,
                                floorId: floorObj.floorId,
                              },
                            })
                          }
                        >
                          <DoorOpen
                            size={11}
                            className={`flex-shrink-0 ${
                              roomActive ? 'text-[#800000]' : 'text-[#2B3235] group-hover:text-[#800000]'
                            }`}
                          />
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              isUnderMaintenance
                                ? 'bg-orange-500'
                                : room.status === 'Available'
                                  ? 'bg-green-500'
                                  : room.status === 'Occupied'
                                    ? 'bg-red-500'
                                    : 'bg-yellow-500'
                            }`}
                          />
                          <span
                            className={`text-[11px] font-medium truncate ${
                              roomActive ? 'text-[#800000]' : 'text-[#2B3235] group-hover:text-[#800000]'
                            }`}
                          >
                            {room.id}
                          </span>
                          {isUnderMaintenance ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#FFF4E6', color: '#F97316' }}>
                              Maintenance
                            </span>
                          ) : room.type === 'Lecture Room' ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#FFF0F0', color: MAROON }}>
                              Lecture
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
    </>
  );
}
