"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface DashboardLayoutProps {
  children: React.ReactNode;
  lastUpdated?: string;
  title?: string;
}

export default function DashboardLayout({ children, lastUpdated, title }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:ml-[260px] transition-all duration-300 ease-in-out">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          lastUpdated={lastUpdated}
          title={title}
        />
        <main className="mx-auto max-w-[1536px] p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
