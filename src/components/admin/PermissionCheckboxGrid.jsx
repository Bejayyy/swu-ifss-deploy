import React from 'react';
import { NAV_PERMISSIONS_CATALOG, applyNavToggle, togglePermission } from '../../constants/accessCatalog';
import { Lock } from 'lucide-react';

export default function PermissionCheckboxGrid({
  permissions = [],
  navKeys = [],
  onChange,
  disabled = false,
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

  return (
    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
      {NAV_PERMISSIONS_CATALOG.map((navItem) => {
        const isNavChecked = navKeys.includes(navItem.navKey);
        const hasActions = Array.isArray(navItem.actions) && navItem.actions.length > 0;

        return (
          <div
            key={navItem.navKey}
            className={`border rounded-xl transition-all overflow-hidden ${
              isNavChecked ? 'border-[#7A0808]/30 bg-white shadow-sm' : 'border-gray-200 bg-gray-50/40'
            }`}
          >
            {/* Header: Navigation Item Checkbox */}
            <div className="p-3.5 flex items-start gap-3">
              {showNavigation ? (
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-[#7A0808] rounded cursor-pointer flex-shrink-0"
                  checked={isNavChecked}
                  disabled={disabled}
                  onChange={(e) => handleNavToggle(navItem.navKey, e.target.checked)}
                />
              ) : null}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-xs text-[#2B3235]">{navItem.label}</span>
                  {isNavChecked ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-green-100 text-green-800">
                      Page Enabled
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-gray-400">Page Hidden</span>
                  )}
                </div>
                {navItem.description && (
                  <p className="text-[11px] font-medium text-gray-500 mt-0.5">{navItem.description}</p>
                )}
              </div>
            </div>

            {/* Nested Actions Panel (Shown directly below navigation item) */}
            {showPermissions && hasActions && (
              <div className="px-3.5 pb-3.5 pt-0">
                {isNavChecked ? (
                  <div className="bg-gray-50/80 border border-gray-100 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#7A0808]">
                      Page Actions & Permissions for {navItem.label}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {navItem.actions.map((act) => {
                        const isActChecked = permissions.includes(act.permission);
                        return (
                          <label
                            key={`act-${act.permission}`}
                            className={`flex items-start gap-2.5 p-2 rounded-md transition-colors ${
                              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-white'
                            } ${isActChecked ? 'bg-white border border-gray-200 shadow-2xs' : 'bg-transparent'}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-[#7A0808] flex-shrink-0"
                              checked={isActChecked}
                              disabled={disabled}
                              onChange={(e) => handlePermissionToggle(act.permission, e.target.checked)}
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-xs block text-[#2B3235]">{act.label}</span>
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
                  <div className="px-3 py-2 bg-amber-50/70 border border-amber-100 rounded-lg flex items-center gap-2">
                    <Lock size={12} className="text-amber-800 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-amber-900">
                      Check "{navItem.label}" page above to configure its action permissions
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
