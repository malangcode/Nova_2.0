/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { 
  Mic, MicOff, Camera, CameraOff, Send, History, 
  MessageSquare, Settings, User, LogOut, Menu, X,
  Activity, Sparkles, Brain
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import AssistantPage from "./pages/AssistantPage";
import LandingPage from "./pages/LandingPage";
import MemoryPage from "./pages/MemoryPage";
import VisualMemoryPage from "./pages/VisualMemoryPage";

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (v: boolean) => void }) {
  const location = useLocation();
  
  const navItems = [
    { icon: Sparkles, label: "Assistant", path: "/assistant" },
    { icon: Brain, label: "Neural Core", path: "/memory" },
    { icon: Camera, label: "Visual Memory", path: "/visual-memory" },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ 
          width: isOpen ? 280 : 0,
          x: isOpen ? 0 : -280
        }}
        className={cn(
          "fixed top-0 left-0 h-full bg-[#0D0D0D] border-r border-white/10 z-50 overflow-hidden flex flex-col",
          "lg:relative lg:translate-x-0 lg:w-72"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Activity className="text-black w-5 h-5" />
            </div>
            <span className="font-semibold text-white tracking-tight">VisionVoice</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                location.pathname === item.path 
                  ? "bg-white/10 text-white shadow-lg" 
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={20} className={cn(
                "transition-colors",
                location.pathname === item.path ? "text-emerald-400" : "group-hover:text-emerald-400"
              )} />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">User Account</p>
              <p className="text-xs text-white/40 truncate">Pro Plan</p>
            </div>
            <Settings size={16} className="text-white/40 hover:text-white cursor-pointer" />
          </div>
        </div>
      </motion.aside>
    </>
  );
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <Router>
      <div className="flex h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30">
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <header className="h-16 border-b border-white/5 flex items-center px-6 lg:px-8 justify-between bg-[#050505]/80 backdrop-blur-xl sticky top-0 z-30">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className={cn(
                "p-2 hover:bg-white/5 rounded-lg transition-colors",
                isSidebarOpen && "lg:hidden"
              )}
            >
              <Menu size={20} />
            </button>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-500">System Live</span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/visual-memory" element={<VisualMemoryPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}
