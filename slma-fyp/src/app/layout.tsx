import type { Metadata, Viewport } from "next";
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: "SLMA — Sign Language Medical Assistant",
  description:
    "Real-time bidirectional sign language translation system for deaf patients in medical settings. Powered by MediaPipe Holistic, TCN+LSTM, CTC decoding, and Semantic Paraphrasing. FYP project at UMT Sialkot.",
  keywords: [
    "sign language", "medical assistant", "deaf", "Pakistan", "UMT Sialkot",
    "AI", "MediaPipe", "TensorFlow", "SLMA", "FYP",
  ],
  authors: [{ name: "SLMA FYP Team — UMT Sialkot" }],
  metadataBase: new URL("https://slma.vercel.app"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-slate-100 antialiased font-sans">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
