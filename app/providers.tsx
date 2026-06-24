"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 2500,
          style: {
            background: "#0F1623",
            color: "#F1F5F9",
            border: "1px solid #1E2D45",
            fontSize: "13px",
          },
          success: { iconTheme: { primary: "#10B981", secondary: "#0F1623" } },
          error: { iconTheme: { primary: "#EF4444", secondary: "#0F1623" } },
        }}
      />
    </SessionProvider>
  );
}
