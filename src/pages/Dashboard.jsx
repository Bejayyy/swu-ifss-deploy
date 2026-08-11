import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DoorOpen, ClipboardList, AlertTriangle, CheckCircle, XCircle, Clock,
  Building2, ArrowRight, GitBranch, Users, BarChart3, Calendar,
  BookOpen, Activity, ChevronDown, Filter, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  FunnelChart, Funnel, LabelList,
} from 'recharts';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import PageSkeleton from '../components/SkeletonLoader';
import {
  computeRoomStats,
  computeRequestStats,
  computeRoomUtilization,
  computeConflicts,
  computeApprovalFunnel,
  computeDepartmentActivity,
  computeSubjectRoomAssignments,
  buildRecentActivity,
  computeRoomAvailabilityGrid,
  formatRelativeTime,
} from '../services/dashboardService';

// ───── Design Tokens ─────
const MAROON = '#800000';
const DARK_MAROON = '#7A0808';
const TEXT = '#2B3235';
const CARD_RADIUS = 10;

// ───── Status badge colors ─────
const STATUS_COLORS = {
  Approved: { bg: '#EAF9F1', text: '#0E8345' },
  Rejected: { bg: '#FEF2F2', text: '#DC2626' },
  Pending: { bg: '#FFF8E6', text: '#B47D00' },
  'In Progress': { bg: '#EFF6FF', text: '#2563EB' },
  Draft: { bg: '#F3F4F6', text: '#6B7280' },
  Postponed: { bg: '#FDF4FF', text: '#9333EA' },
};

// ───── Activity Icons ─────
const ACTIVITY_ICONS = {
  approved: <CheckCircle size={14} className="text-green-500" />,
  rejected: <XCircle size={14} className="text-red-500" />,
  pending: <Clock size={14} className="text-yellow-500" />,
  'in-progress': <RefreshCw size={14} className="text-blue-500" />,
  draft: <ClipboardList size={14} className="text-gray-400" />,
  postponed: <Clock size={14} className="text-purple-500" />,
  info: <Activity size={14} className="text-gray-400" />,
};

// ───── Availability Grid Colors ─────
const AVAIL_COLORS = {
  available: '#D1FAE5',
  occupied: '#FECACA',
  reserved: '#FDE68A',
  maintenance: '#E5E7EB',
};

const AVAIL_LABELS = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  maintenance: 'Maintenance',
};

// ───── Custom Recharts Tooltip ─────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 px-3 py-2 shadow-lg" style={{ borderRadius: CARD_RADIUS }}>
      <p className="text-xs font-bold mb-1" style={{ color: TEXT }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color || MAROON }}>
          {entry.name || entry.dataKey}: <strong>{entry.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ───── Section Header ─────
function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={18} style={{ color: DARK_MAROON }} />}
        <div>
          <h3 className="font-bold text-sm" style={{ color: TEXT }}>{title}</h3>
          {subtitle && <p className="text-[11px] font-medium" style={{ color: TEXT, opacity: 0.55 }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ───── Status Badge ─────
function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Draft;
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5"
      style={{ background: colors.bg, color: colors.text, borderRadius: 6 }}
    >
      {status}
    </span>
  );
}

