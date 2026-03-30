"use client";

import { useEffect, useRef, useState } from "react";
import { useUI, type Bubble } from "@/store/useUI";
import { useChatStore } from "@/store/useChat";

export default function FloatingBubbles() {
  const { bubbles, removeBubble } = useUI();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const setFilter = useUI((s) => s.setChannelFilter);
  const [isAnyDragging, setIsAnyDragging] = useState(false);

  if (!bubbles || bubbles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {/* Dismiss Zone */}
      <div 
        className={`pointer-events-none fixed bottom-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full border-2 border-dashed border-red-500/30 flex items-center justify-center transition-all duration-300 ${isAnyDragging ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-50 translate-y-20"}`}
      >
        <div className="bg-red-500/10 w-14 h-14 rounded-full flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </div>
      </div>

      {bubbles.map((b, i) => (
        <BubbleItem 
          key={b.channelId} 
          bubble={b} 
          index={i} 
          onDragState={setIsAnyDragging}
          onOpen={() => {
            setActiveChannel(b.channelId);
            setFilter("chats");
            removeBubble(b.channelId);
          }}
          onClose={() => removeBubble(b.channelId)}
        />
      ))}
    </div>
  );
}

function BubbleItem({ bubble, index, onDragState, onOpen, onClose }: { 
  bubble: Bubble; 
  index: number; 
  onDragState: (d: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ x: 20, y: 150 + index * 10 }); // Slight offset stacking
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 20, y: 150 + index * 10 });
  const startPos = useRef({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    onDragState(true);
    startPos.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - startPos.current.x;
    const newY = e.clientY - startPos.current.y;
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    onDragState(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Check for dismiss (bottom 150px and center area)
    const isInDismissZone = pos.y > screenHeight - 150 && Math.abs(pos.x - (screenWidth / 2 - 28)) < 80;
    if (isInDismissZone) {
      onClose();
      return;
    }

    // Snap to edge logic
    const finalX = pos.x < screenWidth / 2 ? 16 : screenWidth - 76;
    const finalY = Math.max(80, Math.min(screenHeight - 150, pos.y));
    
    setPos({ x: finalX, y: finalY });
    lastPos.current = { x: finalX, y: finalY };

    // If it was just a tap (movement < 10px), open chat
    const dist = Math.sqrt(Math.pow(e.clientX - (startPos.current.x + lastPos.current.x), 2) + 
                           Math.pow(e.clientY - (startPos.current.y + lastPos.current.y), 2));
    if (dist < 15) {
       onOpen();
    }
  };

  return (
    <div
      ref={bubbleRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`pointer-events-auto fixed w-16 h-16 rounded-full shadow-2xl border-2 border-white/30 bg-[color:var(--surface)] cursor-grab active:cursor-grabbing bubble-pop transition-all duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${isDragging ? "scale-110 !transition-none z-[10000]" : "scale-100 z-[9999]"}`}
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        touchAction: "none"
      }}
    >
      <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-emerald-500/10">
        {bubble.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bubble.avatarUrl} alt={bubble.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-bold text-emerald-600">{bubble.name[0]}</span>
        )}
      </div>

      {/* Unread Badge */}
      <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full border-2 border-white flex items-center justify-center shadow-md">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>
      
      {/* Name tag (only visible when not dragging) */}
      {!isDragging && (
        <div className={`absolute top-1/2 -translate-y-1/2 px-3 py-1.5 bg-black/80 backdrop-blur-md text-white text-[11px] font-semibold rounded-xl whitespace-nowrap shadow-xl pointer-events-none transition-opacity ${pos.x < 100 ? "left-18" : "right-18"}`}>
          {bubble.name}
        </div>
      )}
    </div>
  );
}
