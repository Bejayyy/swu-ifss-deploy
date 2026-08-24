import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Clock,
  Trash2,
  Eye,
  Check,
  RefreshCw,
  FileCode,
  FileUp,
  AlertTriangle,
} from 'lucide-react';
import {
  parseCalendarDocumentWithAi,
  parseCalendarTextWithAi,
} from '../../services/calendarAiService';
import {
  applyAiParsedCalendar,
  findExistingSchoolYearByLabel,
  getSchoolYearDataSummary,
} from '../../services/academicCalendarService';
import { formatDisplayDate } from '../../utils/academicCalendarUtils';
import ConfirmModal from './ConfirmModal';

function formatExamRange(item) {
  if (!item || !item.start || item.start === 'NA') return 'NA';
  if (!item.end || item.end === item.start) return formatDisplayDate(item.start);
  return `${formatDisplayDate(item.start)} — ${formatDisplayDate(item.end)}`;
}

export default function AiCalendarScanModal({
  onClose,
  schoolYearId,
  schoolYearLabel = '2026-2027',
  onSuccess,
}) {
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'text'
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [parsedResult, setParsedResult] = useState(null);
  const [error, setError] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Overwrite control state
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [existingSummary, setExistingSummary] = useState(null);

  // Editable parsed events state
  const [selectedEvents, setSelectedEvents] = useState({});

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf');
    const isImg = selectedFile.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(selectedFile.name);

    if (!isPdf && !isImg) {
      setError('Please upload an image (PNG, JPG, WebP) or PDF file of the school calendar.');
      return;
    }

    setFile(selectedFile);
    setError('');
    setParsedResult(null);

    if (isImg) {
      const url = URL.createObjectURL(selectedFile);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleScanFile = async () => {
    if (!file) {
      setError('Please select a calendar PDF or image to scan.');
      return;
    }

    setIsScanning(true);
    setError('');

    try {
      const result = await parseCalendarDocumentWithAi(file, schoolYearLabel);
      setParsedResult(result);

      const initialSelected = {};
      (result.events || []).forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedEvents(initialSelected);
    } catch (err) {
      console.error('AI Scan Error:', err);
      setError(err.message || 'Failed to analyze calendar document with AI.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanText = async () => {
    if (!pastedText.trim()) {
      setError('Please paste the calendar event text.');
      return;
    }

    setIsScanning(true);
    setError('');

    try {
      const result = await parseCalendarTextWithAi(pastedText, schoolYearLabel);
      setParsedResult(result);

      const initialSelected = {};
      (result.events || []).forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedEvents(initialSelected);
    } catch (err) {
      console.error('AI Text Scan Error:', err);
      setError(err.message || 'Failed to parse calendar text with AI.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleInitialApply = async () => {
    if (!parsedResult) return;
    setError('');

    try {
      // Check if target school year already exists and has data
      const targetLabel = parsedResult.schoolYear || schoolYearLabel;
      let targetId = schoolYearId;
      if (!targetId) {
        const found = await findExistingSchoolYearByLabel(targetLabel);
        if (found) targetId = found.id;
      }

      if (targetId) {
        const summary = await getSchoolYearDataSummary(targetId);
        if (summary.exists && (summary.eventCount > 0 || summary.hasSemesters)) {
          setExistingSummary({ ...summary, targetId, targetLabel });
          setShowOverwriteModal(true);
          return;
        }
      }

      // No existing data conflict -> apply directly with overwrite
      await executeApply(true, targetId);
    } catch (err) {
      console.error('Error verifying school year:', err);
      await executeApply(true, schoolYearId);
    }
  };

  const executeApply = async (clearExisting = true, targetId = schoolYearId) => {
    if (!parsedResult) return;
    setIsApplying(true);
    setError('');

    try {
      const filteredEvents = (parsedResult.events || []).filter((_, idx) => selectedEvents[idx]);
      const dataToApply = {
        ...parsedResult,
        events: filteredEvents,
      };

      const res = await applyAiParsedCalendar(targetId, dataToApply, { clearExisting });
      setShowOverwriteModal(false);

      if (onSuccess) {
        const actionMsg = clearExisting ? 'overwritten & replaced' : 'merged';
        onSuccess(`Successfully ${actionMsg} calendar: ${filteredEvents.length} events and semester schedules applied!`);
      }
      onClose();
    } catch (err) {
      console.error('Error applying calendar:', err);
      setError(err.message || 'Failed to save parsed calendar to database.');
      setShowOverwriteModal(false);
    } finally {
      setIsApplying(false);
    }
  };

  const toggleEventSelect = (index) => {
    setSelectedEvents((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleAllEvents = (selectAll) => {
    const nextState = {};
    (parsedResult?.events || []).forEach((_, idx) => {
      nextState[idx] = selectAll;
    });
    setSelectedEvents(nextState);
  };

  return (
    <>
      <div
        className="modal-overlay fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
        style={{ margin: 0, padding: '16px' }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            className="px-6 py-4 text-white flex items-center justify-between shadow-md"
            style={{ backgroundColor: '#7A0808', background: 'linear-gradient(135deg, #8B0B0B 0%, #7A0808 50%, #5E0000 100%)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md shadow-xs">
                <Sparkles size={20} className="text-amber-300" />
              </div>
              <div>
                <h3 className="font-black text-base text-white flex items-center gap-2">
                  <span>AI School Calendar Scanner</span>
                  <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-400/30 text-amber-200 border border-amber-300/40">
                    Gemini AI
                  </span>
                </h3>
                <p className="text-xs text-white/80">
                  Upload your official calendar PDF/photo or paste its text listing to mark all dates automatically
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            {error && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 font-bold text-xs flex items-center gap-3 animate-in shake">
                <AlertCircle size={18} className="shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* STEP 1: SCAN CONTROLS (If not scanned yet) */}
            {!parsedResult && (
              <div className="space-y-4">
                {/* Method Tabs */}
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('file')}
                    className={`px-5 py-3 font-black text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                      activeTab === 'file'
                        ? 'border-[#7A0808] text-[#7A0808]'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <Upload size={16} />
                    <span>Upload Document (PDF / Image)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className={`px-5 py-3 font-black text-xs border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                      activeTab === 'text'
                        ? 'border-[#7A0808] text-[#7A0808]'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <FileText size={16} />
                    <span>Paste Calendar Text</span>
                  </button>
                </div>

                {/* TAB 1: UPLOAD FILE */}
                {activeTab === 'file' && (
                  <div className="space-y-4">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.[0]) {
                          handleFileSelect(e.dataTransfer.files[0]);
                        }
                      }}
                      className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
                        isDragging
                          ? 'border-[#7A0808] bg-red-50/50 scale-99'
                          : file
                          ? 'border-emerald-400 bg-emerald-50/30'
                          : 'border-gray-300 hover:border-gray-400 bg-gray-50/50'
                      }`}
                      onClick={() => document.getElementById('ai-calendar-file-input')?.click()}
                    >
                      <input
                        id="ai-calendar-file-input"
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      />

                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-[#7A0808]">
                          {file ? <FileText size={26} /> : <FileUp size={26} />}
                        </div>

                        {file ? (
                          <div>
                            <p className="font-black text-sm text-gray-900 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB · Click to change file
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="font-black text-sm text-gray-900">
                              Drop your official School Calendar here, or <span className="text-[#7A0808] underline">browse</span>
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Supports PDF documents and high-resolution images (PNG, JPG)
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {filePreview && (
                      <div className="relative rounded-2xl overflow-hidden border border-gray-200 max-h-60 bg-gray-100 flex items-center justify-center">
                        <img src={filePreview} alt="Calendar Preview" className="object-contain max-h-60 w-full" />
                        <div className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[10px] font-bold backdrop-blur-md">
                          Image Attached
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleScanFile}
                        disabled={!file || isScanning}
                        className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
                          !file || isScanning
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-[#7A0808] hover:bg-[#600000] text-white cursor-pointer active:scale-98'
                        }`}
                      >
                        {isScanning ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Analyzing Document with Gemini AI...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={15} className="text-amber-300" />
                            <span>Start AI Calendar Scan</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: PASTE TEXT */}
                {activeTab === 'text' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Paste Calendar Text (Events per month, holidays, exam schedules):
                      </label>
                      <textarea
                        rows={8}
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder={`Example:\nApril\n02 - Maunday Thursday (Regular Holiday)\n03 - Good Friday (Regular Holiday)\n04 - Black Saturday (Special Non-Working Holiday)\n09 - Araw ng Kagitingan (Regular Holiday)\n27 - Classes Begin for Summer 2026\n\nMay\n01 - Labor Day (Regular Holiday)\n\nJune\n06 - Summer Classes End\n12 - Independence Day (Regular Holiday)\n26 to July 4 - Pre-Activities for First Semester (Upperclassmen)`}
                        className="w-full p-4 rounded-2xl border border-gray-300 focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] text-xs font-mono outline-none bg-gray-50/50"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleScanText}
                        disabled={!pastedText.trim() || isScanning}
                        className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
                          !pastedText.trim() || isScanning
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-[#7A0808] hover:bg-[#600000] text-white cursor-pointer active:scale-98'
                        }`}
                      >
                        {isScanning ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Parsing Text with Gemini AI...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={15} className="text-amber-300" />
                            <span>Parse Text with AI</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: REVIEW PARSED RESULTS */}
            {parsedResult && (
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Summary Cards Header (4 Cards) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-red-50/60 border border-red-200/80 p-3.5 rounded-2xl">
                    <p className="text-[10px] font-extrabold uppercase text-[#7A0808] tracking-wider">School Year</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">
                      {parsedResult.schoolYear || schoolYearLabel}
                    </p>
                  </div>

                  <div className="bg-blue-50/60 border border-blue-200/80 p-3.5 rounded-2xl">
                    <p className="text-[10px] font-extrabold uppercase text-blue-800 tracking-wider">Semesters</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">
                      {parsedResult.semesters?.length || 0} Terms
                    </p>
                  </div>

                  <div className="bg-purple-50/60 border border-purple-200/80 p-3.5 rounded-2xl">
                    <p className="text-[10px] font-extrabold uppercase text-purple-800 tracking-wider">Exam Periods</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">
                      P1, P2, P3, Finals
                    </p>
                  </div>

                  <div className="bg-emerald-50/60 border border-emerald-200/80 p-3.5 rounded-2xl">
                    <p className="text-[10px] font-extrabold uppercase text-emerald-800 tracking-wider">Events & Holidays</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">
                      {parsedResult.events?.length || 0} Events Found
                    </p>
                  </div>
                </div>

                {/* Detected Semesters */}
                {parsedResult.semesters?.length > 0 && (
                  <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200 space-y-2">
                    <h4 className="font-black text-xs text-gray-800 flex items-center gap-1.5">
                      <Layers size={14} className="text-[#7A0808]" /> Academic Terms & Semester Dates (Extracted from Calendar)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {parsedResult.semesters.map((sem, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                          <span className="text-[11px] font-black text-[#7A0808] block border-b border-gray-100 pb-1">{sem.name}</span>
                          <p className="text-xs font-bold text-gray-800">
                            {sem.start ? formatDisplayDate(sem.start) : 'N/A'} — {sem.end ? formatDisplayDate(sem.end) : 'N/A'}
                          </p>
                          {(sem.upperclassmenStart || sem.freshmenStart) && (
                            <div className="text-[10px] text-gray-500 pt-0.5 space-y-0.5 border-t border-gray-50">
                              {sem.upperclassmenStart && (
                                <p><span className="font-bold text-gray-700">Upperclassmen:</span> {formatDisplayDate(sem.upperclassmenStart)} — {formatDisplayDate(sem.upperclassmenEnd)}</p>
                              )}
                              {sem.freshmenStart && (
                                <p><span className="font-bold text-gray-700">Freshmen:</span> {formatDisplayDate(sem.freshmenStart)} — {formatDisplayDate(sem.freshmenEnd)}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Schedule of Major Examinations Table */}
                {parsedResult.examPeriods && (
                  <div className="bg-blue-50/40 p-4 rounded-2xl border border-blue-200/70 space-y-3">
                    <h4 className="font-black text-xs text-blue-900 flex items-center gap-1.5">
                      <Clock size={14} className="text-blue-700" /> Schedule of Major Examinations (Full Week Ranges)
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* First Semester */}
                      {parsedResult.examPeriods['1'] && (
                        <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs space-y-2">
                          <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider block border-b border-blue-50 pb-1">
                            First Semester
                          </span>
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <span className="font-extrabold text-blue-800 block text-[9px] uppercase">Upperclassmen</span>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P1:</span> {formatExamRange(parsedResult.examPeriods['1']?.p1?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P2:</span> {formatExamRange(parsedResult.examPeriods['1']?.p2?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P3:</span> {formatExamRange(parsedResult.examPeriods['1']?.p3?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Finals:</span> {formatExamRange(parsedResult.examPeriods['1']?.rbe?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Validation:</span> {formatExamRange(parsedResult.examPeriods['1']?.validation?.up)}</p>
                            </div>
                            <div className="pt-1.5 border-t border-gray-100">
                              <span className="font-extrabold text-indigo-800 block text-[9px] uppercase">Freshmen</span>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P1:</span> {formatExamRange(parsedResult.examPeriods['1']?.p1?.fr)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P2:</span> {formatExamRange(parsedResult.examPeriods['1']?.p2?.fr)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P3:</span> {formatExamRange(parsedResult.examPeriods['1']?.p3?.fr)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Finals:</span> <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">NA (No Finals)</span></p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Validation:</span> {formatExamRange(parsedResult.examPeriods['1']?.validation?.fr)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Second Semester */}
                      {parsedResult.examPeriods['2'] && (
                        <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs space-y-2">
                          <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider block border-b border-blue-50 pb-1">
                            Second Semester
                          </span>
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <span className="font-extrabold text-blue-800 block text-[9px] uppercase">Upperclassmen</span>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P1:</span> {formatExamRange(parsedResult.examPeriods['2']?.p1?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P2:</span> {formatExamRange(parsedResult.examPeriods['2']?.p2?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P3:</span> {formatExamRange(parsedResult.examPeriods['2']?.p3?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Finals:</span> {formatExamRange(parsedResult.examPeriods['2']?.rbe?.up)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Validation:</span> {formatExamRange(parsedResult.examPeriods['2']?.validation?.up)}</p>
                            </div>
                            <div className="pt-1.5 border-t border-gray-100">
                              <span className="font-extrabold text-indigo-800 block text-[9px] uppercase">Freshmen</span>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P1:</span> {formatExamRange(parsedResult.examPeriods['2']?.p1?.fr)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P2:</span> {formatExamRange(parsedResult.examPeriods['2']?.p2?.fr)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P3:</span> {formatExamRange(parsedResult.examPeriods['2']?.p3?.fr)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Finals:</span> <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">NA (No Finals)</span></p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">Validation:</span> {formatExamRange(parsedResult.examPeriods['2']?.validation?.fr)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Summer */}
                      {parsedResult.examPeriods['3'] && (
                        <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs space-y-2">
                          <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider block border-b border-blue-50 pb-1">
                            Summer 2026
                          </span>
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <span className="font-extrabold text-blue-800 block text-[9px] uppercase">All Levels</span>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P1:</span> {formatExamRange(parsedResult.examPeriods['3']?.p1?.up || parsedResult.examPeriods['3']?.p1?.fr)}</p>
                              <p className="text-gray-800 font-semibold"><span className="text-gray-500">P2:</span> {formatExamRange(parsedResult.examPeriods['3']?.p2?.up || parsedResult.examPeriods['3']?.p2?.fr)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Events Review Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-xs text-gray-900 flex items-center gap-1.5">
                      <Calendar size={14} className="text-[#7A0808]" /> Detected Events & Holidays ({parsedResult.events?.length || 0})
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleAllEvents(true)}
                        className="text-[11px] font-bold text-[#7A0808] hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => toggleAllEvents(false)}
                        className="text-[11px] font-bold text-gray-500 hover:underline cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                    <div className="divide-y divide-gray-100">
                      {(parsedResult.events || []).map((ev, idx) => {
                        const isSelected = selectedEvents[idx];
                        const isHoliday = ev.category === 'holiday' || ev.isNoClass;
                        const isExam = ev.category === 'exam';

                        return (
                          <div
                            key={idx}
                            onClick={() => toggleEventSelect(idx)}
                            className={`p-3 flex items-center gap-3 transition-colors cursor-pointer ${
                              isSelected ? 'bg-white hover:bg-gray-50/80' : 'bg-gray-50/60 opacity-60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(isSelected)}
                              onChange={() => toggleEventSelect(idx)}
                              className="w-4 h-4 rounded text-[#7A0808] focus:ring-[#7A0808]"
                              onClick={(e) => e.stopPropagation()}
                            />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-900 text-xs truncate">{ev.title}</span>
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                    isHoliday
                                      ? 'bg-red-100 text-red-800'
                                      : isExam
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-purple-100 text-purple-800'
                                  }`}
                                >
                                  {isHoliday ? 'Holiday / No Class' : isExam ? 'Exam Period' : ev.category || 'Event'}
                                </span>
                              </div>
                              {ev.description && (
                                <p className="text-[10px] text-gray-500 truncate mt-0.5">{ev.description}</p>
                              )}
                            </div>

                            <div className="text-right flex-shrink-0">
                              <span className="text-xs font-black text-gray-700">
                                {formatDisplayDate(ev.startDate)}
                              </span>
                              {ev.endDate && ev.endDate !== ev.startDate && (
                                <span className="block text-[10px] font-semibold text-gray-500">
                                  to {formatDisplayDate(ev.endDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Overwrite & Duplicate Prevention Settings Notice */}
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-700 shrink-0" />
                    <span className="text-amber-950 font-semibold">
                      Overwrite existing calendar data for this School Year to prevent duplicate entries
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 font-bold text-[#7A0808] cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={overwriteExisting}
                      onChange={(e) => setOverwriteExisting(e.target.checked)}
                      className="rounded border-amber-300 text-[#7A0808] focus:ring-[#7A0808]"
                    />
                    <span>Overwrite mode</span>
                  </label>
                </div>

                {/* Action Buttons: Re-scan / Apply */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setParsedResult(null);
                      setFile(null);
                      setFilePreview(null);
                      setPastedText('');
                    }}
                    className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-bold transition-colors cursor-pointer"
                    disabled={isApplying}
                  >
                    Scan Another Document
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-bold transition-colors cursor-pointer"
                      disabled={isApplying}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleInitialApply}
                      disabled={isApplying}
                      className="px-6 py-2.5 rounded-xl bg-[#7A0808] hover:bg-[#600000] text-white font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      {isApplying ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>Applying to Calendar...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Apply to Calendar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overwrite Confirmation Modal */}
      {showOverwriteModal && existingSummary && (
        <ConfirmModal
          title={`Overwrite Existing School Year Data?`}
          message={`A calendar for School Year "${existingSummary.displayLabel || existingSummary.targetLabel}" already exists with ${existingSummary.eventCount} scheduled event(s) and semester configuration. Overwriting will cleanly replace previous events and update semester & exam periods to prevent duplicate doubled entries.`}
          confirmText="Yes, Overwrite & Replace"
          cancelText="Cancel"
          variant="primary"
          isProcessing={isApplying}
          onConfirm={() => executeApply(true, existingSummary.targetId)}
          onCancel={() => setShowOverwriteModal(false)}
        />
      )}
    </>
  );
}
