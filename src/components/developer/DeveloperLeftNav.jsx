import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Shield } from 'lucide-react';
import { NAV_WIDTH_PX } from '../../constants/layout';
import { DEVELOPER_ROUTE_PREFIX } from '../../firebase/constants';
import systemLogo from '../../assets/logo.png';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';

const navItems = [
  { label: 'User Management', icon: Users, path: DEVELOPER_ROUTE_PREFIX },
];

export default function DeveloperLeftNav({ isDesktop = true, isOpen = false, onClose = () => {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <SidebarProvider defaultOpen={true}>
      {!isDesktop && isOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity md:hidden"
          onClick={onClose}
        />
      )}

      <Sidebar
        collapsible="none"
        className={`fixed left-0 top-0 bottom-0 flex flex-col bg-white border-r border-gray-100 overflow-hidden transition-transform duration-300 ease-out print:hidden ${
          isDesktop ? 'z-50 translate-x-0' : `z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
        }`}
        style={{ width: NAV_WIDTH_PX }}
      >
        <SidebarHeader className="border-b border-gray-100 p-3">
          <div className="flex items-center gap-2">
            {systemLogo && (
              <img src={systemLogo} alt="SWU-IFSS logo" className="h-12 w-auto object-contain flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight truncate text-[#800000]">SWU-IFSS</p>
              <p className="text-[11px] font-medium leading-tight truncate text-[#2B3235]/75">
                Developer Portal
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="p-2 scrollbar-thin">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map(({ label, icon: Icon, path }) => {
                  const active = isActive(path);
                  return (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton
                        isActive={active}
                        onClick={() => {
                          navigate(path);
                          if (!isDesktop) onClose();
                        }}
                        className={`group w-full justify-start gap-2.5 px-3 py-2.5 text-[13px] font-semibold rounded-lg transition-colors ${
                          active
                            ? 'bg-[#FFF0F0] text-[#800000]'
                            : 'text-[#2B3235] hover:bg-gray-100'
                        }`}
                      >
                        <Icon size={17} className={active ? 'text-[#800000]' : ''} />
                        <span className="flex-1 truncate">{label}</span>
                        {active && <Shield size={12} className="ml-auto text-[#800000]" />}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 border-t border-gray-100">
          <p className="text-[10px] leading-relaxed text-[#2B3235]/55">
            Manage Registrar accounts, permissions, and access. Institutional email: @phinmaed.com
          </p>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}

