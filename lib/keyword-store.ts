"use client";

import { create } from "zustand";

export interface SavedKeyword {
  keyword: string;
  avgCPC: number;
  searchVolume: number;
  efficiencyScore: number;
  source: "longtail" | "ai" | "manual";
}

interface KeywordState {
  // Monthly budget shared by the simulator and the "my list" estimate.
  budget: number;
  setBudget: (value: number) => void;

  list: SavedKeyword[];
  add: (keyword: SavedKeyword) => void;
  remove: (keyword: string) => void;
  clear: () => void;
}

export const useKeywordStore = create<KeywordState>((set) => ({
  budget: 200,
  setBudget: (value) => set({ budget: value }),

  list: [],
  add: (keyword) =>
    set((state) =>
      state.list.some((k) => k.keyword === keyword.keyword)
        ? state
        : { list: [...state.list, keyword] },
    ),
  remove: (keyword) =>
    set((state) => ({ list: state.list.filter((k) => k.keyword !== keyword) })),
  clear: () => set({ list: [] }),
}));
