import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Calendar, BookOpen,
  Search, Clock, Building2, GraduationCap,
  Settings, ChevronDown, ChevronRight, Plus, Layers, DoorOpen, GitBranch, Users, Wrench,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { isReservationActionable } from '../constants/approvalWorkflow';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../constants/layout';
import systemLogo from '../assets/logo.png';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';

const MAROON = '#800000';
const TEXT = '#2B3235';

const NAV_ICONS = {
  '/dashboard': LayoutDashboard,
  '/system-administration': Users,
  '/building-management': Building2,
  '/assigned-rooms': DoorOpen,
  '/room-finder': Search,
  '/academic-calendar': GraduationCap,
  '/system-settings': Settings,
  '/course-scheduling': Calendar,
  '/teachers': Users,
  '/college-inventory': GraduationCap,
  '/approval-workflow': GitBranch,
  '/approvals': CheckSquare,
  '/maintenance-dashboard': Wrench,
};

export default function LeftNav({
  onAddBuilding,
  isDesktop = true,
  isOpen = false,
  onClose = () => {},
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { navItems, approvalsNavLabel, canManageBuildings } = useRolePermissions();
  const { buildingList, requests, expandedBuildings, expandedFloors, toggleBuilding, toggleFloor } = useApp();
  const { profile } = useAuth();

  const [viewedIds, setViewedIds] = useState(() => {
    if (!profile?.uid) return [];
    try {
      const saved = localStorage.getItem(`viewed_approvals_${profile.uid}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    if (profile?.uid) {
      try {
        const saved = localStorage.getItem(`viewed_approvals_${profile.uid}`);
        if (saved) setViewedIds(JSON.parse(saved));
      } catch (e) {}
    }
  }, [profile?.uid]);

  const actionableRequests = useMemo(() => {
    if (!requests?.length || !profile?.role) return [];
    return requests.filter((r) => isReservationActionable(r, profile.role, profile));
  }, [requests, profile]);

  const unviewedCount = useMemo(() => {
    return actionableRequests.filter((r) => !viewedIds.includes(r.id)).length;
  }, [actionableRequests, viewedIds]);

  const markApprovalsAsViewed = () => {
    if (!actionableRequests.length) return;
    const currentIds = actionableRequests.map((r) => r.id);
    const updated = Array.from(new Set([...viewedIds, ...currentIds]));
    setViewedIds(updated);
    if (profile?.uid) {
      try {
        localStorage.setItem(`viewed_approvals_${profile.uid}`, JSON.stringify(updated));
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (location.pathname === '/approvals' && actionableRequests.length > 0) {
      const currentIds = actionableRequests.map((r) => r.id);
      const hasUnviewed = currentIds.some((id) => !viewedIds.includes(id));
      if (hasUnviewed) {
        markApprovalsAsViewed();
      }
    }
  }, [location.pathname, actionableRequests, viewedIds]);

  const resolvedNavItems = navItems.map((item) => ({
    ...item,
    icon: NAV_ICONS[item.path] || LayoutDashboard,
    label: item.path === '/approvals' ? approvalsNavLabel : item.label,
  }));

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <SidebarProvider defaultOpen={true}>
      {!isDesktop && isOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-40 bg-black/35 transition-opacity"
          onClick={onClose}
        />
      )}

      <Sidebar
        className={`fixed left-0 top-0 bottom-0 flex flex-col bg-white border-r border-gray-100 overflow-hidden transition-transform duration-300 ease-out print:hidden ${
          isDesktop ? 'z-50 translate-x-0' : `z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
        }`}
        style={{ width: NAV_WIDTH_PX }}
      >
        <SidebarHeader
          className="flex flex-row items-center gap-1.5 px-3 py-2 shrink-0 border-b border-gray-100"
          style={{ minHeight: TOP_NAV_HEIGHT_PX }}
        >
          {systemLogo ? (
            <img src={systemLogo} alt="SWU-IFSS logo" className="h-14 w-auto object-contain flex-shrink-0" />
          ) : null}
          <div className="min-w-0">
            <p className="font-bold text-xl leading-tight truncate text-[#800000]">SWU-IFSS</p>
            <p className="text-[11px] font-medium leading-tight truncate text-[#2B3235]/75">
              Integrated Facility Scheduling System
            </p>
          </div>
        </SidebarHeader>

        <SidebarContent className="py-3 px-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {resolvedNavItems.map(({ label, icon: Icon, path }) => {
                  const active = isActive(path);
                  return (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton
                        isActive={active}
                        onClick={() => {
                          if (path === '/approvals') {
                            markApprovalsAsViewed();
                          }
                          navigate(path);
                          if (!isDesktop) onClose();
                        }}
                        className={`group w-full text-left mb-0.5 px-3 py-2 rounded-lg transition-colors ${
                          active
                            ? 'bg-gray-100 text-[#800000] font-semibold'
                            : 'text-[#2B3235] hover:bg-gray-100 hover:text-[#800000]'
                        }`}
                      >
                        <Icon
                          size={17}
                          className={`flex-shrink-0 transition-colors ${
                            active ? 'text-[#800000]' : 'text-[#2B3235] group-hover:text-[#800000]'
                          }`}
                        />
                        <span className="flex-1 truncate">{label}</span>
                        {path === '/approvals' && unviewedCount > 0 && (
                          <SidebarMenuBadge className="bg-[#800000] text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-md">
                            {unviewedCount}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="p-0 mt-4 mb-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <SidebarGroupLabel className="p-0 h-auto text-[10px] font-bold tracking-widest uppercase text-[#2B3235]/45">
                Buildings
              </SidebarGroupLabel>
              {canManageBuildings() && (
                <SidebarGroupAction
                  asChild
                  className="static top-auto right-auto p-1 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <button
                    type="button"
                    onClick={onAddBuilding}
                    title="Add Building"
                  >
                    <Plus size={14} className="text-[#2B3235] hover:text-[#800000]" />
                  </button>
                </SidebarGroupAction>
              )}
            </div>

            <SidebarGroupContent>
              <SidebarMenu>
                {buildingList.map((building) => {
                  const isExpanded = expandedBuildings[building.id];
                  const buildingActive = location.pathname.includes(`/building/${building.id}`);

                  return (
                    <SidebarMenuItem key={building.id}>
                      <SidebarMenuButton
                        isActive={buildingActive}
                        onClick={() => {
                          toggleBuilding(building.id);
                          navigate(`/building/${building.id}`);
                        }}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group ${
                          buildingActive ? 'bg-red-50/60 font-bold text-[#7A0808]' : 'hover:bg-gray-100 text-[#2B3235]'
                        }`}
                      >
                        <span className={`flex-shrink-0 ${buildingActive ? 'text-[#7A0808]' : 'text-gray-400 group-hover:text-[#7A0808]'}`}>
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <Building2
                          size={14}
                          className={`flex-shrink-0 transition-colors ${buildingActive ? 'text-[#7A0808]' : 'text-[#2B3235]'}`}
                        />
                        <span className="flex-1 text-[12px] font-semibold truncate transition-colors">
                          {building.name}
                        </span>
                      </SidebarMenuButton>

                      {isExpanded && (
                        <SidebarMenuSub className="ml-0 pl-0 border-none space-y-0.5">
                          {building.floorData.map((floorObj) => {
                            const floorKey = `${building.id}-${floorObj.floor}`;
                            const isFloorExpanded = expandedFloors[floorKey];
                            return (
                              <SidebarMenuSubItem key={floorKey}>
                                <div
                                  className="flex items-center gap-1.5 py-1 pl-8 pr-2 rounded-lg cursor-pointer hover:bg-gray-100 group transition-colors"
                                  onClick={() => toggleFloor(floorKey)}
                                >
                                  {isFloorExpanded ? (
                                    <ChevronDown size={10} className="text-[#2B3235]/45 group-hover:text-[#800000]" />
                                  ) : (
                                    <ChevronRight size={10} className="text-[#2B3235]/45 group-hover:text-[#800000]" />
                                  )}
                                  <Layers size={10} className="text-[#2B3235]/50 group-hover:text-[#800000]" />
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
                                      className={`flex items-center gap-1.5 py-1 pl-12 pr-2 rounded-lg cursor-pointer group transition-colors ${
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
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
