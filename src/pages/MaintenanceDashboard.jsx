import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, AlertTriangle, Calendar, CheckCircle, Clock, XCircle, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import Layout from '../components/Layout';
import { 
  subscribeMaintenanceSchedules, 
  subscribeMaintenanceReports,
  acknowledgeMaintenanceReport,
  resolveMaintenanceReport,
  completeMaintenanceSchedule,
  updateMaintenanceReport,
} from '../services/maintenanceService';
import { useModal } from '../hooks/useModal';
import LoadingModal from '../components/modals/LoadingModal';
import ScheduleMaintenanceModal from '../components/modals/ScheduleMaintenanceModal';
import { ModalRenderer } from '../components/modals/ModalProvider';

import ProgressStatCards from '../components/ProgressStatCards';
import CustomSelect from '../components/ui/CustomSelect';

export default function MaintenanceDashboard() {
  const navigate = useNavigate();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const [activeTab, setActiveTab] = useState('reports'); // 'reports' or 'schedules'
  const [schedules, setSchedules] = useState([]);
  const [reports, setReports] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Subscribe to maintenance schedules
  useEffect(() => {
    const unsubscribe = subscribeMaintenanceSchedules(
      (data) => setSchedules(data),
      (error) => console.error('Error loading schedules:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to maintenance reports
  useEffect(() => {
    const unsubscribe = subscribeMaintenanceReports(
      (data) => setReports(data),
      (error) => console.error('Error loading reports:', error)
    );
    return () => unsubscribe();
  }, []);

  // Reset pagination on tab, filter, or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterStatus, searchQuery]);

  // Filter and search
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const statusMatch = filterStatus === 'all' || report.status === filterStatus;
      const searchMatch = !searchQuery || 
        report.roomName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.buildingName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.issue?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.reportedByName?.toLowerCase().includes(searchQuery.toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [reports, filterStatus, searchQuery]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      const statusMatch = filterStatus === 'all' || schedule.status === filterStatus;
      const searchMatch = !searchQuery ||
        schedule.roomName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        schedule.buildingName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        schedule.reason?.toLowerCase().includes(searchQuery.toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [schedules, filterStatus, searchQuery]);

  // Current active list and pagination math
  const currentList = activeTab === 'reports' ? filteredReports : filteredSchedules;
  const totalItems = currentList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return currentList.slice(start, start + itemsPerPage);
  }, [currentList, currentPage, itemsPerPage]);

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems);

  // Stats
  const reportStats = useMemo(() => ({
    total: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    acknowledged: reports.filter(r => r.status === 'acknowledged').length,
    inProgress: reports.filter(r => r.status === 'in-progress').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
  }), [reports]);

  const scheduleStats = useMemo(() => ({
    total: schedules.length,
    scheduled: schedules.filter(s => s.status === 'scheduled').length,
    inProgress: schedules.filter(s => s.status === 'in-progress').length,
    completed: schedules.filter(s => s.status === 'completed').length,
  }), [schedules]);

  const reportStatItems = useMemo(() => [
    { label: 'Total Reports', value: reportStats.total, icon: AlertTriangle, color: 'maroon' },
    { label: 'Pending', value: reportStats.pending, icon: Clock, color: 'amber' },
    { label: 'In Progress', value: reportStats.inProgress, icon: Wrench, color: 'blue' },
    { label: 'Resolved', value: reportStats.resolved, icon: CheckCircle, color: 'emerald' },
  ], [reportStats]);

  const scheduleStatItems = useMemo(() => [
    { label: 'Total Schedules', value: scheduleStats.total, icon: Calendar, color: 'maroon' },
    { label: 'Scheduled', value: scheduleStats.scheduled, icon: Clock, color: 'amber' },
    { label: 'In Progress', value: scheduleStats.inProgress, icon: Wrench, color: 'blue' },
    { label: 'Completed', value: scheduleStats.completed, icon: CheckCircle, color: 'emerald' },
  ], [scheduleStats]);

  // Handlers
  const handleScheduleFromReport = (report) => {
    setSelectedReport(report);
    setScheduleModalOpen(true);
  };

  const handleScheduleSuccess = () => {
    showNotification({
      type: 'success',
      title: 'Maintenance scheduled',
      message: 'The maintenance has been scheduled successfully.',
      autoCloseMs: 2000,
    });
    setSelectedReport(null);
  };

  const handleAcknowledge = async (reportId) => {
    const confirmed = await showConfirm({
      title: 'Acknowledge report?',
      message: 'This will mark the report as acknowledged and notify the reporter.',
      confirmText: 'Acknowledge',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Acknowledging report...');

    try {
      await acknowledgeMaintenanceReport(reportId, 'gsd-uid', 'GSD');
      showNotification({
        type: 'success',
        title: 'Report acknowledged',
        message: 'The maintenance report has been acknowledged.',
        autoCloseMs: 2000,
      });
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to acknowledge',
        message: error.message || 'Could not acknowledge the report.',
        autoCloseMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartProgress = async (reportId) => {
    const confirmed = await showConfirm({
      title: 'Start Repair Work?',
      message: 'This will update the maintenance report status to In Progress.',
      confirmText: 'Start Repair',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Updating status...');

    try {
      await updateMaintenanceReport(reportId, { status: 'in-progress' });
      showNotification({
        type: 'success',
        title: 'Status updated',
        message: 'Maintenance is now in progress.',
        autoCloseMs: 2000,
      });
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to update',
        message: error.message,
        autoCloseMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async (reportId) => {
    const confirmed = await showConfirm({
      title: 'Mark as resolved?',
      message: 'This will close the maintenance report.',
      confirmText: 'Resolve',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Resolving report...');

    try {
      await resolveMaintenanceReport(reportId, 'Issue resolved', 'gsd-uid', 'GSD');
      showNotification({
        type: 'success',
        title: 'Report resolved',
        message: 'The maintenance report has been marked as resolved.',
        autoCloseMs: 2000,
      });
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to resolve',
        message: error.message,
        autoCloseMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteSchedule = async (scheduleId) => {
    const confirmed = await showConfirm({
      title: 'Complete maintenance?',
      message: 'This will mark the maintenance as completed and restore the room to operational status.',
      confirmText: 'Complete',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Completing maintenance...');

    try {
      await completeMaintenanceSchedule(scheduleId);
      showNotification({
        type: 'success',
        title: 'Maintenance completed',
        message: 'The room has been restored to operational status.',
        autoCloseMs: 2000,
      });
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to complete',
        message: error.message,
        autoCloseMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending': return 'badge-pending';
      case 'acknowledged': return 'badge-approved';
      case 'in-progress': return 'text-blue-600 bg-blue-50 border-blue-200 text-xs font-bold px-3 py-1 rounded-full border';
      case 'resolved': return 'badge-approved';
      case 'scheduled': return 'badge-pending';
      case 'completed': return 'badge-approved';
      default: return 'badge-pending';
    }
  };

  return (
    <Layout 
      title="Maintenance Dashboard" 
      subtitle="GSD - Manage room maintenance schedules and reports"
    >
      {/* Header Stats */}
      <ProgressStatCards items={activeTab === 'reports' ? reportStatItems : scheduleStatItems} />

      {/* Tabs */}
      <div className="mb-6">
        <div className="inline-flex w-fit items-center p-1 gap-1 bg-white rounded-2xl border border-gray-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-5 py-2 text-xs font-bold transition-all flex items-center gap-2 rounded-xl cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-[#7A0808] text-white shadow-2xs'
                : 'bg-transparent text-[#2B3235] hover:bg-gray-100/70'
            }`}
          >
            <AlertTriangle size={15} />
            Maintenance Reports ({reports.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedules')}
            className={`px-5 py-2 text-xs font-bold transition-all flex items-center gap-2 rounded-xl cursor-pointer ${
              activeTab === 'schedules'
                ? 'bg-[#7A0808] text-white shadow-2xs'
                : 'bg-transparent text-[#2B3235] hover:bg-gray-100/70'
            }`}
          >
            <Calendar size={15} />
            Maintenance Schedules ({schedules.length})
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <div className="min-w-[160px]">
              <CustomSelect
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                options={
                  activeTab === 'reports'
                    ? [
                        { value: 'all', label: 'All Status' },
                        { value: 'pending', label: 'Pending' },
                        { value: 'acknowledged', label: 'Acknowledged' },
                        { value: 'in-progress', label: 'In Progress' },
                        { value: 'resolved', label: 'Resolved' },
                      ]
                    : [
                        { value: 'all', label: 'All Status' },
                        { value: 'scheduled', label: 'Scheduled' },
                        { value: 'completed', label: 'Completed' },
                      ]
                }
              />
            </div>
          </div>
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by room, building, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7A0808]/20"
              />
            </div>
          </div>
          {(filterStatus !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => { setFilterStatus('all'); setSearchQuery(''); }}
              className="px-3 py-2 text-xs font-bold text-[#7A0808] hover:bg-red-50 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Tabulated Content */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <h2 className="font-bold text-base mb-4 text-[#2B3235]">
          {activeTab === 'reports' ? 'Maintenance Reports' : 'Maintenance Schedules'}
        </h2>

        {totalItems === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {activeTab === 'reports' ? (
              <AlertTriangle size={48} className="mx-auto mb-3" />
            ) : (
              <Calendar size={48} className="mx-auto mb-3" />
            )}
            <p className="text-sm font-bold mb-1">
              No maintenance {activeTab === 'reports' ? 'reports' : 'schedules'} found
            </p>
            <p className="text-xs">
              {activeTab === 'reports' 
                ? 'Tickets will appear here when users report maintenance issues.' 
                : 'Schedule maintenance from room details pages.'}
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'reports' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Priority & Status</th>
                      <th className="py-3 px-4">Room & Building</th>
                      <th className="py-3 px-4">Issue Description</th>
                      <th className="py-3 px-4">Reported By & Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {paginatedList.map((report) => (
                      <tr 
                        key={report.id} 
                        className={`hover:bg-gray-50/80 transition-colors ${
                          report.status === 'pending' ? 'bg-red-50/30' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5 items-start">
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${getPriorityColor(report.priority)}`}>
                              {report.priority?.toUpperCase() || 'MEDIUM'} PRIORITY
                            </span>
                            <span className={getStatusBadge(report.status)}>
                              {report.status?.replace('-', ' ').toUpperCase() || 'PENDING'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-gray-900 text-sm">{report.roomName}</div>
                          <div className="text-gray-500 text-xs">{report.buildingName}</div>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="font-semibold text-gray-800 line-clamp-2">{report.issue}</p>
                          {report.acknowledgedByName && (
                            <p className="text-[11px] text-green-600 mt-0.5 font-medium">
                              ✓ Ack by {report.acknowledgedByName}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-gray-800">{report.reportedByName || 'Unknown'}</div>
                          <div className="text-gray-400 text-[11px]">
                            {report.createdAt?.seconds ? new Date(report.createdAt.seconds * 1000).toLocaleString() : 'N/A'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {report.status === 'pending' && !report.scheduleId && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAcknowledge(report.id)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 transition-colors shadow-2xs cursor-pointer"
                                >
                                  Acknowledge
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleScheduleFromReport(report)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#7A0808] text-white hover:bg-[#600000] transition-colors shadow-2xs cursor-pointer"
                                >
                                  📅 Schedule
                                </button>
                              </>
                            )}
                            {report.status === 'acknowledged' && !report.scheduleId && (
                              <button
                                type="button"
                                onClick={() => handleScheduleFromReport(report)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#7A0808] text-white hover:bg-[#600000] transition-colors shadow-2xs cursor-pointer"
                              >
                                📅 Schedule
                              </button>
                            )}
                            {report.scheduleId && (report.status === 'pending' || report.status === 'acknowledged') && (
                              <button
                                type="button"
                                onClick={() => handleStartProgress(report.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-2xs cursor-pointer"
                              >
                                🔧 Start Repair
                              </button>
                            )}
                            {report.status === 'in-progress' && (
                              <button
                                type="button"
                                onClick={() => handleResolve(report.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
                              >
                                ✓ Resolve
                              </button>
                            )}
                            {report.status === 'resolved' && (
                              <span className="text-xs font-semibold text-gray-500">Completed</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[650px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Room & Building</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                      <th className="py-3 px-4">Schedule Window</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {paginatedList.map((schedule) => (
                      <tr key={schedule.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={getStatusBadge(schedule.status)}>
                            {schedule.status?.toUpperCase() || 'SCHEDULED'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-gray-900 text-sm">{schedule.roomName}</div>
                          <div className="text-gray-500 text-xs">{schedule.buildingName}</div>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="font-semibold text-gray-800 line-clamp-2">{schedule.reason}</p>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-gray-800">Start: {schedule.startDate}</div>
                          <div className="text-gray-500 text-[11px]">End: {schedule.endDate}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {schedule.status !== 'completed' && schedule.status !== 'cancelled' ? (
                            <button
                              type="button"
                              onClick={() => handleCompleteSchedule(schedule.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
                            >
                              Complete Maintenance
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-gray-400">Restored</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
              <div>
                Showing <span className="font-bold text-gray-800">{startIndex}</span> to{' '}
                <span className="font-bold text-gray-800">{endIndex}</span> of{' '}
                <span className="font-bold text-gray-800">{totalItems}</span> entries
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Rows:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 bg-white font-semibold focus:outline-none"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                  >
                    <ChevronLeft size={15} /> Prev
                  </button>

                  {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, i, arr) => {
                      const prev = arr[i - 1];
                      const showEllipsis = prev && p - prev > 1;

                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="px-1 text-gray-400 font-bold">…</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                              currentPage === p
                                ? 'bg-[#7A0808] text-white shadow-xs'
                                : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
      
      {/* Schedule Maintenance Modal */}
      {selectedReport && (
        <ScheduleMaintenanceModal
          isOpen={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false);
            setSelectedReport(null);
          }}
          room={{
            id: selectedReport.roomId,
            docId: selectedReport.roomDocId || selectedReport.roomId,
            name: selectedReport.roomName,
            buildingId: selectedReport.buildingId,
          }}
          buildingName={selectedReport.buildingName}
          reportId={selectedReport.id}
          onSuccess={handleScheduleSuccess}
        />
      )}
    </Layout>
  );
}
