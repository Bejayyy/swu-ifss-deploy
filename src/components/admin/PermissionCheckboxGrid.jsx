import React from 'react';
import { NAV_PERMISSIONS_CATALOG, applyNavToggle, togglePermission } from '../../constants/accessCatalog';
import { Lock, Shield, CheckCircle2, XCircle } from 'lucide-react';

export default function PermissionCheckboxGrid({
  permissions = [],
  navKeys = [],
  onChange,
  disabled = false,
  roleLabel = '',
  showNavigation = true,
  showPermissions = true,
}) {
  const emit = (nextPermissions, nextNavKeys) => {
    onChange?.({ permissions: nextPermissions, navKeys: nextNavKeys });
  };

  const handleNavToggle = (navKey, checked) => {
    const next = applyNavToggle(navKeys, permissions, navKey, checked);
    emit(next.permissions, next.navKeys);
  };

  const handlePermissionToggle = (permission, checked) => {
    emit(togglePermission(permissions, permission, checked), navKeys);
  };

  const enabledPageCount = navKeys.length;
  const enabledPermCount = permissions.length;

  return (
    <div className="space-y-3">
      {/* Role Access Summary Header Banner */}
      <div className={`p-3.5 rounded-xl border transition-colors ${
        disabled
          ? 'bg-gradient-to-r from-red-50/60 via-amber-50/30 to-white border-red-200/80 shadow-2xs'
          : 'bg-gradient-to-r from-blue-50/60 via-indigo-50/30 to-white border-blue-200/80 shadow-2xs'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              disabled ? 'bg-[#7A0808] text-white' : 'bg-blue-600 text-white'
            }`}>
              <Shield size={15} />
            </div>
            <div>
              <span className="text-xs font-black text-gray-900 block leading-tight">
                {disabled
                  ? `Standard Access for ${roleLabel || 'Selected Role'}`
                  : `Customized Access (Role: ${roleLabel || 'Custom'})`}
              </span>
              <span className="text-[10px] font-semibold text-gray-500">
                {disabled
                  ? 'Active permissions & pages assigned automatically based on role'
                  : 'Custom overrides enabled for this account'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 size={11} /> {enabledPageCount} Pages
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
              <CheckCircle2 size={11} /> {enabledPermCount} Permissions
            </span>
          </div>
        </div>
      </div>

      {/* Pages and Action Permissions Matrix */}
      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
        {NAV_PERMISSIONS_CATALOG.map((navItem) => {
          const isNavChecked = navKeys.includes(navItem.navKey);
          const hasActions = Array.isArray(navItem.actions) && navItem.actions.length > 0;

          return (
            <div
              key={navItem.navKey}
              className={`border rounded-xl transition-all overflow-hidden ${
                isNavChecked
                  ? 'border-red-200/80 bg-white shadow-2xs'
                  : 'border-gray-200/80 bg-gray-50/50 opacity-70'
              }`}
            >
              {/* Header: Navigation Item Checkbox / Status */}
              <div className="p-3 flex items-start gap-3">
                {showNavigation && !disabled ? (
                  <input
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-[#7A0808] rounded cursor-pointer flex-shrink-0"
                    checked={isNavChecked}
                    onChange={(e) => handleNavToggle(navItem.navKey, e.target.checked)}
                  />
                ) : (
                  <div className="mt-0.5 flex-shrink-0">
                    {isNavChecked ? (
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    ) : (
                      <XCircle size={16} className="text-gray-300" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-black text-xs ${isNavChecked ? 'text-[#2B3235]' : 'text-gray-500'}`}>
                      {navItem.label}
                    </span>
                    {isNavChecked ? (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Page Accessible
                      </span>
                    ) : (
                      <span className="text-[9px] font-semibold text-gray-400">Not Included</span>
                    )}
                  </div>
                  {navItem.description && (
                    <p className="text-[11px] font-medium text-gray-500 mt-0.5">{navItem.description}</p>
                  )}
                </div>
              </div>

              {/* Nested Actions Panel */}
              {showPermissions && hasActions && (
                <div className="px-3 pb-3 pt-0">
                  {isNavChecked ? (
                    <div className="bg-gray-50/90 border border-gray-100 rounded-lg p-2.5 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-[#7A0808]">
                        Action Permissions for {navItem.label}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {navItem.actions.map((act) => {
                          const isActChecked = permissions.includes(act.permission);
                          return (
                            <label
                              key={`act-${act.permission}`}
                              className={`flex items-start gap-2 p-2 rounded-md transition-colors ${
                                disabled
                                  ? isActChecked ? 'bg-white border border-emerald-100 shadow-2xs' : 'bg-transparent opacity-60'
                                  : isActChecked ? 'bg-white border border-gray-200 shadow-2xs cursor-pointer' : 'bg-transparent cursor-pointer hover:bg-white'
                              }`}
                            >
                              {!disabled ? (
                                <input
                                  type="checkbox"
                                  className="mt-0.5 accent-[#7A0808] flex-shrink-0"
                                  checked={isActChecked}
                                  onChange={(e) => handlePermissionToggle(act.permission, e.target.checked)}
                                />
                              ) : (
                                <div className="mt-0.5 flex-shrink-0">
                                  {isActChecked ? (
                                    <CheckCircle2 size={13} className="text-emerald-600" />
                                  ) : (
                                    <XCircle size={13} className="text-gray-300" />
                                  )}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className={`font-bold text-xs block ${isActChecked ? 'text-[#2B3235]' : 'text-gray-400'}`}>
                                  {act.label}
                                </span>
                                {act.description && (
                                  <span className="text-[10px] text-gray-500 leading-tight block mt-0.5">
                                    {act.description}
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200/60 rounded-lg flex items-center gap-1.5">
                      <Lock size={11} className="text-gray-400 flex-shrink-0" />
                      <span className="text-[10px] font-medium text-gray-400">
                        {disabled
                          ? `Not accessible by ${roleLabel || 'this role'}`
                          : `Enable "${navItem.label}" page to configure actions`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
