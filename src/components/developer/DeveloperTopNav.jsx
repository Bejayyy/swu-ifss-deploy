import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../../constants/layout';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../firebase/authHelpers';

export default function DeveloperTopNav({ title, subtitle, isDesktop = true, onToggleNav = () => {} }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  const initials = profile?.initials || getInitials(profile?.displayName, profile?.email);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header
      className="fixed top-0 right-0 z-40 flex items-center justify-between px-3 sm:px-4 lg:px-6"
      style={{
        left: isDesktop ? NAV_WIDTH_PX : 0,
        height: TOP_NAV_HEIGHT_PX,
        background: '#800000',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <div className="min-w-0 flex items-center gap-2 sm:gap-3">
        {!isDesktop && (
          <button
            type="button"
            onClick={onToggleNav}
            className="p-2 hover:bg-white/10 rounded-lg flex-shrink-0"
            aria-label="Open sidebar"
          >
            <Menu size={20} className="text-white" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-white font-bold text-lg sm:text-xl leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-blule-100 text-xs font-normal mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowProfile((v) => !v)}
          className="flex items-center gap-2 hover:bg-white/10 px-2 py-1.5 rounded-lg transition-colors"
        >
          <div
            className="w-9 h-9 flex items-center justify-center font-black text-sm text-[#2B3235]"
            style={{ background: '#FFC107', borderRadius: 10 }}
          >
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-white text-xs font-bold leading-tight">{profile?.displayName || 'Super Admin'}</p>
            <p className="text-red-100 text-[10px] font-medium">Super Admin</p>
          </div>
          <ChevronDown size={14} className="text-red-100 hidden sm:block" />
        </button>

        {showProfile && (
          <div
            className="absolute right-0 top-14 w-52 bg-white shadow-xl border border-gray-100 z-50 overflow-hidden rounded-xl"
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <User size={14} style={{ color: '#800000' }} />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: '#2B3235' }}>{profile?.displayName}</p>
                <p className="text-[10px] truncate" style={{ color: '#2B3235', opacity: 0.55 }}>{profile?.email}</p>
              </div>
            </div>
            <button
              type="button"
              className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-gray-50 flex items-center gap-2 text-red-700"
              onClick={handleLogout}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
