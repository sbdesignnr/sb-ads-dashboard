"use client";

import { create } from "zustand";

export type DateRangeDays = 7 | 30 | 60 | 90;

interface UIState {
  // Sidebar (desktop collapse + mobile drawer)
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (value: boolean) => void;

  // Global date range filter
  rangeDays: DateRangeDays;
  setRangeDays: (days: DateRangeDays) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),

  mobileSidebarOpen: false,
  setMobileSidebarOpen: (value) => set({ mobileSidebarOpen: value }),

  rangeDays: 30,
  setRangeDays: (days) => set({ rangeDays: days }),
}));
