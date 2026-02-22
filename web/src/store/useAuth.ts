import { create } from "zustand";

interface ProfilePayload {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  roles?: string[] | null;
}

interface AuthState {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  roles: string[];
  isTeacher: boolean;
  setProfile: (u: ProfilePayload) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  roles: [],
  isTeacher: false,
  setProfile: (u) => {
    const prev = get();
    const roles = Array.isArray(u.roles) ? u.roles : prev.roles;
    const isTeacher = roles.includes("TEACHER") || roles.includes("ADMIN");
    const display = u.nickname || u.name || u.email || prev.displayName || "You";
    set({
      userId: typeof u.id !== "undefined" ? (u.id || null) : prev.userId,
      email: typeof u.email !== "undefined" ? (u.email || null) : prev.email,
      displayName: display,
      avatarUrl: typeof u.avatarUrl !== "undefined" ? (u.avatarUrl || null) : prev.avatarUrl,
      roles,
      isTeacher,
    });
  },
}));
