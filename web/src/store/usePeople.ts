import { create } from "zustand";

export interface Person {
  id: string;
  name: string;
  handle?: string;
  isTeacher?: boolean;
  avatarUrl?: string | null;
}

interface PeopleState {
  people: Person[];
  setPeople: (list: Person[]) => void;
}

export const usePeople = create<PeopleState>((set) => ({
  people: [],
  setPeople: (list) => set({ people: list }),
}));
