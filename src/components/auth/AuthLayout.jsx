import React from 'react';
import systemLogo from '../../assets/logo.png';
import loginBg from '../../assets/login-bg.jpg';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="h-screen w-full flex bg-white overflow-hidden font-sans">
      {/* Left Column: Hero Branding Banner with High-Clarity School Architecture & Color Grading */}
      <div className="hidden lg:flex lg:w-1/2 h-full relative bg-[#7A0808] overflow-hidden flex-col justify-between p-12 lg:p-16 select-none shrink-0">
        {/* School Building Photo with Color Grading (Contrast, Saturation & Brightness Boost) */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none"
          style={{
            backgroundImage: `url(${loginBg})`,
            filter: 'brightness(1.05) contrast(1.12) saturate(1.15)',
          }}
        />

        {/* Professional Directional Maroon Gradient Overlay: Rich Maroon behind Text, Crystal-Clear Building Visibility */}
        <div className="absolute inset-0 z-0 bg-gradient-to-tr from-[#7A0808]/95 via-[#7A0808]/45 via-45% to-black/25" />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#7A0808]/80 via-transparent to-[#7A0808]/90 pointer-events-none" />

        {/* Top Left System Branding Header (SWU-IFSS with Crisp Text Drop Shadows) */}
        <div className="relative z-10 pt-4">
          <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight leading-none mb-3 drop-shadow-[0_3px_10px_rgba(0,0,0,0.6)]">
            SWU-IFSS
          </h1>
          <p className="text-sm lg:text-base font-semibold text-white/95 leading-snug drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            Integrated Facility<br />Scheduling System
          </p>
        </div>

        {/* Bottom Left University Details */}
        <div className="relative z-10 pt-8 border-t border-white/30">
          <div className="w-16 h-0.5 bg-white/90 mb-4 rounded-full shadow-sm" />
          <p className="text-xs font-black tracking-widest text-white uppercase mb-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
            SOUTHWESTERN UNIVERSITY PHINMA
          </p>
          <p className="text-xs text-white/90 max-w-md leading-relaxed font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
            Empowering academic excellence through seamless facility management and scheduling.
          </p>
        </div>
      </div>

      {/* Right Column: Clean Auth Form Canvas */}
      <div className="w-full lg:w-1/2 h-full flex items-center justify-center p-6 sm:p-12 bg-white overflow-y-auto">
        <div className="w-full max-w-[380px] py-6 sm:py-10">
          {/* Centered System Logo Above Page Title */}
          <div className="flex flex-col items-center justify-center mb-5">
            <img src={systemLogo} alt="SWU Logo" className="h-16 sm:h-20 w-auto object-contain mb-3" />
          </div>

          {/* Form Page Title & Subtitle */}
          <div className="mb-7 text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#7A0808] tracking-tight">{title}</h2>
            {subtitle && <p className="text-xs sm:text-sm text-gray-500 mt-1.5 font-medium">{subtitle}</p>}
          </div>

          {/* Form Content */}
          {children}

          {/* Optional Footer Link / Switch Action */}
          {footer && <div className="mt-6 text-center text-xs text-gray-500 font-medium">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
