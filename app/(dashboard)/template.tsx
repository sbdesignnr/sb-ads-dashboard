"use client";

import { motion } from "framer-motion";

// Re-mounts on every route change → gives a fast, subtle fade-in transition
// between dashboard pages without delaying interaction.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
