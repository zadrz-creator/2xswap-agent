import type { Metadata } from 'next';
import './globals.css';
import { LiveDataProvider } from '@/lib/live-data';

export const metadata: Metadata = {
  title: '2xSwap Autonomous Trading Agent',
  description: 'Real-time dashboard for the 2xSwap AI trading agent — Synthesis Hackathon 2026',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LiveDataProvider>
          {children}
        </LiveDataProvider>
      </body>
    </html>
  );
}
