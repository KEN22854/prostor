/**
 * Лента картинок (в духе Pinterest): свободные изображения Wikimedia Commons
 * и, если задан ключ, фото Pexels. Общие типы для сервера и клиента.
 */

export interface FeedImage {
  /** Уникален в пределах ленты: commons:123 / pexels:456 */
  id: string;
  provider: 'commons' | 'pexels';
  thumb: string;
  thumbWidth: number;
  thumbHeight: number;
  /** Версия для доски (до ~1600 px) */
  full: string;
  width: number;
  height: number;
  title: string;
  author: string | null;
  license: string;
  pageUrl: string;
}

export interface FeedPage {
  items: FeedImage[];
  /** Курсор следующей страницы; null — дальше нет */
  next: string | null;
}

/** Хосты, с которых сервер скачивает картинки ленты на доску */
export const FEED_IMAGE_HOSTS = new Set([
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'images.pexels.com',
]);

/** Подборки для пустого запроса */
export const FEED_TOPICS: ReadonlyArray<{ label: string; query: string }> = [
  { label: 'Природа', query: 'landscape nature' },
  { label: 'Архитектура', query: 'architecture' },
  { label: 'Интерьер', query: 'interior design' },
  { label: 'Город', query: 'city night' },
  { label: 'Космос', query: 'nebula' },
  { label: 'Животные', query: 'wildlife' },
  { label: 'Еда', query: 'food photography' },
  { label: 'Искусство', query: 'painting' },
  { label: 'Цветы', query: 'flowers macro' },
  { label: 'Горы', query: 'mountains' },
  { label: 'Море', query: 'sea beach' },
  { label: 'Ретро', query: 'vintage poster' },
];

/** Подпись источника для картинки на доске */
export function attributionOf(
  img: Pick<FeedImage, 'title' | 'author' | 'license' | 'provider'>,
): string {
  const source = img.provider === 'pexels' ? 'Pexels' : 'Wikimedia Commons';
  return [img.title, img.author ? `© ${img.author}` : null, img.license, source]
    .filter(Boolean)
    .join(' · ');
}
