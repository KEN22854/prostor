/**
 * Каталог шрифтов (общий для сервера и клиента).
 * f — семейство, c — категория, cy — есть кириллица, w — начертания (толщины).
 */
export interface FontCatalogEntry {
  f: string;
  c: 'sans' | 'serif' | 'display' | 'hand' | 'mono';
  cy: boolean;
  w: number[];
}

/** Шрифты, которые есть всегда (Inter — шрифт интерфейса, остальные — системные) */
export const BUILTIN_FONTS = [
  'Inter',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
] as const;

export function isBuiltinFont(family: string | undefined): boolean {
  return !family || (BUILTIN_FONTS as readonly string[]).includes(family);
}

const e = (f: string, c: FontCatalogEntry['c'], cy: boolean, w = [400, 700]): FontCatalogEntry => ({
  f,
  c,
  cy,
  w,
});

/** Запасной список популярных шрифтов, если каталог Google недоступен */
export const FALLBACK_FONTS: FontCatalogEntry[] = [
  e('Roboto', 'sans', true, [100, 300, 400, 500, 700, 900]),
  e('Open Sans', 'sans', true, [300, 400, 500, 600, 700, 800]),
  e('Montserrat', 'sans', true, [100, 200, 300, 400, 500, 600, 700, 800, 900]),
  e('Lato', 'sans', false, [100, 300, 400, 700, 900]),
  e('Poppins', 'sans', false, [100, 200, 300, 400, 500, 600, 700, 800, 900]),
  e('Roboto Condensed', 'sans', true),
  e('Source Sans 3', 'sans', true),
  e('Raleway', 'sans', true),
  e('Nunito', 'sans', true),
  e('Ubuntu', 'sans', true),
  e('PT Sans', 'sans', true),
  e('Rubik', 'sans', true),
  e('Noto Sans', 'sans', true),
  e('Manrope', 'sans', true),
  e('Fira Sans', 'sans', true),
  e('Work Sans', 'sans', false),
  e('IBM Plex Sans', 'sans', true),
  e('Exo 2', 'sans', true),
  e('Comfortaa', 'display', true),
  e('Oswald', 'sans', true),
  e('Playfair Display', 'serif', true),
  e('Merriweather', 'serif', true),
  e('PT Serif', 'serif', true),
  e('Lora', 'serif', true),
  e('Roboto Slab', 'serif', true),
  e('Noto Serif', 'serif', true),
  e('Cormorant Garamond', 'serif', true),
  e('EB Garamond', 'serif', true),
  e('Bebas Neue', 'display', false, [400]),
  e('Lobster', 'display', true, [400]),
  e('Russo One', 'display', true, [400]),
  e('Pacifico', 'hand', true, [400]),
  e('Caveat', 'hand', true),
  e('Amatic SC', 'hand', true),
  e('Marck Script', 'hand', true, [400]),
  e('Neucha', 'hand', true, [400]),
  e('Press Start 2P', 'display', true, [400]),
  e('Roboto Mono', 'mono', true),
  e('JetBrains Mono', 'mono', true),
  e('Fira Code', 'mono', true),
  e('PT Mono', 'mono', true, [400]),
];
