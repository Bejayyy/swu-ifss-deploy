import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Calendar, BookOpen,
  Search, Clock, Building2, GraduationCap,
  Settings, ChevronDown, ChevronRight, Plus, Layers, DoorOpen, GitBranch, Users, Wrench, MessageSquare,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { isReservationActionable } from '../constants/approvalWorkflow';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../constants/layout';
import systemLogo from '../assets/logo.png';

const MAROON = '#7A0808';
const TEXT = '#2B3235';

const NAV_ICONS = {
  '/dashboard': LayoutDashboard,
  '/messages': MessageSquare,
  '/system-administration': Users,
  '/building-management': Building2,
  '/assigned-rooms': DoorOpen,
  '/room-finder': Search,
  '/academic-calendar': GraduationCap,
  '/system-settings': Settings,
  '/course-scheduling': Calendar,
  '/teachers': Users,
  '/college-inventory': BookOpen,
  '/courses': GraduationCap,
  '/approval-workflow': GitBranch,
  '/approvals': CheckSquare,
  '/maintenance-dashboard': Wrench,
};

const COURSE_ACADEMIC_PATHS = [
  '/course-scheduling',
  '/college-inventory',
  '/courses',
  '/teachers',
  '/approval-workflow',
];

export default function LeftNav({
  onAddBuilding,
  isDesktop = true,
  isOpen = false,
  onClose = () => {},
  desktopWidth = NAV_WIDTH_PX,
  onDesktopMouseEnter = () => {},
  onDesktopMouseLeave = () => {},
}) {
  const isCompact = isDesktop && desktopWidth < NAV_WIDTH_PX;
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

  const isCourseAcademicGroupActive = useMemo(() => {
    return COURSE_ACADEMIC_PATHS.some((p) => isActive(p));
  }, [location.pathname]);

  const [isCourseAcademicExpanded, setIsCourseAcademicExpanded] = useState(true);

  useEffect(() => {
    if (isCourseAcademicGroupActive) {
      setIsCourseAcademicExpanded(true);
    }
  }, [isCourseAcademicGroupActive]);

  // Separate top-level items (Request Management standalone) and Course & Academic Management sub-items
  // Sort top level items according to the operational flow
  const { topLevelItemsBeforeAcademic, topLevelItemsAfterAcademic, courseAcademicSubItems } = useMemo(() => {
    const subs = [];
    const before = [];
    const after = [];

    const NAV_PRIORITIES = {
      '/dashboard': 1,
      '/maintenance-dashboard': 2,
      '/approvals': 3,
      '/room-finder': 4,
      '/academic-operations': 5,
      '/building-management': 6,
      '/assigned-rooms': 7,
      '/academic-calendar': 8,
      '/system-administration': 9,
      '/system-settings': 10,
    };

    resolvedNavItems.forEach((item) => {
      if (COURSE_ACADEMIC_PATHS.includes(item.path)) {
        subs.push(item);
      } else {
        const priority = NAV_PRIORITIES[item.path] || 50;
        if (priority < NAV_PRIORITIES['/academic-operations']) {
          before.push(item);
        } else {
          after.push(item);
        }
      }
    });

    subs.sort((a, b) => {
      const order = { '/course-scheduling': 1, '/college-inventory': 2, '/courses': 3, '/teachers': 4, '/approval-workflow': 5 };
      return (order[a.path] || 99) - (order[b.path] || 99);
    });

    before.sort((a, b) => (NAV_PRIORITIES[a.path] || 99) - (NAV_PRIORITIES[b.path] || 99));
    after.sort((a, b) => (NAV_PRIORITIES[a.path] || 99) - (NAV_PRIORITIES[b.path] || 99));

    return { topLevelItemsBeforeAcademic: before, topLevelItemsAfterAcademic: after, courseAcademicSubItems: subs };
  }, [resolvedNavItems]);

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
        className={`fixed left-0 top-0 bottom-0 flex flex-col bg-white overflow-hidden transition-transform duration-300 ease-out print:hidden ${
          isCompact ? '[&_.nav-item]:justify-center [&_.nav-label]:hidden [&_.nav-extra]:hidden' : ''
        } ${
          isDesktop ? 'z-50 translate-x-0' : `z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
        }`}
        style={{ width: isDesktop ? desktopWidth : NAV_WIDTH_PX, borderRight: '1px solid #f0f0f0', transition: 'width 180ms ease' }}
        onMouseEnter={isDesktop ? onDesktopMouseEnter : undefined}
        onMouseLeave={isDesktop ? onDesktopMouseLeave : undefined}
      >
        <header
          className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0"
          style={{ minHeight: TOP_NAV_HEIGHT_PX, borderBottom: '1px solid #f0f0f0' }}
        >
          {systemLogo ? (
            <img src={systemLogo} alt="SWU-IFSS logo" className="h-14 w-auto object-contain flex-shrink-0" />
          ) : null}
          {!isCompact && <div className="min-w-0">
            <p className="font-bold text-xl leading-tight truncate" style={{ color: MAROON }}>SWU-IFSS</p>
            <p className="text-[11px] font-medium leading-tight truncate" style={{ color: TEXT, opacity: 0.75 }}>
              Integrated Facility Scheduling System
            </p>
          </div>}
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2">
          {/* Top-level Navigation Items before Academic Operations */}
          {topLevelItemsBeforeAcademic.map(({ label, icon: Icon, path }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                type="button"
                onClick={() => {
                  if (path === '/approvals') {
                    markApprovalsAsViewed();
                  }
                  navigate(path);
                  if (!isDesktop) onClose();
                }}
                className={`nav-item group w-full text-left mb-0.5 ${active ? 'active' : ''}`}
              >
                <Icon
                  size={17}
                  className={`nav-icon flex-shrink-0 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'}`}
                  style={{ color: active ? MAROON : undefined }}
                />
                <span
                  className={`nav-label flex-1 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'}`}
                  style={{ color: active ? MAROON : undefined }}
                >
                  {label}
                </span>
                {!isCompact && path === '/approvals' && unviewedCount > 0 && (
                  <span className="bg-[#F59E0B] text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-[6px] flex items-center justify-center flex-shrink-0 shadow-2xs">
                    {unviewedCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Collapsible Academic Operations Parent Group */}
          {courseAcademicSubItems.length > 0 && (
            <div className="my-1">
              <button
                type="button"
                onClick={() => setIsCourseAcademicExpanded((prev) => !prev)}
                className={`nav-item group w-full text-left flex items-center justify-between transition-colors ${
                  isCourseAcademicGroupActive ? 'active' : ''
                }`}
              >
                <div className={`flex items-center gap-2.5 min-w-0 ${isCompact ? 'justify-center' : 'flex-1'}`}>
                  <Calendar
                    size={17}
                    className={`nav-icon flex-shrink-0 transition-colors ${
                      isCourseAcademicGroupActive ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'
                    }`}
                    style={{ color: isCourseAcademicGroupActive ? MAROON : undefined }}
                  />
                  {!isCompact && <span
                    className={`nav-label flex-1 transition-colors ${
                      isCourseAcademicGroupActive ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'
                    }`}
                    style={{ color: isCourseAcademicGroupActive ? MAROON : undefined }}
                  >
                    Academic Operations
                  </span>}
                </div>
                {!isCompact && <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-gray-400 group-hover:text-[#7A0808] transition-transform duration-200">
                    {isCourseAcademicExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </div>}
              </button>

              {/* Sub-menu Items Container with Vertical Connecting Left Line and Identical Main Menu Icons */}
              {isCourseAcademicExpanded && !isCompact && (
                <div className="ml-5 pl-3 border-l-2 border-gray-200/90 my-1 space-y-1">
                  {courseAcademicSubItems.map(({ label, icon: SubIcon, path }) => {
                    const active = isActive(path);

                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={() => {
                          navigate(path);
                          if (!isDesktop) onClose();
                        }}
                        className={`group w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer ${
                          active
                            ? 'bg-[#FFF0F0] text-[#7A0808] font-extrabold shadow-2xs'
                            : 'text-[#2B3235] font-semibold hover:bg-gray-100/80 hover:text-[#7A0808]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <SubIcon
                            size={17}
                            className={`nav-icon flex-shrink-0 transition-colors ${
                              active ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'
                            }`}
                            style={{ color: active ? MAROON : undefined }}
                          />
                          <span
                            className={`truncate transition-colors ${
                              active ? 'text-[#7A0808] font-extrabold' : 'text-[#2B3235] group-hover:text-[#7A0808]'
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Top-level Navigation Items after Academic Operations (e.g. Buildings, User Management) */}
          {topLevelItemsAfterAcademic.map(({ label, icon: Icon, path }) => {
            if (path === '/system-settings') return null; // Rendered strictly at bottom
            const active = isActive(path);
            return (
              <button
                key={path}
                type="button"
                onClick={() => {
                  if (path === '/approvals') {
                    markApprovalsAsViewed();
                  }
                  navigate(path);
                  if (!isDesktop) onClose();
                }}
                className={`nav-item group w-full text-left mb-0.5 ${active ? 'active' : ''}`}
              >
                <Icon
                  size={17}
                  className={`nav-icon flex-shrink-0 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'}`}
                  style={{ color: active ? MAROON : undefined }}
                />
                <span
                  className={`nav-label flex-1 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'}`}
                  style={{ color: active ? MAROON : undefined }}
                >
                  {label}
                </span>
                {!isCompact && path === '/approvals' && unviewedCount > 0 && (
                  <span className="bg-[#F59E0B] text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-[6px] flex items-center justify-center flex-shrink-0 shadow-2xs">
                    {unviewedCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* System Settings strictly at the bottom ("at the back") */}
          {topLevelItemsAfterAcademic.find((item) => item.path === '/system-settings') && (() => {
            const item = topLevelItemsAfterAcademic.find((i) => i.path === '/system-settings');
            const Icon = item.icon || Settings;
            const active = isActive(item.path);

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  navigate(item.path);
                  if (!isDesktop) onClose();
                }}
                className={`nav-item group w-full text-left mt-1 mb-0.5 ${active ? 'active' : ''}`}
              >
                <Icon
                  size={17}
                  className={`nav-icon flex-shrink-0 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'}`}
                  style={{ color: active ? MAROON : undefined }}
                />
                <span
                  className={`nav-label flex-1 transition-colors ${active ? '' : 'text-[#2B3235] group-hover:text-[#7A0808]'}`}
                  style={{ color: active ? MAROON : undefined }}
                >
                  {item.label}
                </span>
              </button>
            );
          })()}

          {!isCompact && <div className="mt-4 mb-1 px-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: TEXT, opacity: 0.45 }}>Buildings</span>
              {canManageBuildings() && (
                <button
                  type="button"
                  onClick={onAddBuilding}
                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors group"
                  title="Add Building"
                >
                  <Plus size={14} className="text-[#2B3235] group-hover:text-[#7A0808]" />
                </button>
              )}
            </div>
          </div>}

          {isCompact ? (
            <button
              type="button"
              title={`Buildings (${buildingList.length}) — hover to show the building list`}
              aria-label={`Buildings, ${buildingList.length} available. Hover to expand the navigation.`}
              onClick={() => navigate('/building-management')}
              className={`group mx-auto mb-0.5 flex h-9 w-10 items-center justify-center rounded-lg transition-colors ${
                location.pathname.includes('/building/') || location.pathname.includes('/room/') || location.pathname === '/building-management'
                  ? 'bg-[#FFF0F0] text-[#7A0808]'
                  : 'text-[#2B3235] hover:bg-gray-100 hover:text-[#7A0808]'
              }`}
            >
              <Building2 size={18} />
              <span className="sr-only">Buildings</span>
            </button>
          ) : buildingList.map((building) => {
            const isExpanded = expandedBuildings[building.id];
            const buildingActive = location.pathname.includes(`/building/${building.id}`);

            return (
              <div key={building.id}>
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group ${
                    buildingActive ? 'font-bold' : ''
                  }`}
                  style={buildingActive ? { background: '#FFF0F0' } : undefined}
                  onMouseEnter={(e) => { if (!buildingActive) e.currentTarget.style.background = '#F3F4F6'; }}
                  onMouseLeave={(e) => { if (!buildingActive) e.currentTarget.style.background = ''; }}
                  onClick={() => {
                    toggleBuilding(building.id);
                    navigate(`/building/${building.id}`);
                  }}
                >
                  <span className={`flex-shrink-0 ${buildingActive ? 'text-[#7A0808]' : 'text-gray-400 group-hover:text-[#7A0808]'}`}>
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <Building2
                    size={14}
                    className={`flex-shrink-0 transition-colors ${buildingActive ? 'text-[#7A0808]' : 'text-[#2B3235] group-hover:text-[#7A0808]'}`}
                  />
                  <span
                    className={`flex-1 text-[12px] font-semibold truncate transition-colors ${
                      buildingActive ? 'text-[#7A0808]' : 'text-[#2B3235] group-hover:text-[#7A0808]'
                    }`}
                  >
                    {building.name}
                  </span>
                </div>

                {isExpanded && building.floorData.map((floorObj) => {
                  const floorKey = `${building.id}-${floorObj.floor}`;
                  const isFloorExpanded = expandedFloors[floorKey];
                  return (
                    <div key={floorKey}>
                      <div
                        className="flex items-center gap-1.5 py-1 pl-8 pr-2 rounded-lg cursor-pointer group transition-colors"
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F3F4F6'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                        onClick={() => toggleFloor(floorKey)}
                      >
                        {isFloorExpanded ? (
                          <ChevronDown size={10} className="text-[#2B3235] opacity-45 group-hover:text-[#7A0808]" />
                        ) : (
                          <ChevronRight size={10} className="text-[#2B3235] opacity-45 group-hover:text-[#7A0808]" />
                        )}
                        <Layers size={10} className="text-[#2B3235] opacity-50 group-hover:text-[#7A0808]" />
                        <span className="text-[11px] font-medium text-[#2B3235] group-hover:text-[#7A0808]">
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
                              isUnderMaintenance ? 'opacity-50' : ''
                            }`}
                            style={roomActive ? { background: '#FFF0F0' } : undefined}
                            onMouseEnter={(e) => { if (!roomActive) e.currentTarget.style.background = '#F3F4F6'; }}
                            onMouseLeave={(e) => { if (!roomActive) e.currentTarget.style.background = ''; }}
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
                                roomActive ? 'text-[#7A0808]' : 'text-[#2B3235] group-hover:text-[#7A0808]'
                              }`}
                            />
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isUnderMaintenance
                                  ? 'bg-orange-500'
                                  : room.status === 'Available'
                                    ? 'bg-[#7A0808]'
                                    : room.status === 'Occupied'
                                      ? 'bg-red-500'
                                      : 'bg-[#7A0808]'
                              }`}
                            />
                            <span
                              className={`text-[11px] font-medium truncate ${
                                roomActive ? 'text-[#7A0808]' : 'text-[#2B3235] group-hover:text-[#7A0808]'
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
