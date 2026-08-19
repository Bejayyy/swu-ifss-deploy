import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DoorOpen, ClipboardList, CheckCircle, XCircle, Clock,
  Building2, ArrowRight, BarChart3, Calendar,
  BookOpen, Activity, Filter, RefreshCw, Layers, TrendingUp,
  Search, Plus, PieChart, ShieldAlert, Check, AlertCircle, Wrench,
  Download, ChevronRight, Sparkles, SlidersHorizontal
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import PageSkeleton from '../components/SkeletonLoader';
import CustomSelect from '../components/ui/CustomSelect';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import {
  computeRoomStats,
  computeRequestStats,
  computeRoomUtilization,
  computeDepartmentActivity,
  computeSubjectRoomAssignments,
  buildRecentActivity,
  computeWeeklyDemandByDay,
  computeStructuredRoomAvailability,
  computeFacilityTypeDistribution,
  computePeakHourlyOccupancy,
  computeOverallUtilizationRate,
  formatRelativeTime,
} from '../services/dashboardService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

// ───── System Maroon & Amber Theme Tokens ─────
const MAROON = '#7A0808';
const MAROON_HOVER = '#5E0606';
const AMBER = '#F59E0B';
const EMERALD = '#059669';
const BLUE = '#2563EB';
const PURPLE = '#7C3AED';

// ───── Status Badge Colors ─────
const STATUS_COLORS = {
  Approved: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Rejected: { bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  Pending: { bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  'In Progress': { bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  Draft: { bg: 'bg-slate-100 text-slate-700 border-slate-200' },
  Postponed: { bg: 'bg-purple-50 text-purple-700 border-purple-200' },
};

// ───── Activity Status Icons ─────
const ACTIVITY_ICONS = {
  approved: <CheckCircle size={15} className="text-emerald-600" />,
  rejected: <XCircle size={15} className="text-rose-600" />,
  pending: <Clock size={15} className="text-amber-600" />,
  'in-progress': <RefreshCw size={15} className="text-blue-600" />,
  draft: <ClipboardList size={15} className="text-slate-400" />,
  postponed: <Clock size={15} className="text-purple-600" />,
  info: <Activity size={15} className="text-slate-400" />,
};

// ───── Custom Tooltip for Recharts ─────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900/95 text-white border border-slate-800 p-3 rounded-xl shadow-xl text-xs backdrop-blur-md">
      <p className="font-extrabold text-slate-200 mb-1.5 pb-1 border-b border-slate-800 flex items-center justify-between gap-4">
        <span>{label}</span>
        <span className="text-[10px] text-slate-400 font-normal">Report</span>
      </p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2.5 mt-1 text-xs">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color || MAROON }} />
          <span className="text-slate-300 font-medium">{entry.name || entry.dataKey}:</span>
          <span className="font-black text-white ml-auto">{entry.value}{entry.unit || ''}</span>
        </div>
      ))}
    </div>
  );
}

