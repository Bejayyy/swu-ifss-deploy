import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  X,
  Plus,
  ChevronDown,
  Trash2,
  UserPlus,
  User,
  FileSpreadsheet,
  Download,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { INSTITUTIONAL_EMAIL_DOMAIN } from '../../firebase/constants';
import { requiresCollege, formatCollegeName } from '../../constants/colleges';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getRoleDefinition } from '../../constants/rolePermissions';
import { subscribeColleges } from '../../services/collegeService';
import AddRoleModal from './AddRoleModal';
import AddCollegeModal from './AddCollegeModal';
import CustomSelect from '../ui/CustomSelect';
import { downloadBulkUserTemplate, parseBulkUserSpreadsheet, toTitleCase } from '../../utils/excelTemplate';

const createEmptyUser = (defaultRole = 'dean', roleDefinitions = {}) => {
  const def = getRoleDefinition(defaultRole, roleDefinitions);
  return {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    department: '',
    college: '',
    role: defaultRole,
    useCustomAccess: false,
    permissions: def.permissions || [],
    navKeys: def.navKeys || [],
  };
};

export default function AddUserModal({
  onClose,
  onSave,
  roleOptions = [],
  roleDefinitions = {},
  roleDefinitionsList = [],
  onSaveRole,
}) {
  const [activeTab, setActiveTab] = useState('individual'); // 'individual' | 'bulk'
  const [colleges, setColleges] = useState([]);
  const [loadingColleges, setLoadingColleges] = useState(true);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [showAddCollegeModal, setShowAddCollegeModal] = useState(false);
  const [activeRoleModalUserIndex, setActiveRoleModalUserIndex] = useState(null);
  const [activeCollegeModalUserIndex, setActiveCollegeModalUserIndex] = useState(null);

  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [bulkRows, setBulkRows] = useState([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const defaultRole = roleOptions[0]?.value || 'dean';

  const [usersList, setUsersList] = useState([
    createEmptyUser(defaultRole, roleDefinitions),
  ]);
  const [error, setError] = useState('');

  // Subscribe to colleges from Firestore
  useEffect(() => {
    return subscribeColleges(
      (data) => {
        setColleges(data);
        setLoadingColleges(false);
      },
      (err) => {
        console.error('Error loading colleges:', err);
        setLoadingColleges(false);
      }
    );
  }, []);

  const roles = useMemo(
    () => (roleOptions.length ? roleOptions : [{ value: 'dean', label: 'Dean' }]),
    [roleOptions],
  );

  // Helper to revalidate bulk rows live upon cell edits
  const revalidateRows = (rows) => {
    const seenEmails = new Set();
    return rows.map((r) => {
      const fn = (r.firstName || '').trim();
      const mn = (r.middleName || '').trim();
      const ln = (r.lastName || '').trim();
      const email = (r.email || '').trim().toLowerCase();
      const role = r.role || defaultRole;
      const college = r.college || '';

      const errs = [];
      if (!fn) errs.push('First name is required');
      // Middle name is optional
      if (!ln) errs.push('Last name is required');
      if (!email) {
        errs.push('Email is required');
      } else if (!email.endsWith(`@${INSTITUTIONAL_EMAIL_DOMAIN}`)) {
        errs.push(`Email domain must be @${INSTITUTIONAL_EMAIL_DOMAIN}`);
      } else if (seenEmails.has(email)) {
        errs.push('Duplicate email in list');
      } else {
        seenEmails.add(email);
      }

      const showCollege = requiresCollege(role, roleDefinitions);
      if (showCollege && !college) {
        errs.push('College is required for role');
      }

      return {
        ...r,
        firstName: fn,
        middleName: mn,
        lastName: ln,
        email,
        role,
        college: showCollege ? college : '',
        isValid: errs.length === 0,
        errors: errs,
      };
    });
  };

  // INDIVIDUAL FORM LOGIC
  const updateUserField = (index, field, value) => {
    setUsersList((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };

      if (field === 'role') {
        const showCollege = requiresCollege(value, roleDefinitions);
        if (!showCollege) {
          target.college = '';
          target.department = '';
        }
        if (!target.useCustomAccess) {
          const def = getRoleDefinition(value, roleDefinitions);
          target.permissions = def.permissions || [];
          target.navKeys = def.navKeys || [];
        }
      } else if (field === 'useCustomAccess') {
        if (!value) {
          const def = getRoleDefinition(target.role, roleDefinitions);
          target.permissions = def.permissions || [];
          target.navKeys = def.navKeys || [];
        }
      }

      updated[index] = target;
      return updated;
    });
  };

  const handleAddPerson = () => {
    const lastUserRole = usersList[usersList.length - 1]?.role || defaultRole;
    setUsersList((prev) => [
      ...prev,
      createEmptyUser(lastUserRole, roleDefinitions),
    ]);
  };

  const handleRemovePerson = (index) => {
    if (usersList.length <= 1) return;
    setUsersList((prev) => prev.filter((_, i) => i !== index));
  };

  // BULK FILE LOGIC
  const handleDownloadTemplate = async () => {
    if (isDownloadingTemplate) return;
    setError('');
    setIsDownloadingTemplate(true);
    try {
      // Yield once so the preparing state is painted before workbook creation.
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      downloadBulkUserTemplate(roles, colleges);
    } catch (err) {
      console.error('Unable to download bulk user template:', err);
      setError(err.message || 'Unable to prepare the Excel template. Please try again.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setError('');
    setUploadedFileName(file.name);
    setIsProcessing(true);
    setProcessingMsg('Reading spreadsheet file...');

    try {
      await new Promise((res) => setTimeout(res, 400));
      setProcessingMsg('Validating roles, colleges, and email domains...');

      const result = await parseBulkUserSpreadsheet(file, roles, roleDefinitions, colleges);
      setBulkRows(result.rows || []);

      if (!result.rows || result.rows.length === 0) {
        setError('No valid user data found in the spreadsheet.');
      }
    } catch (err) {
      setError(err.message || 'Failed to process file.');
      setBulkRows([]);
    } finally {
      setIsProcessing(false);
      setProcessingMsg('');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const updateBulkRowField = (index, field, value) => {
    setBulkRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return revalidateRows(updated);
    });
  };

  const handleRemoveBulkRow = (index) => {
    setBulkRows((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return revalidateRows(updated);
    });
  };

  const handleAddBulkRow = () => {
    setBulkRows((prev) => {
      const newRow = {
        id: `bulk_new_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        firstName: '',
        middleName: '',
        lastName: '',
        email: '',
        role: defaultRole,
        college: '',
        useCustomAccess: false,
        permissions: [],
        navKeys: [],
        isValid: false,
        errors: ['First name is required', 'Last name is required', 'Email is required'],
      };
      return revalidateRows([...prev, newRow]);
    });
  };

  const handleClearBulk = () => {
    setBulkRows([]);
    setUploadedFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // SUBMIT HANDLER
  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (activeTab === 'individual') {
      // Validate individual users
      const seenEmails = new Set();
      const payload = [];

      for (let i = 0; i < usersList.length; i++) {
        const u = usersList[i];
        const numLabel = usersList.length > 1 ? ` (Person #${i + 1})` : '';

        if (!u.firstName.trim()) {
          setError(`First Name is required${numLabel}.`);
          return;
        }
        // Middle Name is optional
        if (!u.lastName.trim()) {
          setError(`Last Name is required${numLabel}.`);
          return;
        }
        if (!u.email.trim()) {
          setError(`Email is required${numLabel}.`);
          return;
        }

        const normEmail = u.email.trim().toLowerCase();
        if (!normEmail.endsWith(`@${INSTITUTIONAL_EMAIL_DOMAIN}`)) {
          setError(`Use school email ending in @${INSTITUTIONAL_EMAIL_DOMAIN}${numLabel}.`);
          return;
        }

        if (seenEmails.has(normEmail)) {
          setError(`Duplicate email "${normEmail}" in entry list${numLabel}. Please use unique emails.`);
          return;
        }
        seenEmails.add(normEmail);

        const showCollege = requiresCollege(u.role, roleDefinitions);
        if (showCollege && !u.college) {
          setError(`College selection is required for ${u.role.toUpperCase()} role${numLabel}.`);
          return;
        }

        const fn = toTitleCase(u.firstName);
        const mn = u.middleName?.trim() ? toTitleCase(u.middleName) : '';
        const ln = toTitleCase(u.lastName);
        const fullName = [fn, mn, ln].filter(Boolean).join(' ');

        payload.push({
          ...u,
          firstName: fn,
          middleName: mn,
          lastName: ln,
          email: normEmail,
          name: fullName,
          status: 'Active',
          college: showCollege ? formatCollegeName(u.college) : '',
          department: showCollege ? formatCollegeName(u.college) : '',
          permissions: u.useCustomAccess ? u.permissions : [],
          navKeys: u.useCustomAccess ? u.navKeys : [],
        });
      }

      try {
        await onSave(payload);
        onClose();
      } catch (err) {
        setError(err.message || 'Failed to add user(s).');
      }
    } else {
      // Validate Bulk rows
      if (bulkRows.length === 0) {
        setError('Please upload a spreadsheet or add user rows to proceed.');
        return;
      }

      const invalidRows = bulkRows.filter((r) => !r.isValid);
      if (invalidRows.length > 0) {
        setError(`Please fix the ${invalidRows.length} error row(s) before saving.`);
        return;
      }

      const payload = bulkRows.map((u) => {
        const showCollege = requiresCollege(u.role, roleDefinitions);
        const fn = toTitleCase(u.firstName);
        const mn = u.middleName?.trim() ? toTitleCase(u.middleName) : '';
        const ln = toTitleCase(u.lastName);
        const fullName = [fn, mn, ln].filter(Boolean).join(' ');
        const def = getRoleDefinition(u.role, roleDefinitions);

        return {
          firstName: fn,
          middleName: mn,
          lastName: ln,
          name: fullName,
          email: u.email.trim().toLowerCase(),
          role: u.role,
          status: 'Active',
          college: showCollege ? formatCollegeName(u.college) : '',
          department: showCollege ? formatCollegeName(u.college) : '',
          useCustomAccess: false,
          permissions: def.permissions || [],
          navKeys: def.navKeys || [],
        };
      });

      try {
        await onSave(payload);
        onClose();
      } catch (err) {
        setError(err.message || 'Failed to add bulk users.');
      }
    }
  };

  const handleRoleCreated = async (rolePayload) => {
    if (onSaveRole) {
      const newRoleKey = await onSaveRole(rolePayload);
      if (newRoleKey && activeRoleModalUserIndex !== null) {
        updateUserField(activeRoleModalUserIndex, 'role', newRoleKey);
      }
    }
    setShowAddRoleModal(false);
    setActiveRoleModalUserIndex(null);
  };

  const handleCollegeCreated = (newCollegeCode) => {
    if (newCollegeCode && activeCollegeModalUserIndex !== null) {
      updateUserField(activeCollegeModalUserIndex, 'college', newCollegeCode);
    }
    setShowAddCollegeModal(false);
    setActiveCollegeModalUserIndex(null);
  };

  const validBulkCount = bulkRows.filter((r) => r.isValid).length;
  const invalidBulkCount = bulkRows.length - validBulkCount;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className={`bg-white rounded-2xl w-full ${
            activeTab === 'bulk' && bulkRows.length > 0 ? 'max-w-5xl' : 'max-w-3xl'
          } max-h-[92vh] flex flex-col shadow-2xl relative transition-all duration-300 overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>

          <form onSubmit={submit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Fixed Modal Header */}
            <div className="p-7 pb-4 shrink-0 border-b border-gray-100 pr-12">
              {/* Header Title */}
              <div className="mb-4">
                <h2 className="font-black text-xl text-dark mb-1">Add User Accounts</h2>
                <p className="text-xs font-medium text-gray-500">
                  Create user accounts individually or import in bulk using an Excel/CSV spreadsheet.
                </p>
              </div>

              {/* Navigation Tabs (Individual / Bulk) */}
              <div className="flex bg-gray-50/70 p-1.5 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('individual');
                    setError('');
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'individual'
                      ? 'bg-white text-[#7A0808] shadow-sm border border-gray-200/80'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                  }`}
                >
                  <User size={16} />
                  Individual User
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('bulk');
                    setError('');
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'bulk'
                      ? 'bg-white text-[#7A0808] shadow-sm border border-gray-200/80'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                  }`}
                >
                  <FileSpreadsheet size={16} />
                  Bulk Add (Sheet Upload)
                </button>
              </div>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto p-7 py-5 space-y-5">
              {/* Global Password Info Banner */}
              <div className="bg-amber-50/80 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs flex items-start gap-2.5 shadow-sm">
                <span className="font-bold flex-shrink-0 text-sm">🔑</span>
                <span>
                  <strong>Temporary Password & Welcome Email:</strong> Automatically generated temporary passwords will be sent to each user’s institutional email address upon account creation.
                </span>
              </div>

              {/* Error Message */}
              {error && (
                <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 shadow-sm">
                  <AlertCircle size={16} className="flex-shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* INDIVIDUAL VIEW */}
              {activeTab === 'individual' && (
                <div className="space-y-6">
                {usersList.map((form, index) => {
                  const showCollegeField = requiresCollege(form.role, roleDefinitions);

                  return (
                    <div
                      key={form.id || index}
                      className="bg-gray-50/70 border border-gray-200 rounded-2xl p-5 relative transition-all shadow-sm"
                    >
                      {usersList.length > 1 && (
                        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
                          <span className="text-xs font-black text-[#7A0808] uppercase tracking-wider flex items-center gap-1.5">
                            <UserPlus size={14} /> Person #{index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePerson(index)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                            title="Remove person"
                          >
                            <Trash2 size={15} />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}

                      <div className="space-y-4">
                        {/* Name fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="form-label">
                              First Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              className="form-input"
                              value={form.firstName}
                              onChange={(e) => updateUserField(index, 'firstName', e.target.value)}
                              placeholder="e.g. Juan"
                              required
                            />
                          </div>
                          <div>
                            <label className="form-label">
                              Middle Name <span className="text-gray-400 font-normal text-xs">(Optional)</span>
                            </label>
                            <input
                              className="form-input"
                              value={form.middleName}
                              onChange={(e) => updateUserField(index, 'middleName', e.target.value)}
                              placeholder="e.g. Dela"
                            />
                          </div>
                          <div>
                            <label className="form-label">
                              Last Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              className="form-input"
                              value={form.lastName}
                              onChange={(e) => updateUserField(index, 'lastName', e.target.value)}
                              placeholder="e.g. Cruz"
                              required
                            />
                          </div>
                        </div>

                        {/* Email */}
                        <div>
                          <label className="form-label">
                            Email <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="email"
                            className="form-input"
                            placeholder={`name@${INSTITUTIONAL_EMAIL_DOMAIN}`}
                            value={form.email}
                            onChange={(e) => updateUserField(index, 'email', e.target.value)}
                            required
                          />
                        </div>

                        {/* Role & College */}
                        <div className={`grid grid-cols-1 ${showCollegeField ? 'sm:grid-cols-2' : ''} gap-3`}>
                          <div>
                            <label className="form-label">
                              User Role <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <CustomSelect
                                  value={form.role}
                                  onChange={(e) => updateUserField(index, 'role', e.target.value)}
                                  options={roles}
                                  placeholder="Select Role"
                                  required
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveRoleModalUserIndex(index);
                                  setShowAddRoleModal(true);
                                }}
                                className="h-[38px] w-[38px] rounded-lg border border-gray-200 bg-white hover:bg-red-50 text-[#7A0808] hover:border-red-200 flex items-center justify-center transition-colors shadow-sm flex-shrink-0"
                                title="Add New Role"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>

                          {showCollegeField && (
                            <div>
                              <label className="form-label">
                                College <span className="text-red-500">*</span>
                              </label>
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <CustomSelect
                                    value={form.college}
                                    onChange={(e) => updateUserField(index, 'college', e.target.value)}
                                    options={colleges.map((c) => ({
                                      value: c.code,
                                      label: `${c.name} (${c.code})`,
                                    }))}
                                    placeholder="Select College"
                                    required
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCollegeModalUserIndex(index);
                                    setShowAddCollegeModal(true);
                                  }}
                                  className="h-[38px] w-[38px] rounded-lg border border-gray-200 bg-white hover:bg-red-50 text-[#7A0808] hover:border-red-200 flex items-center justify-center transition-colors shadow-sm flex-shrink-0"
                                  title="Add New College"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Custom access permissions */}
                        <div className="space-y-2 pt-2">
                          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-gray-700">
                            <input
                              type="checkbox"
                              checked={form.useCustomAccess}
                              onChange={(e) => updateUserField(index, 'useCustomAccess', e.target.checked)}
                            />
                            Customize access for this person (override role defaults)
                          </label>

                          <div>
                            <PermissionCheckboxGrid
                              permissions={form.permissions}
                              navKeys={form.navKeys}
                              roleLabel={roles.find((r) => r.value === form.role)?.label || form.role}
                              onChange={({ permissions, navKeys }) => {
                                setUsersList((prev) => {
                                  const updated = [...prev];
                                  updated[index] = { ...updated[index], permissions, navKeys };
                                  return updated;
                                });
                              }}
                              disabled={!form.useCustomAccess}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add Another Person Button */}
                <button
                  type="button"
                  onClick={handleAddPerson}
                  className="w-full py-3 border-2 border-dashed border-[#7A0808] text-[#7A0808] hover:bg-red-50/50 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Plus size={16} /> Add Another Person
                </button>
              </div>
            )}

            {/* BULK VIEW */}
            {activeTab === 'bulk' && (
              <div className="space-y-6">
                {/* Step 1 & 2: Template Download & File Upload Area */}
                {bulkRows.length === 0 && !isProcessing && (
                  <div className="space-y-5">
                    {/* Template Card */}
                    <div className="bg-gradient-to-r from-red-50/70 via-amber-50/50 to-white border border-red-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                      <div>
                        <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                          <FileSpreadsheet className="text-[#7A0808]" size={18} />
                          Download Excel Template
                        </h4>
                        <p className="text-xs text-gray-600 mt-1 max-w-lg">
                          Generates a spreadsheet with required headers, dynamic dropdowns for <strong>Roles</strong> and <strong>Colleges</strong>, and a reference guide.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        disabled={isDownloadingTemplate || loadingColleges || roles.length === 0 || colleges.length === 0}
                        className="btn-maroon text-xs py-2.5 px-4 font-bold flex items-center gap-2 flex-shrink-0 shadow-sm disabled:cursor-wait disabled:opacity-60"
                      >
                        {(isDownloadingTemplate || loadingColleges) ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        {loadingColleges ? 'Loading Options...' : isDownloadingTemplate ? 'Preparing Template...' : 'Download Template (.xlsx)'}
                      </button>
                    </div>

                    {/* Drag & Drop File Zone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                        isDragging
                          ? 'border-[#7A0808] bg-red-50/60 scale-[1.005]'
                          : 'border-gray-300 hover:border-red-300 bg-gray-50/50 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="bulk-file-upload"
                      />
                      <label htmlFor="bulk-file-upload" className="cursor-pointer flex flex-col items-center">
                        <div className="w-14 h-14 bg-red-100/60 rounded-2xl flex items-center justify-center text-[#7A0808] mb-3">
                          <Upload size={26} />
                        </div>
                        <span className="font-bold text-sm text-gray-800 mb-1">
                          Click to upload or drag & drop spreadsheet
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv) files
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Processing Loader */}
                {isProcessing && (
                  <div className="bg-gray-50/90 border border-gray-200 rounded-2xl p-10 text-center flex flex-col items-center justify-center space-y-3 my-4">
                    <Loader2 size={36} className="animate-spin text-[#7A0808]" />
                    <h4 className="font-bold text-sm text-gray-800">{processingMsg || 'Processing file...'}</h4>
                    <p className="text-xs text-gray-500">Please wait while the system parses and validates your spreadsheet entries.</p>
                  </div>
                )}

                {/* Step 3: Interactive Sheet Preview Grid */}
                {bulkRows.length > 0 && !isProcessing && (
                  <div className="space-y-4">
                    {/* Header Controls & Summary */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-700 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                          📄 {uploadedFileName || 'Spreadsheet'} ({bulkRows.length} rows)
                        </span>
                        {invalidBulkCount === 0 ? (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                            <CheckCircle2 size={14} /> Ready to Save ({validBulkCount})
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                            <AlertCircle size={14} /> {invalidBulkCount} Row(s) with Errors
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAddBulkRow}
                          className="btn-outline-maroon text-xs py-1.5 px-3 flex items-center gap-1"
                        >
                          <Plus size={14} /> Add Row
                        </button>
                        <button
                          type="button"
                          onClick={handleClearBulk}
                          className="text-xs text-gray-500 hover:text-red-700 px-3 py-1.5 font-bold hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <RefreshCw size={13} /> Re-upload / Clear
                        </button>
                      </div>
                    </div>

                    {/* Sheet Grid Table */}
                    <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-[50vh] shadow-inner">
                      <table className="w-full text-xs text-left border-collapse bg-white">
                        <thead className="bg-gray-100/90 text-gray-700 uppercase tracking-wider font-extrabold sticky top-0 z-10 border-b border-gray-200">
                          <tr>
                            <th className="p-2.5 text-center w-10">#</th>
                            <th className="p-2.5 min-w-[120px]">First Name *</th>
                            <th className="p-2.5 min-w-[120px]">Middle Name</th>
                            <th className="p-2.5 min-w-[120px]">Last Name *</th>
                            <th className="p-2.5 min-w-[200px]">Email *</th>
                            <th className="p-2.5 min-w-[150px]">Role *</th>
                            <th className="p-2.5 min-w-[130px]">College</th>
                            <th className="p-2.5 min-w-[180px]">Status</th>
                            <th className="p-2.5 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {bulkRows.map((row, idx) => {
                            const showCollege = requiresCollege(row.role, roleDefinitions);

                            return (
                              <tr
                                key={row.id || idx}
                                className={`transition-colors ${
                                  row.isValid ? 'hover:bg-gray-50/80' : 'bg-red-50/40 hover:bg-red-50/70'
                                }`}
                              >
                                <td className="p-2 text-center font-bold text-gray-400">{idx + 1}</td>

                                {/* First Name */}
                                <td className="p-1.5">
                                  <input
                                    className={`w-full px-2 py-1.5 border rounded-md text-xs font-medium focus:ring-1 ${
                                      !row.firstName ? 'border-red-300 bg-red-50/50' : 'border-gray-300 bg-white'
                                    }`}
                                    value={row.firstName}
                                    onChange={(e) => updateBulkRowField(idx, 'firstName', e.target.value)}
                                    placeholder="First Name"
                                  />
                                </td>

                                {/* Middle Name */}
                                <td className="p-1.5">
                                  <input
                                    className="w-full px-2 py-1.5 border border-gray-300 bg-white rounded-md text-xs font-medium focus:ring-1"
                                    value={row.middleName}
                                    onChange={(e) => updateBulkRowField(idx, 'middleName', e.target.value)}
                                    placeholder="Middle Name (Opt)"
                                  />
                                </td>

                                {/* Last Name */}
                                <td className="p-1.5">
                                  <input
                                    className={`w-full px-2 py-1.5 border rounded-md text-xs font-medium focus:ring-1 ${
                                      !row.lastName ? 'border-red-300 bg-red-50/50' : 'border-gray-300 bg-white'
                                    }`}
                                    value={row.lastName}
                                    onChange={(e) => updateBulkRowField(idx, 'lastName', e.target.value)}
                                    placeholder="Last Name"
                                  />
                                </td>

                                {/* Email */}
                                <td className="p-1.5">
                                  <input
                                    type="email"
                                    className={`w-full px-2 py-1.5 border rounded-md text-xs font-medium focus:ring-1 ${
                                      !row.email || !row.email.endsWith(`@${INSTITUTIONAL_EMAIL_DOMAIN}`)
                                        ? 'border-red-300 bg-red-50/50'
                                        : 'border-gray-300 bg-white'
                                    }`}
                                    value={row.email}
                                    onChange={(e) => updateBulkRowField(idx, 'email', e.target.value)}
                                    placeholder={`user@${INSTITUTIONAL_EMAIL_DOMAIN}`}
                                  />
                                </td>

                                {/* Role Selector */}
                                <td className="p-1.5 min-w-[130px]">
                                  <CustomSelect
                                    size="sm"
                                    value={row.role}
                                    onChange={(e) => updateBulkRowField(idx, 'role', e.target.value)}
                                    options={roles}
                                    placeholder="Select Role"
                                  />
                                </td>

                                {/* College Selector */}
                                <td className="p-1.5 min-w-[130px]">
                                  {showCollege ? (
                                    <CustomSelect
                                      size="sm"
                                      value={row.college}
                                      onChange={(e) => updateBulkRowField(idx, 'college', e.target.value)}
                                      options={colleges.map((c) => ({
                                        value: c.code,
                                        label: c.code,
                                      }))}
                                      placeholder="Select College"
                                    />
                                  ) : (
                                    <span className="text-gray-400 italic text-[11px] px-2">N/A</span>
                                  )}
                                </td>

                                {/* Errors & Status */}
                                <td className="p-2">
                                  {row.isValid ? (
                                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700 text-[11px] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                      <CheckCircle2 size={12} /> Valid
                                    </span>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {row.errors.map((err, eIdx) => (
                                        <span
                                          key={eIdx}
                                          className="block text-[10px] font-bold text-red-700 bg-red-100/70 border border-red-200 px-1.5 py-0.5 rounded"
                                        >
                                          ⚠️ {err}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>

                                {/* Action */}
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBulkRow(idx)}
                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Delete row"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Bottom Action Footer (Fixed & Non-scrollable) */}
          <div className="p-4 px-7 bg-white border-t border-gray-200 flex gap-3 shrink-0 rounded-b-2xl shadow-xs">
            <button
              type="button"
              className="btn-outline-maroon flex-1 justify-center py-2.5 font-bold cursor-pointer"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-maroon flex-1 justify-center py-2.5 font-bold shadow-md cursor-pointer disabled:opacity-50"
              disabled={activeTab === 'bulk' && (bulkRows.length === 0 || isProcessing)}
            >
              {activeTab === 'individual'
                ? usersList.length > 1
                  ? `Save ${usersList.length} Users`
                  : 'Save User'
                : `Save ${bulkRows.length} Bulk Users`}
            </button>
          </div>
        </form>
      </div>
    </div>

      {/* Nested Add Role Modal */}
      {showAddRoleModal && (
        <AddRoleModal
          onClose={() => {
            setShowAddRoleModal(false);
            setActiveRoleModalUserIndex(null);
          }}
          onSave={handleRoleCreated}
          existingRoles={roleDefinitionsList}
        />
      )}

      {/* Nested Add College Modal */}
      {showAddCollegeModal && (
        <AddCollegeModal
          onClose={() => {
            setShowAddCollegeModal(false);
            setActiveCollegeModalUserIndex(null);
          }}
          onSaveSuccess={handleCollegeCreated}
          colleges={colleges}
        />
      )}
    </>
  );
}
