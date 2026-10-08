import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'LeadFactory — компании и лиды', description: 'Поиск компаний из открытых источников' };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="ru"><body>{children}</body></html>;
}
