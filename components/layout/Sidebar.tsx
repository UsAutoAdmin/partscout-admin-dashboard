"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    name: "Dashboard",
    path: "/",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3.33 3.33h5.56v7.78H3.33V3.33zm7.78 0h5.56v4.45h-5.56V3.33zm0 6.67h5.56v7.78h-5.56V10zm-7.78 3.33h5.56v4.45H3.33v-4.45z" fill="currentColor"/></svg>
    ),
  },
  {
    name: "CRM Pipeline",
    path: "/users",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13.333 17.5v-1.667a3.333 3.333 0 00-3.333-3.333H5a3.333 3.333 0 00-3.333 3.333V17.5M7.5 9.167a3.333 3.333 0 100-6.667 3.333 3.333 0 000 6.667zM18.333 17.5v-1.667A3.333 3.333 0 0015 12.833M13.333 2.833a3.333 3.333 0 010 6.334" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    name: "Features",
    path: "/features",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 1.667h-3.333A1.667 1.667 0 002.5 3.333V6.667a1.667 1.667 0 001.667 1.666H7.5A1.667 1.667 0 009.167 6.667V3.333A1.667 1.667 0 007.5 1.667zM15.833 1.667H12.5a1.667 1.667 0 00-1.667 1.666V6.667A1.667 1.667 0 0012.5 8.333h3.333a1.667 1.667 0 001.667-1.666V3.333a1.667 1.667 0 00-1.667-1.666zM7.5 10h-3.333a1.667 1.667 0 00-1.667 1.667v3.333a1.667 1.667 0 001.667 1.667H7.5a1.667 1.667 0 001.667-1.667v-3.333A1.667 1.667 0 007.5 10zM15.833 10H12.5a1.667 1.667 0 00-1.667 1.667v3.333A1.667 1.667 0 0012.5 16.667h3.333a1.667 1.667 0 001.667-1.667v-3.333A1.667 1.667 0 0015.833 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    name: "Automation",
    path: "/automation",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.667 8.333l-5 5-3.334-3.333-5 5M16.667 8.333h-4.167M16.667 8.333v4.167" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    name: "Scrapes",
    path: "/scrapes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M1.667 10h2.5l2.5-5.833 3.333 11.666 2.5-5.833h5.833" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    name: "Scraper Monitor",
    path: "/scrapes/monitor",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6 18h8M10 15v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 9l2.5-2 2.5 3 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    name: "Infrastructure",
    path: "/infrastructure",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.667 5H3.333c-.92 0-1.666.746-1.666 1.667v1.666c0 .92.746 1.667 1.666 1.667h13.334c.92 0 1.666-.746 1.666-1.667V6.667c0-.92-.746-1.667-1.666-1.667zM16.667 11.667H3.333c-.92 0-1.666.746-1.666 1.666v1.667c0 .92.746 1.667 1.666 1.667h13.334c.92 0 1.666-.747 1.666-1.667v-1.667c0-.92-.746-1.666-1.666-1.666z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    name: "Inbox",
    path: "/inbox",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3.333 3.333h13.334c.916 0 1.666.75 1.666 1.667v10c0 .917-.75 1.667-1.666 1.667H3.333c-.916 0-1.666-.75-1.666-1.667V5c0-.917.75-1.667 1.666-1.667z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.333 5L10 11.667 1.667 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    name: "Video Generator",
    path: "/video-generator",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2.5 5.833A2.5 2.5 0 015 3.333h6.667a2.5 2.5 0 012.5 2.5v8.334a2.5 2.5 0 01-2.5 2.5H5a2.5 2.5 0 01-2.5-2.5V5.833z" fill="currentColor" />
        <path d="M15.833 7.5l2.084-1.39a.833.833 0 011.25.722v6.336a.833.833 0 01-1.25.722l-2.084-1.39V7.5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: "Scheduler",
    path: "/scheduler",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2.5" y="3.333" width="15" height="13.334" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2.5 7.5h15M6.667 1.667v3.333M13.333 1.667v3.333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="10" cy="11.667" r="1.25" fill="currentColor"/>
      </svg>
    ),
  },
  {
    name: "Video Research",
    path: "/video-research",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 1.667A8.333 8.333 0 1018.333 10 8.342 8.342 0 0010 1.667zm0 12.916a.625.625 0 110-1.25.625.625 0 010 1.25zm.625-3.75h-1.25V5.833h1.25v5z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    name: "Part Finder",
    path: "/part-finder",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M8.333 2.5a5.833 5.833 0 103.584 10.444l3.61 3.61a.833.833 0 001.179-1.178l-3.61-3.61A5.833 5.833 0 008.333 2.5zm0 1.667a4.167 4.167 0 110 8.333 4.167 4.167 0 010-8.333z" fill="currentColor"/>
        <path d="M8.333 6.667v3.333M6.667 8.333H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    name: "Part Review",
    path: "/part-review",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 1.667l2.167 4.666 5.166.583-3.833 3.5 1.083 5.084L10 13.167 5.417 15.5l1.083-5.084-3.833-3.5 5.166-.583L10 1.667z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    name: "Pipeline",
    path: "/pipeline",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M1.667 5h5v3.333h-5V5zm6.666 0h5v3.333h-5V5zm6.667 0h3.333v3.333H15V5zM1.667 11.667h3.333V15H1.667v-3.333zm5 0h5V15h-5v-3.333zm6.666 0h5V15h-5v-3.333z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4.167 8.333v3.334M10 8.333v3.334M15.833 8.333v3.334" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    name: "Email Automation",
    path: "/email-automation",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2.5 5.833A1.667 1.667 0 014.167 4.167h11.666a1.667 1.667 0 011.667 1.666v8.334a1.667 1.667 0 01-1.667 1.666H4.167A1.667 1.667 0 012.5 14.167V5.833z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2.5 6.667l7.5 5 7.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14.167 2.5l1 1.667M15.833 1.667l.833 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    name: "Virtual Assistant",
    path: "/virtual-assistant",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 1.667a6.667 6.667 0 00-6.667 6.666v2.5L1.667 13.5v.833h16.666V13.5l-1.666-2.667v-2.5A6.667 6.667 0 0010 1.667z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7.5 14.333a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const contentMachineItems = [
  {
    name: "Transcriber",
    path: "/transcriber",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 1.667v10M7.5 10l2.5 2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3.333 13.333A3.333 3.333 0 006.667 16.667h6.666a3.333 3.333 0 000-6.667H6.667a3.333 3.333 0 010-6.667h6.666" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    name: "Teleprompter",
    path: "/teleprompter",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2.5" y="3.333" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6.667 16.667h6.666M10 13.333v3.334" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M6 7h8M6 9.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    name: "Performance DB",
    path: "/performance",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M16.667 8.333l-5 5-3.334-3.333-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3.333 3.333v13.334h13.334" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const quickLinks = [
  { label: "Supabase", href: "https://supabase.com/dashboard" },
  { label: "Stripe", href: "https://dashboard.stripe.com" },
  { label: "Clerk", href: "https://dashboard.clerk.com" },
  { label: "Vercel", href: "https://vercel.com/dashboard" },
  { label: "Gmail", href: "https://mail.google.com" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 dark:bg-gray-900/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 flex h-screen w-[260px] flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] px-5 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 py-7">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500">
            <span className="text-sm font-bold text-white">PS</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white/90">Part Scout</h1>
            <p className="text-theme-xs text-gray-400 dark:text-gray-500">Admin Dashboard</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Menu
          </p>
          <ul className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const active = pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    onClick={onClose}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-brand-50 dark:bg-brand-500/[0.12] text-brand-600 dark:text-brand-400"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className={active ? "text-brand-500 dark:text-brand-400" : "text-gray-400 dark:text-gray-500"}>
                      {item.icon}
                    </span>
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mb-3 mt-8 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Content Machine
          </p>
          <ul className="flex flex-col gap-0.5">
            {contentMachineItems.map((item) => {
              const active = pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    onClick={onClose}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-brand-50 dark:bg-brand-500/[0.12] text-brand-600 dark:text-brand-400"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className={active ? "text-brand-500 dark:text-brand-400" : "text-gray-400 dark:text-gray-500"}>
                      {item.icon}
                    </span>
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mb-3 mt-8 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Quick Links
          </p>
          <ul className="flex flex-col gap-0.5">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-400 dark:text-gray-600">
                    <path d="M6 3.333h-.667A1.333 1.333 0 004 4.667v6.666A1.333 1.333 0 005.333 12.667h6.667a1.333 1.333 0 001.333-1.334V10m-3.333-6.667h4m0 0v4m0-4L8 9.333" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-gray-200 dark:border-gray-800 py-4">
          <p className="text-theme-xs text-gray-400 dark:text-gray-600 text-center">Part Scout v1.0</p>
        </div>
      </aside>
    </>
  );
}
