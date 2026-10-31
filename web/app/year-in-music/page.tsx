import type { Metadata } from 'next';
import YearInMusic from './year-in-music';

export const metadata: Metadata = {
  title: '年度唱片报告 / CHROMA',
  description: '按年份探索专辑、流派、评分、发行节奏与封面色彩。',
};

export default function YearInMusicPage() {
  return <YearInMusic />;
}
