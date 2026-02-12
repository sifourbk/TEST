import './globals.css';
import type { ReactNode } from 'react';
import { Nav } from './nav';
import { AuthGate } from './AuthGate';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Nav />
          <main style={{ flex: 1, padding: '24px' }}>
            <AuthGate>{children}</AuthGate>
          </main>
        </div>
      </body>
    </html>
  );
}
