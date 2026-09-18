'use client';

import { useEffect } from 'react';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function RelationsPage() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      window.location.assign(`${basePath}/`);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <iframe
      title="关系漫游"
      src={`${basePath}/relation-walk/explore.html`}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', border: 0, background: '#090908' }}
    />
  );
}
