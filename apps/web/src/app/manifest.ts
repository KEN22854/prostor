import type { MetadataRoute } from 'next';

/** PWA: «Простор» ставится на телефон и компьютер как приложение */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Простор — доска для совместной работы',
    short_name: 'Простор',
    description: 'Бесконечная онлайн-доска: стикеры, схемы, созвоны и ИИ — вместе с командой',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fbf8f2',
    theme_color: '#9b6bdf',
    lang: 'ru',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Мои доски',
        url: '/dashboard',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
