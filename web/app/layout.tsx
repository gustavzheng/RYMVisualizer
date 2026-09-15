import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CHROMA / 音乐数据图谱',
  description: '从专辑封面、聆听数据与关系聚类中探索收藏的视觉声纹。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
