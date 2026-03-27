import { create } from "zustand";

export type ChannelFilter = "chats" | "global" | "menu";

interface UIState {
  channelFilter: ChannelFilter;
  setChannelFilter: (f: ChannelFilter) => void;
}

export const useUI = create<UIState>((set) => ({
  channelFilter: "chats",
  setChannelFilter: (f) => set({ channelFilter: f }),
}));
