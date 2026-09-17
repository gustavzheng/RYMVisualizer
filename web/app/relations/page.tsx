'use client';

import { useEffect } from 'react';

export default function RelationsPage() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      window.location.assign('/');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <iframe
      title="关系漫游"
      src="/relation-walk/explore.html"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', border: 0, background: '#090908' }}
    />
  );
}
