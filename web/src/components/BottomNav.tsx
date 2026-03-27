"use client";

import { useUI, ChannelFilter } from "@/store/useUI";
import { useChatStore } from "@/store/useChat";
import { useMemo } from "react";

export default function BottomNav() {
  const { channelFilter, setChannelFilter } = useUI();
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  const totalUnread = useMemo(() => {
    return Object.values(unreadCounts).reduce((a, b) => a + (b || 0), 0);
  }, [unreadCounts]);

  const navItems: { id: ChannelFilter; label: string; icon: React.ReactNode }[] = [
    {
      id: "chats",
      label: "Chats",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      ),
    },
    {
      id: "global",
      label: "Global",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      id: "menu",
      label: "Menu",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-t border-black/5 flex items-center justify-around pb-safe-area-inset-bottom h-[64px] transition-all">
      {navItems.map((item) => {
        const isActive = channelFilter === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              setChannelFilter(item.id);
              // Always go back to the list when clicking nav items on mobile
              setActiveChannel(null);
            }}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full relative transition-colors ${
              isActive ? "text-blue-500" : "text-gray-400"
            }`}
          >
            <div className="relative">
              {item.icon}
              {item.id === "chats" && totalUnread > 0 && (
                <div className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-white">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </div>
              )}
            </div>
            <span className="text-[10px] font-medium">{item.label}</span>
            {isActive && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-blue-500 rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
