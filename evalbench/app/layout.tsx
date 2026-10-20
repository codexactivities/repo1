import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'EvalBench — лаборатория промптов', description: 'Серверные прогоны, сравнение промптов и поиск регрессий.' };
export default function Layout({children}: {children: React.ReactNode}) {return <html lang="ru"><body>{children}</body></html>;}