// ───── Stat Card ─────
function StatCard({ label, value, icon: Icon, accent = '#800000', onClick }) {
  return (
    <div
      className="bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      style={{ borderRadius: CARD_RADIUS, borderLeft: `4px solid ${accent}` }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: TEXT, opacity: 0.55 }}>
            {label}
          </p>
          <p className="text-2xl font-black tabular-nums" style={{ color: TEXT }}>
            {typeof value === 'number' ? String(value).padStart(2, '0') : value}
          </p>
        </div>
        <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: '#FFFBFB', borderRadius: 8 }}>
          {Icon && <Icon size={20} style={{ color: MAROON }} strokeWidth={2} />}
        </div>
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
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [assignmentSort, setAssignmentSort] = useState('subject');

  const isLoading = buildingsLoading || requestsLoading;

  // ───── Computed analytics ─────
  const roomStats = useMemo(() => computeRoomStats(buildingList), [buildingList]);
  const requestStats = useMemo(() => computeRequestStats(requests), [requests]);
  const utilization = useMemo(() => computeRoomUtilization(buildingList, requests), [buildingList, requests]);
  const conflicts = useMemo(() => computeConflicts(requests), [requests]);
  const approvalFunnel = useMemo(() => computeApprovalFunnel(requests), [requests]);
  const deptActivity = useMemo(() => computeDepartmentActivity(requests), [requests]);
  const subjectAssignments = useMemo(() => computeSubjectRoomAssignments(buildingList, requests), [buildingList, requests]);
  const recentActivity = useMemo(() => buildRecentActivity(requests, 10), [requests]);
  const availabilityGrid = useMemo(
    () => computeRoomAvailabilityGrid(buildingList, requests, selectedBuilding),
    [buildingList, requests, selectedBuilding]
  );

  // Sort assignments
  const sortedAssignments = useMemo(() => {
    const copy = [...subjectAssignments];
    copy.sort((a, b) => {
      if (assignmentSort === 'status') return (a.status || '').localeCompare(b.status || '');
      if (assignmentSort === 'room') return (a.room || '').localeCompare(b.room || '');
      return (a.subject || '').localeCompare(b.subject || '');
    });
    return copy.slice(0, 15);
  }, [subjectAssignments, assignmentSort]);

  if (isLoading) {
    return (
      <Layout title="Dashboard" subtitle="Facility Overview & Analytics">
        <PageSkeleton />
      </Layout>
    );
  }

  const pendingTotal = requestStats.pending + requestStats.inProgress;

  return (
    <Layout title="Dashboard" subtitle="Facility Overview & Analytics">
      {/* ───── 1. Summary Cards ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Rooms" value={roomStats.total} icon={DoorOpen} accent="#800000" onClick={() => navigate('/building-management')} />
        <StatCard label="Available" value={roomStats.available} icon={CheckCircle} accent="#16A34A" onClick={() => navigate('/room-finder')} />
        <StatCard label="Occupied" value={roomStats.occupied} icon={Building2} accent="#DC2626" onClick={() => navigate('/building-management')} />
        <StatCard label="Pending Requests" value={pendingTotal} icon={ClipboardList} accent="#EA580C" onClick={() => navigate('/approvals')} />
        <StatCard label="Active Conflicts" value={conflicts.total} icon={AlertTriangle} accent="#7C3AED" />
      </div>

      {/* ───── 2. Room Utilization + 3. Scheduling Conflicts ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Room Utilization */}
        <div className="bg-white border border-gray-100 shadow-sm p-5" style={{ borderRadius: CARD_RADIUS }}>
          <SectionHeader
            icon={BarChart3}
            title="Room Utilization"
            subtitle="Usage comparison across buildings"
          />
          <div className="h-52">
            {utilization.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilization} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: TEXT, fontSize: 11 }} unit="%" />
                  <YAxis dataKey="building" type="category" width={100} tick={{ fill: TEXT, fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="utilization" name="Utilization" radius={[0, 6, 6, 0]}>
                    {utilization.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.utilization > 75 ? '#DC2626' : entry.utilization > 50 ? '#CA8A04' : '#16A34A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">No building data available</div>
            )}
          </div>
        </div>

        {/* Scheduling Conflicts */}
        <div className="bg-white border border-gray-100 shadow-sm p-5" style={{ borderRadius: CARD_RADIUS }}>
          <SectionHeader
            icon={AlertTriangle}
            title="Scheduling Conflicts"
            subtitle="Conflicts by category"
          />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conflicts.chartData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category" tick={{ fill: TEXT, fontSize: 10 }} interval={0} angle={0} />
                <YAxis tick={{ fill: TEXT, fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Conflicts" radius={[6, 6, 0, 0]}>
                  {conflicts.chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ───── 4. Room Availability Grid ───── */}
      <div className="bg-white border border-gray-100 shadow-sm p-5 mb-5" style={{ borderRadius: CARD_RADIUS }}>
        <SectionHeader
          icon={Calendar}
          title="Room Availability"
          subtitle="Weekly room schedule overview"
          action={
            <div className="flex items-center gap-2">
              <Filter size={14} style={{ color: TEXT, opacity: 0.5 }} />
              <select
                className="text-xs font-semibold border border-gray-200 px-2 py-1 bg-white"
                style={{ borderRadius: 6, color: TEXT }}
                value={selectedBuilding || ''}
                onChange={(e) => setSelectedBuilding(e.target.value || null)}
              >
                <option value="">All Buildings</option>
                {buildingList.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          }
        />

        {/* Legend */}
        <div className="flex gap-4 mb-3 flex-wrap">
          {Object.entries(AVAIL_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: AVAIL_COLORS[key] }} />
              <span className="text-[10px] font-semibold" style={{ color: TEXT, opacity: 0.7 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="text-left py-1.5 px-2 font-bold sticky left-0 bg-white z-10" style={{ color: TEXT, minWidth: 80 }}>Room</th>
                {availabilityGrid.days.map((day) => (
                  <th key={day} colSpan={availabilityGrid.timeSlots.length} className="text-center py-1.5 px-1 font-bold border-l border-gray-100" style={{ color: TEXT }}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {availabilityGrid.grid.length > 0 ? (
                availabilityGrid.grid.map(({ room, slots }) => (
                  <tr key={room.id} className="border-t border-gray-50">
                    <td className="py-1 px-2 font-semibold sticky left-0 bg-white z-10 whitespace-nowrap" style={{ color: TEXT }}>
                      {room.id}
                    </td>
                    {availabilityGrid.days.map((day) =>
                      availabilityGrid.timeSlots.map((slot) => {
                        const key = `${day}-${slot.hour}`;
                        const status = slots[key] || 'available';
                        return (
                          <td key={key} className="p-0">
                            <div
                              className="w-full h-5 border-r border-gray-50"
                              style={{ background: AVAIL_COLORS[status] || AVAIL_COLORS.available }}
                              title={`${room.id} · ${day} ${slot.label} — ${AVAIL_LABELS[status]}`}
                            />
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={1 + availabilityGrid.days.length * availabilityGrid.timeSlots.length} className="text-center py-6 text-gray-400 text-xs">
                    No rooms found for selected building
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ───── 5. Approval Funnel + 6. Department Activity ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Approval Workflow Funnel */}
        <div className="bg-white border border-gray-100 shadow-sm p-5" style={{ borderRadius: CARD_RADIUS }}>
          <SectionHeader
            icon={GitBranch}
            title="Approval Workflow"
            subtitle="Requests pending at each approval stage"
          />
          <div className="space-y-2.5">
            {approvalFunnel.map((stage, i) => {
              const maxCount = Math.max(...approvalFunnel.map((s) => s.count), 1);
              const widthPct = Math.max(8, (stage.count / maxCount) * 100);
              return (
                <div key={stage.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold" style={{ color: TEXT }}>{stage.stage}</span>
                    <span className="text-[11px] font-black tabular-nums" style={{ color: stage.color }}>
                      {stage.count}
                    </span>
                  </div>
                  <div className="h-6 bg-gray-50 overflow-hidden" style={{ borderRadius: 5 }}>
                    <div
                      className="h-full flex items-center px-2 transition-all duration-500"
                      style={{
                        width: `${widthPct}%`,
                        background: stage.color,
                        borderRadius: 5,
                        opacity: 0.85,
                      }}
                    >
                      {stage.count > 0 && (
                        <span className="text-[10px] font-bold text-white">{stage.count} pending</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold" style={{ color: TEXT, opacity: 0.55 }}>Total pending</span>
              <span className="text-sm font-black" style={{ color: MAROON }}>{pendingTotal}</span>
            </div>
          </div>
        </div>

        {/* Department Scheduling Activity */}
        <div className="bg-white border border-gray-100 shadow-sm p-5" style={{ borderRadius: CARD_RADIUS }}>
          <SectionHeader
            icon={Users}
            title="Department Scheduling Activity"
            subtitle="Room requests by college/department"
          />
          <div className="h-64">
            {deptActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptActivity} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fill: TEXT, fontSize: 11 }} allowDecimals={false} />
                  <YAxis dataKey="department" type="category" width={120} tick={{ fill: TEXT, fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Requests" fill={MAROON} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">No department data available</div>
            )}
          </div>
        </div>
      </div>

      {/* ───── 7. Subject-to-Room Assignment Table ───── */}
      <div className="bg-white border border-gray-100 shadow-sm p-5 mb-5" style={{ borderRadius: CARD_RADIUS }}>
        <SectionHeader
          icon={BookOpen}
          title="Subject-to-Room Assignment"
          subtitle="Academic subjects and their assigned rooms"
          action={
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold" style={{ color: TEXT, opacity: 0.5 }}>Sort:</span>
              <select
                className="text-xs font-semibold border border-gray-200 px-2 py-1 bg-white"
                style={{ borderRadius: 6, color: TEXT }}
                value={assignmentSort}
                onChange={(e) => setAssignmentSort(e.target.value)}
              >
                <option value="subject">Subject</option>
                <option value="room">Room</option>
                <option value="status">Status</option>
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-3 font-bold" style={{ color: TEXT }}>Subject</th>
                <th className="text-left py-2 px-3 font-bold" style={{ color: TEXT }}>Room</th>
                <th className="text-center py-2 px-3 font-bold" style={{ color: TEXT }}>Capacity</th>
                <th className="text-left py-2 px-3 font-bold" style={{ color: TEXT }}>Type</th>
                <th className="text-left py-2 px-3 font-bold" style={{ color: TEXT }}>Facilities</th>
                <th className="text-center py-2 px-3 font-bold" style={{ color: TEXT }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedAssignments.length > 0 ? (
                sortedAssignments.map((row, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-2 px-3 font-semibold" style={{ color: TEXT }}>{row.subject}</td>
                    <td className="py-2 px-3 font-mono text-[11px]" style={{ color: DARK_MAROON }}>{row.room}</td>
                    <td className="py-2 px-3 text-center tabular-nums">{row.capacity}</td>
                    <td className="py-2 px-3" style={{ color: TEXT, opacity: 0.7 }}>{row.type}</td>
                    <td className="py-2 px-3 max-w-[160px] truncate" title={row.facilities} style={{ color: TEXT, opacity: 0.6 }}>
                      {row.facilities}
                    </td>
                    <td className="py-2 px-3 text-center"><StatusBadge status={row.status} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    No academic subject assignments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ───── 8. Recent Activity ───── */}
      <div className="bg-white border border-gray-100 shadow-sm p-5" style={{ borderRadius: CARD_RADIUS }}>
        <SectionHeader
          icon={Activity}
          title="Recent Activity"
          subtitle="Latest reservations, approvals, and system events"
          action={
            <button
              onClick={() => navigate('/approvals')}
              className="text-xs font-bold flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: DARK_MAROON }}
            >
              View All <ArrowRight size={12} />
            </button>
          }
        />
        <div className="space-y-2.5">
          {recentActivity.length > 0 ? (
            recentActivity.map((a, i) => (
              <div
                key={a.id || i}
                className="flex gap-3 items-start py-2 px-3 hover:bg-gray-50/50 transition-colors"
                style={{ borderRadius: 8 }}
              >
                <div className="mt-0.5 flex-shrink-0">{ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.info}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: TEXT }}>{a.text}</p>
                  <p className="text-[10px] text-gray-400">{a.sub}</p>
                </div>
                <span className="text-[10px] font-medium text-gray-400 flex-shrink-0 whitespace-nowrap">
                  {formatRelativeTime(a.timestamp)}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-gray-400 text-xs">No recent activity</div>
          )}
        </div>
      </div>
    </Layout>
  );
}
