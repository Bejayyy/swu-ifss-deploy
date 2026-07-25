import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Shield, Code2 } from 'lucide-react';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../../constants/layout';
import { DEVELOPER_ROUTE_PREFIX } from '../../firebase/constants';
import systemLogo from '../../assets/logo.png';

const navItems = [
  { label: 'Registrar Accounts', icon: Users, path: DEVELOPER_ROUTE_PREFIX },
];

export default function DeveloperLeftNav({ isDesktop = true, isOpen = false, onClose = () => {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

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

      <aside
        className={`fixed left-0 top-0 bottom-0 flex flex-col bg-white overflow-hidden transition-transform duration-300 ease-out ${
          isDesktop ? 'z-50 translate-x-0' : `z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
        }`}
        style={{ width: NAV_WIDTH_PX, borderRight: '1px solid #f0f0f0' }}
      >
        <header
          className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0"
          style={{ minHeight: TOP_NAV_HEIGHT_PX, borderBottom: '1px solid #f0f0f0' }}
        >
          <img src={systemLogo} alt="SWU-IFSS logo" className="h-14 w-auto object-contain flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-xl leading-tight truncate" style={{ color: '#800000' }}>SWU-IFSS</p>
            <p className="text-[11px] font-medium leading-tight truncate" style={{ color: '#2B3235', opacity: 0.75 }}>
              Developer Portal
            </p>
          </div>
        </header>

        <section className="px-3 py-4 flex-shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
            style={{ background: '#FFF0F0' }}
          >
            <Code2 size={16} className="text-[#800000] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold leading-tight" style={{ color: '#800000' }}>Account management only</p>
              <p className="text-[10px] leading-tight mt-0.5" style={{ color: '#2B3235', opacity: 0.75 }}>
                No scheduling or registrar system features
              </p>
            </div>
          </div>
        </section>

        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2">
          {navItems.map(({ label, icon: Icon, path }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                type="button"
                onClick={() => {
                  navigate(path);
                  if (!isDesktop) onClose();
                }}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-lg transition-colors"
                style={{
                  background: active ? '#FFF0F0' : 'transparent',
                  color: active ? '#800000' : '#2B3235',
                }}
              >
                <Icon size={17} style={{ color: active ? '#800000' : undefined }} />
                <span className="text-[13px] font-semibold">{label}</span>
                {active && <Shield size={12} className="ml-auto text-[#800000]" />}
              </button>
            );
          })}
        </nav>

        <footer className="px-4 py-4 border-t flex-shrink-0" style={{ borderColor: '#f0f0f0' }}>
          <p className="text-[10px] leading-relaxed" style={{ color: '#2B3235', opacity: 0.55 }}>
            Manage Registrar accounts, permissions, and access. Institutional email: @phinmaed.com
          </p>
        </footer>
      </aside>
    </>
  );
}
