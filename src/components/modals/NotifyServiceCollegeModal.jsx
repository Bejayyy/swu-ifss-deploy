import React, { useState, useMemo } from 'react';
import {
  X,
  Bell,
  CheckCircle2,
  Lock,
  Building2,
  BookOpen,
  Send,
  Info,
  Clock,
  FlaskConical,
  GraduationCap,
  Calendar,
  RefreshCw,
  Check,
} from 'lucide-react';
import { releaseServiceCourses, isServiceCourseReleased } from '../../services/serviceCourseReleaseService';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from './ModalProvider';

export default function NotifyServiceCollegeModal({
  isOpen,
  onClose,
  motherCollegeCode,
  motherCollegeName,
  programCode,
  sectionName,
  schoolYearId,
  schoolYearLabel,
  semester,
  curriculumCourses = [],
  serviceCourseReleases = [],
  colleges = [],
  currentUser = {},
  onSuccess,
}) {
  const { showNotification, showConfirm, confirmState, notificationState } = useModal();
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [targetScope, setTargetScope] = useState('section'); // 'section' or 'program'
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isGENoSectionsCollege = (code) => {
    if (!code || !Array.isArray(colleges)) return false;
    const norm = String(code).trim().toUpperCase();
    return colleges.some(
      (c) =>
        (String(c.code).trim().toUpperCase() === norm ||
          String(c.name).trim().toUpperCase() === norm) &&
        c.managesGeneralEducationCourses &&
        (c.noOwnSections || c.doesNotHandleSections)
    );
  };

  // Extract all service items (courses with lecture or laboratory service college assigned, excluding GE providers with no own sections)
  const serviceItems = useMemo(() => {
    const items = [];
    (curriculumCourses || []).forEach((crs) => {
      const lecService = crs.lecServiceCollege ? String(crs.lecServiceCollege).trim().toUpperCase() : null;
      const labService = crs.labServiceCollege ? String(crs.labServiceCollege).trim().toUpperCase() : null;

      // Filter out GE No-Sections colleges (CAS) because they plot directly upon Registrar access without needing mother college release
      const validLecService = lecService && !isGENoSectionsCollege(lecService) ? lecService : null;
      const validLabService = labService && !isGENoSectionsCollege(labService) ? labService : null;

      if (!validLecService && !validLabService) return;

      if (validLecService && validLabService && validLecService === validLabService) {
        items.push({
          id: `${crs.id}_both`,
          courseId: crs.id,
          courseCode: crs.code || crs.courseCode,
          courseTitle: crs.title || crs.courseTitle || '',
          component: 'Lecture & Laboratory',
          serviceCollegeCode: validLecService,
          serviceCollegeName: crs.lecServiceCollegeName || validLecService,
          lecUnits: crs.lecUnits || 0,
          labUnits: crs.labUnits || 0,
          totalUnits: crs.units || crs.totalUnits || 0,
          yearLevel: crs.yearLevel || crs.year || '1st Year',
        });
      } else {
        if (validLecService) {
          items.push({
            id: `${crs.id}_lec`,
            courseId: crs.id,
            courseCode: crs.code || crs.courseCode,
            courseTitle: crs.title || crs.courseTitle || '',
            component: 'Lecture',
            serviceCollegeCode: validLecService,
            serviceCollegeName: crs.lecServiceCollegeName || validLecService,
            lecUnits: crs.lecUnits || 0,
            labUnits: 0,
            totalUnits: crs.lecUnits || 0,
            yearLevel: crs.yearLevel || crs.year || '1st Year',
          });
        }
        if (validLabService) {
          items.push({
            id: `${crs.id}_lab`,
            courseId: crs.id,
            courseCode: crs.code || crs.courseCode,
            courseTitle: crs.title || crs.courseTitle || '',
            component: 'Laboratory',
            serviceCollegeCode: validLabService,
            serviceCollegeName: crs.labServiceCollegeName || validLabService,
            lecUnits: 0,
            labUnits: crs.labUnits || 0,
            totalUnits: crs.labUnits || 0,
            yearLevel: crs.yearLevel || crs.year || '1st Year',
          });
        }
      }
    });

    return items;
  }, [curriculumCourses, colleges]);

  // Check release status for each item in the context of the selected target section
  const enrichedItems = useMemo(() => {
    return serviceItems.map((item) => {
      const released = isServiceCourseReleased(serviceCourseReleases, {
        courseId: item.courseId,
        courseCode: item.courseCode,
        component: item.component,
        sectionName: targetScope === 'section' ? sectionName : 'ALL',
        serviceCollegeCode: item.serviceCollegeCode,
        motherCollegeCode,
      });

      const matchingRelease = (serviceCourseReleases || []).find((rel) => {
        const cMatch = rel.courseId === item.courseId || String(rel.courseCode).toUpperCase() === String(item.courseCode).toUpperCase();
        const sMatch = targetScope === 'section' ? (rel.sectionName === sectionName || rel.sectionName === 'ALL') : true;
        return cMatch && sMatch;
      });

      return {
        ...item,
        isReleased: released,
        matchingRelease,
      };
    });
  }, [serviceItems, serviceCourseReleases, targetScope, sectionName, motherCollegeCode]);

  const unreleasedItems = useMemo(() => {
    return enrichedItems.filter((item) => !item.isReleased);
  }, [enrichedItems]);

  const toggleSelectItem = (id) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllUnreleased = () => {
    if (selectedItemIds.size === unreleasedItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(unreleasedItems.map((i) => i.id)));
    }
  };

  const handleRelease = async () => {
    const itemsToRelease = enrichedItems.filter((i) => selectedItemIds.has(i.id));
    if (itemsToRelease.length === 0) return;

    const confirmed = await showConfirm({
      title: 'Notify & Release Service Courses?',
      message: `Are you sure you want to notify and release ${itemsToRelease.length} service subject(s) for ${targetScope === 'section' ? `Section ${sectionName || 'Current'}` : `all ${programCode || 'program'} sections`}? The assigned Service College Deans will immediately be granted permission to plot these schedules.`,
      confirmText: 'Yes, Notify & Release',
      cancelText: 'Cancel',
      variant: 'primary',
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const releasePayloads = itemsToRelease.map((item) => ({
        courseId: item.courseId,
        courseCode: item.courseCode,
        courseTitle: item.courseTitle,
        component: item.component,
        serviceCollegeCode: item.serviceCollegeCode,
        serviceCollegeName: item.serviceCollegeName,
        sectionName: targetScope === 'section' ? (sectionName || 'ALL') : 'ALL',
        programCode: programCode || '',
      }));

      const res = await releaseServiceCourses({
        schoolYearId,
        semester,
        motherCollegeCode: motherCollegeCode || 'CMT',
        motherCollegeName: motherCollegeName || motherCollegeCode,
        releases: releasePayloads,
        releasedBy: {
          uid: currentUser?.uid,
          name: currentUser?.name || currentUser?.displayName || 'Mother College Dean',
          email: currentUser?.email || '',
        },
      });

      if (res.success) {
        showNotification({
          type: 'success',
          title: 'Service Colleges Notified & Released',
          message: `Successfully released ${res.count} service ${res.count === 1 ? 'course' : 'courses'}. The service college deans can now plot their faculty and room schedules.`,
        });
        setSelectedItemIds(new Set());
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error('Error releasing service courses:', err);
      showNotification({
        type: 'error',
        title: 'Release Failed',
        message: err.message || 'Failed to notify service college deans. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] relative animate-in zoom-in-95 duration-200">
        {/* Loading Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-6 text-center space-y-3 animate-in fade-in duration-150">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center border border-red-200">
              <RefreshCw size={20} className="animate-spin text-[#7A0808]" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-gray-900">Releasing Service Courses...</h4>
              <p className="text-xs text-gray-500 mt-0.5">Saving permissions and notifying designated Service College Deans.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#7A0808] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Bell size={16} />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900">
                Notify Service Colleges
              </h3>
              <p className="text-xs text-gray-500">
                Release external service subjects to allow assigned Deans to plot schedules
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Info Chips & Scope Selector */}
        <div className="px-6 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-800 px-2.5 py-1 rounded-md font-semibold">
              <Building2 size={12} className="text-gray-500" />
              {motherCollegeName || motherCollegeCode}
            </span>
            {programCode && (
              <span className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-800 px-2.5 py-1 rounded-md font-semibold">
                <GraduationCap size={12} className="text-gray-500" />
                {programCode}
              </span>
            )}
            {sectionName && (
              <span className="inline-flex items-center gap-1 bg-[#7A0808] text-white px-2.5 py-1 rounded-md font-semibold">
                Section: {sectionName}
              </span>
            )}
            <span className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-600 px-2.5 py-1 rounded-md font-medium">
              <Calendar size={12} className="text-gray-400" />
              {schoolYearLabel || schoolYearId} · Sem {semester}
            </span>
          </div>

          {/* Scope Segmented Control */}
          <div className="flex items-center bg-gray-200/70 p-0.5 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTargetScope('section')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                targetScope === 'section'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              This Section ({sectionName || 'Current'})
            </button>
            <button
              type="button"
              onClick={() => setTargetScope('program')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                targetScope === 'program'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All {programCode || 'Program'} Sections
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Information Banner */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 flex items-start gap-2.5">
            <Info size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-amber-900">
                Service College Deans are locked until released.
              </p>
              <p className="text-amber-800/90 text-[11px] leading-relaxed">
                Clicking <strong>Notify & Release</strong> will unlock schedule plotting for the designated Service College Dean (e.g. CITE, CAS) and send them an instant notification.
              </p>
            </div>
          </div>

          {/* Course List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-700 uppercase tracking-wide text-[11px]">
                  External Service Subjects ({enrichedItems.length})
                </span>
                {unreleasedItems.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-[#7A0808] border border-red-200 text-[10px] font-bold">
                    {unreleasedItems.length} pending release
                  </span>
                )}
              </div>

              {unreleasedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllUnreleased}
                  className="font-semibold text-[#7A0808] hover:underline cursor-pointer"
                >
                  {selectedItemIds.size === unreleasedItems.length
                    ? 'Deselect All'
                    : `Select All Unreleased (${unreleasedItems.length})`}
                </button>
              )}
            </div>

            {enrichedItems.length === 0 ? (
              <div className="py-10 text-center bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <BookOpen size={28} className="mx-auto text-gray-300" />
                <p className="text-xs font-bold text-gray-700">No External Service Subjects</p>
                <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                  All courses in this curriculum are taught internally by {motherCollegeName || motherCollegeCode}.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {enrichedItems.map((item) => {
                  const isSelected = selectedItemIds.has(item.id);
                  const isReleased = item.isReleased;

                  return (
                    <div
                      key={item.id}
                      onClick={() => !isReleased && toggleSelectItem(item.id)}
                      className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                        isReleased
                          ? 'bg-emerald-50/40 border-emerald-200 cursor-default'
                          : isSelected
                          ? 'bg-red-50/40 border-[#7A0808] ring-1 ring-[#7A0808] cursor-pointer'
                          : 'bg-white hover:bg-gray-50 border-gray-200 cursor-pointer shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Checkbox */}
                        <div className="pt-0.5">
                          {isReleased ? (
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectItem(item.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded text-[#7A0808] border-gray-300 focus:ring-[#7A0808] cursor-pointer"
                            />
                          )}
                        </div>

                        {/* Info */}
                        <div className="space-y-1 min-w-0 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-900">{item.courseCode}</span>
                            <span className="text-gray-600 truncate">— {item.courseTitle}</span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                item.component.includes('Lab')
                                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {item.component.includes('Lab') && item.component.includes('Lec')
                                ? 'Lecture & Lab'
                                : item.component.includes('Lab')
                                ? 'Laboratory'
                                : 'Lecture'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
                            <span className="flex items-center gap-1 text-gray-700 font-medium">
                              <Building2 size={12} className="text-gray-400" />
                              Service College: <strong className="text-gray-900">{item.serviceCollegeName || item.serviceCollegeCode}</strong>
                            </span>
                            <span>•</span>
                            <span>Year: {item.yearLevel}</span>
                            <span>•</span>
                            <span>Target: {targetScope === 'section' ? sectionName || 'Section' : 'All Sections'}</span>
                          </div>

                          {isReleased && item.matchingRelease && (
                            <p className="text-[10px] font-medium text-emerald-700 flex items-center gap-1 pt-0.5">
                              <Clock size={11} />
                              Released on {new Date(item.matchingRelease.releasedAt || item.matchingRelease.createdAt).toLocaleDateString()} by {item.matchingRelease.releasedByName || 'Dean'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {isReleased ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Check size={11} />
                            Released
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            <Lock size={11} />
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500 font-medium">
            {selectedItemIds.size > 0 ? (
              <span className="font-semibold text-[#7A0808]">
                {selectedItemIds.size} {selectedItemIds.size === 1 ? 'subject' : 'subjects'} selected
              </span>
            ) : (
              <span>Select subjects above to notify</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleRelease}
              disabled={selectedItemIds.size === 0 || isSubmitting}
              className="bg-[#7A0808] hover:bg-[#600606] text-white px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send size={13} />
              {isSubmitting ? 'Releasing...' : `Notify & Release (${selectedItemIds.size})`}
            </button>
          </div>
        </div>

        {/* Render Modal Dialogs on top of this modal */}
        <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
      </div>
    </div>
  );
}
