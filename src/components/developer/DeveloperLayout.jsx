import React, { useEffect, useState } from 'react';
import DeveloperLeftNav from './DeveloperLeftNav';
import DeveloperTopNav from './DeveloperTopNav';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../../constants/layout';

export default function DeveloperLayout({ children, title, subtitle }) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleMediaChange = (event) => {
      setIsDesktop(event.matches);
      if (event.matches) setIsNavOpen(false);
    };
    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f4f5f7' }}>
      <DeveloperLeftNav
        isDesktop={isDesktop}
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
      />
      <DeveloperTopNav
        title={title}
        subtitle={subtitle}
        isDesktop={isDesktop}
        onToggleNav={() => setIsNavOpen((prev) => !prev)}
      />
      <main
        className="overflow-x-hidden"
        style={{
          marginLeft: isDesktop ? NAV_WIDTH_PX : 0,
          paddingTop: TOP_NAV_HEIGHT_PX,
          minHeight: '100vh',
        }}
      >
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
