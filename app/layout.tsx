import type { Metadata } from 'next';
import { IBM_Plex_Mono, Onest } from 'next/font/google';
import './globals.css';

const onest = Onest({
  variable: '--font-onest',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const deploymentOrigin =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(deploymentOrigin),
  title: 'От шум до образ — Как работи AI',
  description:
    'Интерактивно и достъпно обяснение как diffusion моделите превръщат шум в изображения.',
  openGraph: {
    title: 'От шум до образ',
    description: 'Как AI прави картинки — интерактивно обяснение на diffusion процеса.',
    type: 'website',
    locale: 'bg_BG',
    images: [
      {
        url: '/og.png',
        width: 1732,
        height: 906,
        alt: 'От шум до образ — Как AI прави картинки',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'От шум до образ',
    description: 'Как AI прави картинки — интерактивно обяснение на diffusion процеса.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bg" className={`${onest.variable} ${ibmPlexMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
