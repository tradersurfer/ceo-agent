import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'CEO Agent',
  description: 'The AI that runs your AI workforce.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
