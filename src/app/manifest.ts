import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Walkie-Talkie',
    short_name: 'WalkieTalkie',
    id: '/',
    scope: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1220',
    theme_color: '#6ee7f9',
    description: 'Push-to-talk PWA for LAN/hotspot',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
