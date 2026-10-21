/**
 * Библиотека стикеров: открытые наборы эмодзи через Iconify API
 * (поиск и SVG). Общий модуль для сервера и клиента.
 */

export interface StickerSet {
  prefix: string;
  name: string;
  license: string;
  licenseUrl: string;
}

export const STICKER_SETS: readonly StickerSet[] = [
  {
    prefix: 'fluent-emoji',
    name: 'Fluent Emoji',
    license: 'MIT',
    licenseUrl: 'https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE',
  },
  {
    prefix: 'fluent-emoji-flat',
    name: 'Fluent Emoji Flat',
    license: 'MIT',
    licenseUrl: 'https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE',
  },
  {
    prefix: 'noto',
    name: 'Noto Emoji',
    license: 'Apache 2.0',
    licenseUrl: 'https://github.com/googlefonts/noto-emoji/blob/main/LICENSE',
  },
  {
    prefix: 'twemoji',
    name: 'Twemoji',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    prefix: 'openmoji',
    name: 'OpenMoji',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
];

export const STICKER_PREFIXES = new Set(STICKER_SETS.map((s) => s.prefix));

/** id стикера: набор:имя (как в Iconify) */
export function isStickerId(id: string): boolean {
  const m = /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(id);
  return Boolean(m && STICKER_PREFIXES.has(m[1]!));
}

/** Категории — готовые запросы поиска (англ.) */
export const STICKER_CATEGORIES: ReadonlyArray<{ label: string; query: string }> = [
  { label: 'Эмоции', query: 'face' },
  { label: 'Жесты', query: 'hand' },
  { label: 'Сердечки', query: 'heart' },
  { label: 'Животные', query: 'animal' },
  { label: 'Еда', query: 'food' },
  { label: 'Природа', query: 'plant' },
  { label: 'Праздник', query: 'party' },
  { label: 'Работа', query: 'office' },
  { label: 'Спорт', query: 'ball' },
  { label: 'Транспорт', query: 'car' },
  { label: 'Погода', query: 'sun' },
  { label: 'Символы', query: 'check' },
];

/** Частые русские слова → английский запрос (Iconify ищет по английским именам) */
const RU_EN: Record<string, string> = {
  кот: 'cat',
  кошка: 'cat',
  котик: 'cat',
  собака: 'dog',
  пёс: 'dog',
  пес: 'dog',
  щенок: 'dog',
  медведь: 'bear',
  лиса: 'fox',
  заяц: 'rabbit',
  кролик: 'rabbit',
  птица: 'bird',
  рыба: 'fish',
  сова: 'owl',
  единорог: 'unicorn',
  дракон: 'dragon',
  лев: 'lion',
  тигр: 'tiger',
  обезьяна: 'monkey',
  панда: 'panda',
  пингвин: 'penguin',
  лошадь: 'horse',
  корова: 'cow',
  свинья: 'pig',
  мышь: 'mouse',
  животное: 'animal',
  животные: 'animal',
  сердце: 'heart',
  сердечко: 'heart',
  любовь: 'heart',
  огонь: 'fire',
  звезда: 'star',
  улыбка: 'smile',
  смех: 'laugh',
  смайл: 'smile',
  смайлик: 'smile',
  лицо: 'face',
  эмоция: 'face',
  эмоции: 'face',
  слёзы: 'tear',
  слезы: 'tear',
  грусть: 'sad',
  злость: 'angry',
  удивление: 'astonished',
  думать: 'thinking',
  мысль: 'thinking',
  сон: 'sleep',
  спать: 'sleep',
  поцелуй: 'kiss',
  класс: 'thumbs up',
  лайк: 'thumbs up',
  палец: 'thumbs',
  рука: 'hand',
  руки: 'hand',
  жест: 'hand',
  хлопать: 'clap',
  аплодисменты: 'clap',
  ок: 'ok hand',
  деньги: 'money',
  ракета: 'rocket',
  идея: 'light bulb',
  лампа: 'light bulb',
  часы: 'clock',
  время: 'clock',
  книга: 'book',
  компьютер: 'computer',
  ноутбук: 'laptop',
  телефон: 'phone',
  дом: 'house',
  машина: 'car',
  автомобиль: 'car',
  самолёт: 'airplane',
  самолет: 'airplane',
  поезд: 'train',
  велосипед: 'bicycle',
  солнце: 'sun',
  луна: 'moon',
  дождь: 'rain',
  снег: 'snow',
  облако: 'cloud',
  радуга: 'rainbow',
  цветок: 'flower',
  цветы: 'flower',
  дерево: 'tree',
  растение: 'plant',
  еда: 'food',
  пицца: 'pizza',
  кофе: 'coffee',
  чай: 'tea',
  торт: 'cake',
  яблоко: 'apple',
  бургер: 'burger',
  подарок: 'gift',
  праздник: 'party',
  вечеринка: 'party',
  шарик: 'balloon',
  флаг: 'flag',
  галочка: 'check mark',
  готово: 'check mark',
  крестик: 'cross mark',
  вопрос: 'question',
  восклицание: 'exclamation',
  внимание: 'warning',
  стрелка: 'arrow',
  человек: 'person',
  мужчина: 'man',
  женщина: 'woman',
  ребёнок: 'baby',
  ребенок: 'baby',
  череп: 'skull',
  призрак: 'ghost',
  робот: 'robot',
  инопланетянин: 'alien',
  кубок: 'trophy',
  трофей: 'trophy',
  медаль: 'medal',
  мяч: 'ball',
  спорт: 'ball',
  музыка: 'music',
  нота: 'musical note',
  камера: 'camera',
  фото: 'camera',
  почта: 'mail',
  письмо: 'envelope',
  замок: 'lock',
  ключ: 'key',
  бомба: 'bomb',
  молния: 'lightning',
  вода: 'water',
  глаз: 'eye',
  глаза: 'eyes',
  мозг: 'brain',
  сила: 'muscle',
  работа: 'office',
  офис: 'office',
  команда: 'people',
  цель: 'target',
  мишень: 'target',
  график: 'chart',
  календарь: 'calendar',
  папка: 'folder',
  документ: 'page',
  карандаш: 'pencil',
  ножницы: 'scissors',
  пазл: 'puzzle',
  кристалл: 'gem',
  корона: 'crown',
  ёлка: 'christmas tree',
  елка: 'christmas tree',
  тыква: 'pumpkin',
  снеговик: 'snowman',
  погода: 'sun',
  транспорт: 'car',
  природа: 'plant',
  символ: 'check',
  символы: 'check',
};

/** Запрос для Iconify: латиница как есть, русские слова — по словарю */
export function stickerQuery(raw: string): string {
  const q = raw.trim().toLowerCase();
  if (!/[а-яё]/.test(q)) return q;
  const whole = RU_EN[q];
  if (whole) return whole;
  return q
    .split(/\s+/)
    .map((w) => RU_EN[w] ?? RU_EN[w.replace(/(ы|и|а|я|ов|ей|ик)$/u, '')] ?? '')
    .filter(Boolean)
    .join(' ');
}
