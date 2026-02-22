import { create } from "zustand";

export type ChannelFilter = "general" | "dm" | "group";

interface UIState {
  channelFilter: ChannelFilter;
  setChannelFilter: (f: ChannelFilter) => void;
}

export const useUI = create<UIState>((set) => ({
  channelFilter: "general",
  setChannelFilter: (f) => set({ channelFilter: f }),
}));
