import React, { useEffect, useState } from 'react';
import LeftNav from './LeftNav';
import TopNav from './TopNav';
import AddBuildingModal from './modals/AddBuildingModal';
import CobraChatbot from './CobraChatbot';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../constants/layout';

export default function Layout({ children, title, subtitle, compactNavOnDesktop = false }) {
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isNavHovered, setIsNavHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleMediaChange = (event) => {
      setIsDesktop(event.matches);
      if (event.matches) {
        setIsNavOpen(false);
      }
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  const desktopNavWidth = compactNavOnDesktop && !isNavHovered ? 72 : NAV_WIDTH_PX;
  const desktopContentOffset = compactNavOnDesktop ? 72 : NAV_WIDTH_PX;

  return (
    <div className="min-h-screen" style={{ background: '#f4f5f7' }}>
      <LeftNav
        onAddBuilding={() => setShowAddBuilding(true)}
        isDesktop={isDesktop}
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
        desktopWidth={desktopNavWidth}
        onDesktopMouseEnter={() => compactNavOnDesktop && setIsNavHovered(true)}
        onDesktopMouseLeave={() => compactNavOnDesktop && setIsNavHovered(false)}
      />
      <TopNav
        title={title}
        subtitle={subtitle}
        isDesktop={isDesktop}
        desktopLeftOffset={desktopContentOffset}
        onToggleNav={() => setIsNavOpen((prev) => !prev)}
      />
      <main
        className="overflow-x-hidden"
        style={{ marginLeft: isDesktop ? desktopContentOffset : 0, paddingTop: TOP_NAV_HEIGHT_PX, minHeight: '100vh' }}
      >
        <div className="p-4 sm:p-6 print:p-0 print:m-0">{children}</div>
      </main>
      <CobraChatbot />
      {showAddBuilding && <AddBuildingModal onClose={() => setShowAddBuilding(false)} />}
    </div>
  );
}
