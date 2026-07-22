"use client";
import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: "rgba(15,23,42,0.95)",
          color: "#e2e8f0",
          border: "1px solid rgba(13,148,136,0.4)",
          borderRadius: "14px",
          fontSize: "13px",
          backdropFilter: "blur(8px)",
        },
      }}
    />
  );
}