// ───── Status Badge ─────
function StatusBadge({ status }) {
  const styleClass = STATUS_COLORS[status]?.bg || STATUS_COLORS.Draft.bg;
  return (
    <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-bold border leading-none ${styleClass}`}>
      {status}
    </span>
  );
}

// ───── Modern Executive Stat Card Component ─────
function StatCard({ label, value, subtext, icon: Icon, color = 'maroon', onClick }) {
  const COLOR_MAP = {
    maroon: { bg: 'bg-red-50 text-[#7A0808] border-red-100', badge: 'bg-red-100/80 text-[#7A0808]' },
    emerald: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100', badge: 'bg-emerald-100/80 text-emerald-800' },
    rose: { bg: 'bg-rose-50 text-rose-700 border-rose-100', badge: 'bg-rose-100/80 text-rose-800' },
    amber: { bg: 'bg-amber-50 text-amber-700 border-amber-100', badge: 'bg-amber-100/80 text-amber-800' },
    blue: { bg: 'bg-blue-50 text-blue-700 border-blue-100', badge: 'bg-blue-100/80 text-blue-800' },
  };
  const theme = COLOR_MAP[color] || COLOR_MAP.maroon;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${theme.bg} shadow-2xs group-hover:scale-105 transition-transform`}>
          {Icon && <Icon size={20} strokeWidth={2} />}
        </div>
        <span className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">
          {typeof value === 'number' ? value : value}
        </span>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-700 leading-tight mb-0.5">{label}</p>
        {subtext && <p className="text-[11px] font-semibold text-slate-400">{subtext}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { buildingList, requests, buildingsLoading, requestsLoading } = useApp();
  const { startNewReservation, openReservation, modals: reservationModals } = useRoomReservationFlow();

  const [timeRange, setTimeRange] = useState('This Week');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [activeDay, setActiveDay] = useState('Mon');
  const [assignmentSort, setAssignmentSort] = useState('subject');
  const [searchTerm, setSearchTerm] = useState('');

  const isLoading = buildingsLoading || requestsLoading;

  // ───── Computed Analytics ─────
  const roomStats = useMemo(() => computeRoomStats(buildingList), [buildingList]);
  const requestStats = useMemo(() => computeRequestStats(requests), [requests]);
  const utilization = useMemo(() => computeRoomUtilization(buildingList, requests), [buildingList, requests]);
  const deptActivity = useMemo(() => computeDepartmentActivity(requests), [requests]);
  const weeklyDemand = useMemo(() => computeWeeklyDemandByDay(requests), [requests]);
  const facilityTypes = useMemo(() => computeFacilityTypeDistribution(buildingList), [buildingList]);
  const subjectAssignments = useMemo(() => computeSubjectRoomAssignments(buildingList, requests), [buildingList, requests]);
  const recentActivity = useMemo(() => buildRecentActivity(requests, 10), [requests]);
  const peakOccupancy = useMemo(() => computePeakHourlyOccupancy(buildingList, requests), [buildingList, requests]);
  const overallRate = useMemo(() => computeOverallUtilizationRate(buildingList, requests), [buildingList, requests]);

  const { timeBlocks, roomCards } = useMemo(
    () => computeStructuredRoomAvailability(buildingList, requests, selectedBuilding, activeDay),
    [buildingList, requests, selectedBuilding, activeDay]
  );

  // Filtered Subject Assignments
  const filteredAssignments = useMemo(() => {
    let copy = [...subjectAssignments];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      copy = copy.filter(
        (a) =>
          a.subject.toLowerCase().includes(q) ||
          a.room.toLowerCase().includes(q) ||
          a.building.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q)
      );
    }
    copy.sort((a, b) => {
      if (assignmentSort === 'status') return (a.status || '').localeCompare(b.status || '');
      if (assignmentSort === 'room') return (a.room || '').localeCompare(b.room || '');
      return (a.subject || '').localeCompare(b.subject || '');
    });
    return copy.slice(0, 12);
  }, [subjectAssignments, assignmentSort, searchTerm]);

  if (isLoading) {
    return (
      <Layout title="Facility Dashboard" subtitle="Campus Analytics & Operations Overview">
        <PageSkeleton />
      </Layout>
    );
  }

  const pendingTotal = requestStats.pending + requestStats.inProgress;

  return (
    <Layout title="Facility Dashboard" subtitle="Campus Analytics & Operations Overview">
      {reservationModals}

      {/* ───── 1. Top Executive KPI Metric Cards (5 Grid Layout) ───── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Total Facilities"
          value={roomStats.total}
          subtext={`${buildingList.length} Buildings`}
          icon={DoorOpen}
          color="maroon"
          onClick={() => navigate('/building-management')}
        />
        <StatCard
          label="Campus Utilization"
          value={`${overallRate}%`}
          subtext="Active Capacity Rate"
          icon={TrendingUp}
          color="emerald"
          onClick={() => navigate('/room-availability')}
        />
        <StatCard
          label="Available Rooms"
          value={roomStats.available}
          subtext="Ready for Booking"
          icon={CheckCircle}
          color="emerald"
          onClick={() => navigate('/room-finder')}
        />
        <StatCard
          label="Occupied Rooms"
          value={roomStats.occupied}
          subtext="In Active Session"
          icon={Building2}
          color="rose"
          onClick={() => navigate('/building-management')}
        />
        <StatCard
          label="Pending Queue"
          value={pendingTotal}
          subtext="Awaiting Signature"
          icon={ClipboardList}
          color="amber"
          onClick={() => navigate('/approvals')}
        />
      </div>

      {/* ───── 2. Primary Visual Analytics (Peak Hourly Demand Curve + Weekly Booking Volume) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Peak Campus Occupancy & Demand Curve (Recharts AreaChart) */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#7A0808] border border-red-100">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Peak Hourly Occupancy & Demand Curve</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Facility demand percentage (07:00 AM – 07:00 PM)</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-bold text-[#7A0808] bg-red-50/70 border-red-200">
                Peak: 09 AM - 10 AM
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={peakOccupancy} margin={{ left: -15, right: 10, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="maroonGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={MAROON} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={MAROON} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="OccupancyPct"
                    name="Occupancy Rate"
                    unit="%"
                    stroke={MAROON}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#maroonGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Campus Room Demand (Mon - Sat Stacked Report) */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#7A0808] border border-red-100">
                  <Calendar size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Weekly Booking & Request Volume</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Day-by-day reservation requests (Mon – Sat)</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-slate-700 bg-slate-50 border-slate-200">
                Mon – Sat Report
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyDemand} margin={{ left: -15, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="Approved" fill={MAROON} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pending" fill={AMBER} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── 3. Secondary Analytics (Room Utilization + Facility Category Distribution) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Room Utilization Rate by Building */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#7A0808] border border-red-100">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Building Utilization Intensity</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Utilization percentage per campus building</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-[#7A0808] bg-red-50/60 border-red-200">
                Live Rate
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-60">
              {utilization.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utilization} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                    <YAxis dataKey="building" type="category" width={110} tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="utilization" name="Utilization" radius={[0, 6, 6, 0]}>
                      {utilization.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.utilization > 75 ? MAROON : entry.utilization > 50 ? AMBER : EMERALD}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-400 font-medium">
                  No building utilization data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Facility Category Breakdown */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-50 text-[#7A0808] border border-red-100">
                <PieChart size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Facility Type Distribution</CardTitle>
                <CardDescription className="text-xs text-slate-500">Breakdown of campus rooms by category</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="space-y-3">
              {facilityTypes.map((item) => {
                const totalRooms = roomStats.total || 1;
                const percentage = Math.round((item.value / totalRooms) * 100);
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-slate-900">{item.value} rooms</span>
                        <span className="text-slate-400 text-[10px]">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── 4. INTERACTIVE ROOM AVAILABILITY MATRIX WIDGET (Clean Grid Layout) ───── */}
      <Card className="border-slate-200/80 shadow-2xs bg-white mb-6 rounded-2xl">
        <CardHeader className="border-b border-slate-100 pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-50 text-[#7A0808] border border-red-100">
                <DoorOpen size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Room Availability & Schedule Matrix</CardTitle>
                <CardDescription className="text-xs text-slate-500">Live time-slot grid overview per day & building</CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Day Filter Tabs */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveDay(day)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeDay === day
                        ? 'bg-[#7A0808] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              {/* Building Filter */}
              <div className="w-[160px]">
                <CustomSelect
                  value={selectedBuilding || ''}
                  onChange={(e) => setSelectedBuilding(e.target.value || null)}
                  options={[
                    { value: '', label: 'All Buildings' },
                    ...buildingList.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                  placeholder="All Buildings"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[380px]">
            {roomCards.length > 0 ? (
              <table className="w-full text-xs border-collapse min-w-[950px]">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-10 border-b border-slate-200/80">
                  <tr className="text-slate-600 font-bold">
                    <th className="py-3 px-4 text-left min-w-[170px]">Room & Building</th>
                    <th className="py-3 px-3 text-center w-[110px]">Type / Capacity</th>
                    {timeBlocks.map((tb) => (
                      <th key={tb.id} className="py-3 px-2 text-center whitespace-nowrap min-w-[115px]">
                        <span className="block font-extrabold text-slate-800 text-[11px]">{tb.label.split('-')[0]} - {tb.label.split('-')[1]}</span>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right min-w-[100px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {roomCards.map((room) => {
                    const hasAvailableSlot = timeBlocks.some((tb) => room.slots[tb.id] === 'available');

                    return (
                      <tr key={room.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Room & Building Column */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-red-50 text-[#7A0808] border border-red-100 flex items-center justify-center flex-shrink-0 font-bold text-xs">
                              <Building2 size={15} />
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-900 text-sm leading-snug">{room.name}</p>
                              <p className="text-[11px] text-slate-500 font-semibold">{room.buildingName}</p>
                            </div>
                          </div>
                        </td>

                        {/* Room Type & Capacity */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] mb-1">
                            {room.type}
                          </span>
                          <p className="text-[11px] text-slate-500 font-mono font-semibold">👥 {room.capacity} pax</p>
                        </td>

                        {/* Dedicated Time Slot Columns */}
                        {timeBlocks.map((tb) => {
                          const slotStatus = room.slots[tb.id] || 'available';
                          const isFree = slotStatus === 'available';
                          const isMaint = slotStatus === 'maintenance';

                          return (
                            <td key={tb.id} className="py-3 px-2 text-center">
                              {isMaint ? (
                                <span className="inline-flex items-center justify-center gap-1 w-full px-2 py-1.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                                  <Wrench size={11} /> Maint.
                                </span>
                              ) : isFree ? (
                                <span className="inline-flex items-center justify-center gap-1 w-full px-2 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                                  <CheckCircle size={11} /> Free
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1 w-full px-2 py-1.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
                                  <XCircle size={11} /> Booked
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {/* Action Button Column */}
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              openReservation({
                                building: room.buildingName || '',
                                room: room.id || room.name || '',
                                designatedVenue: `${room.name || room.id}${room.buildingName ? `, ${room.buildingName}` : ''}`,
                                buildingId: room.buildingId || '',
                                roomType: room.type || '',
                                capacity: room.capacity || '',
                              })
                            }
                            disabled={!hasAvailableSlot}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer inline-flex items-center gap-1 ${
                              hasAvailableSlot
                                ? 'bg-red-50 text-[#7A0808] hover:bg-[#7A0808] hover:text-white border border-red-200 shadow-2xs'
                                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            }`}
                          >
                            <span>Book</span>
                            <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                No rooms found matching selected building criteria.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ───── 5. BOTTOM SECTION: ACADEMIC ASSIGNMENTS REPORT + LIVE TIMELINE ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Academic Subject Room Assignments Table */}
        <Card className="lg:col-span-2 border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#7A0808] border border-red-100">
                  <BookOpen size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Academic Subject & Room Allocations</CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-medium">Classroom assignments and approval status</CardDescription>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search subject or room..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-7 pr-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-[#7A0808]"
                  />
                </div>
                <div className="w-[140px]">
                  <CustomSelect
                    value={assignmentSort}
                    onChange={(e) => setAssignmentSort(e.target.value)}
                    options={[
                      { value: 'subject', label: 'Sort: Subject' },
                      { value: 'room', label: 'Sort: Room' },
                      { value: 'status', label: 'Sort: Status' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs border-collapse min-w-[550px]">
                <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-100">
                  <tr className="text-slate-600 font-bold text-left">
                    <th className="py-2.5 px-4">Subject</th>
                    <th className="py-2.5 px-3">Room</th>
                    <th className="text-center py-2.5 px-3">Capacity</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="text-center py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredAssignments.length > 0 ? (
                    filteredAssignments.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900">{row.subject}</td>
                        <td className="py-2.5 px-3 font-mono text-xs font-bold text-[#7A0808]">{row.room}</td>
                        <td className="py-2.5 px-3 text-center tabular-nums font-semibold">{row.capacity} pax</td>
                        <td className="py-2.5 px-3 text-slate-500 font-medium">{row.type}</td>
                        <td className="py-2.5 px-3 text-center">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-400 font-medium">
                        No subject assignments found matching search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Live Approval Queue & Activity Feed */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#7A0808] border border-red-100">
                  <Activity size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Recent System Activity</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Live reservation & signature logs</CardDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/approvals')}
                className="text-xs font-bold text-[#7A0808] hover:underline flex items-center gap-1 cursor-pointer"
              >
                View All <ArrowRight size={12} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {recentActivity.length > 0 ? (
                recentActivity.map((a, i) => (
                  <div
                    key={a.id || i}
                    className="flex gap-3 items-start p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all"
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-slate-50 border border-slate-100 flex-shrink-0">
                      {ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.info}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{a.text}</p>
                      <p className="text-[11px] text-slate-500 truncate">{a.sub}</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 flex-shrink-0 whitespace-nowrap">
                      {formatRelativeTime(a.timestamp)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs font-medium">No recent activity logged</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
