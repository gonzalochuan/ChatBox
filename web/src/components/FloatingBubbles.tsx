"use client";

import { useEffect, useRef, useState } from "react";
import { useUI, type Bubble } from "@/store/useUI";
import { useChatStore } from "@/store/useChat";

export default function FloatingBubbles() {
  const { bubbles, removeBubble } = useUI();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const setFilter = useUI((s) => s.setChannelFilter);

  if (!bubbles || bubbles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {bubbles.map((b, i) => (
        <BubbleItem 
          key={b.channelId} 
          bubble={b} 
          index={i} 
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

function BubbleItem({ bubble, index, onOpen, onClose }: { 
  bubble: Bubble; 
  index: number; 
  onOpen: () => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ x: 20, y: 150 + index * 70 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 20, y: 150 + index * 70 });
  const startPos = useRef({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
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
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Snap to edge logic
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const finalX = pos.x < screenWidth / 2 ? 16 : screenWidth - 76;
    
    // Check for dismiss (bottom 100px)
    if (pos.y > screenHeight - 120) {
      onClose();
      return;
    }

    // Keep within vertical bounds
    const finalY = Math.max(100, Math.min(screenHeight - 150, pos.y));
    
    // Smooth snap with CSS transition if not dragging
    setPos({ x: finalX, y: finalY });
    lastPos.current = { x: finalX, y: finalY };

    // If it was just a tap (movement < 5px), open chat
    const dist = Math.sqrt(Math.pow(e.clientX - (startPos.current.x + lastPos.current.x), 2) + 
                           Math.pow(e.clientY - (startPos.current.y + lastPos.current.y), 2));
    if (dist < 10) {
       onOpen();
    }
  };

  return (
    <div
      ref={bubbleRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`pointer-events-auto fixed w-14 h-14 rounded-full shadow-2xl border-2 border-white/20 bg-[color:var(--surface)] cursor-grab active:cursor-grabbing transition-transform duration-300 ${isDragging ? "scale-110 !transition-none" : "scale-100"}`}
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
          <span className="text-xl font-bold text-emerald-600">{bubble.name[0]}</span>
        )}
      </div>
      {/* Unread dot */}
      <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-[color:var(--surface)] animate-pulse" />
      
      {/* Name tag (only visible when not dragging) */}
      {!isDragging && (
        <div className={`absolute top-1/2 -translate-y-1/2 px-3 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] rounded-lg whitespace-nowrap pointer-events-none transition-opacity ${pos.x < 100 ? "left-16" : "right-16"}`}>
          {bubble.name}
        </div>
      )}
    </div>
  );
}
