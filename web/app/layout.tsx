import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Farmer Buddy',
  description: 'Agricultural workforce monitoring and farm assistance platform',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-fb-bg text-fb-text font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
