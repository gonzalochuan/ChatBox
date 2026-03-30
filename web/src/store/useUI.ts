import { create } from "zustand";

export type ChannelFilter = "chats" | "global" | "menu";

export interface Bubble {
  channelId: string;
  name: string;
  avatarUrl: string | null;
}

interface UIState {
  channelFilter: ChannelFilter;
  setChannelFilter: (f: ChannelFilter) => void;
  bubbles: Bubble[];
  addBubble: (b: Bubble) => void;
  removeBubble: (channelId: string) => void;
  clearBubbles: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  channelFilter: "chats",
  setChannelFilter: (f) => set({ channelFilter: f }),
  bubbles: [],
  addBubble: (b) => {
    const existing = get().bubbles;
    if (existing.some(x => x.channelId === b.channelId)) return;
    set({ bubbles: [...existing, b] });
  },
  removeBubble: (id) => set({ bubbles: get().bubbles.filter(b => b.channelId !== id) }),
  clearBubbles: () => set({ bubbles: [] }),
}));
