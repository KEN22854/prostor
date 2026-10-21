import { describe, expect, it } from 'vitest';
import { looksLikeUrl, parseEmbed } from './embeds';

describe('parseEmbed', () => {
  it('YouTube: watch, youtu.be, shorts → nocookie-плеер и превью; время начала', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      'https://youtu.be/jNQXAC9IVRw',
      'https://youtube.com/shorts/jNQXAC9IVRw',
      'https://m.youtube.com/watch?v=jNQXAC9IVRw&feature=share',
    ]) {
      const e = parseEmbed(url);
      expect(e?.provider).toBe('youtube');
      expect(e?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw');
      expect(e?.thumbnailUrl).toBe('https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg');
    }
    expect(parseEmbed('https://youtu.be/jNQXAC9IVRw?t=1m30s')?.embedUrl).toContain('?start=90');
  });

  it('Vimeo, Loom, Figma, Google Docs, Miro', () => {
    expect(parseEmbed('https://vimeo.com/76979871')?.embedUrl).toBe(
      'https://player.vimeo.com/video/76979871',
    );
    expect(parseEmbed(`https://www.loom.com/share/${'a'.repeat(32)}`)?.embedUrl).toBe(
      `https://www.loom.com/embed/${'a'.repeat(32)}`,
    );
    const figma = parseEmbed('https://www.figma.com/design/AbC123/Макет?node-id=1-2');
    expect(figma?.provider).toBe('figma');
    expect(figma?.embedUrl).toContain('figma.com/embed?embed_host=prostor&url=');
    expect(
      parseEmbed('https://docs.google.com/document/d/1AbC_d-E/edit#heading=h.1')?.embedUrl,
    ).toBe('https://docs.google.com/document/d/1AbC_d-E/preview');
    expect(parseEmbed('https://docs.google.com/presentation/d/1AbC/edit')?.embedUrl).toBe(
      'https://docs.google.com/presentation/d/1AbC/embed',
    );
    expect(parseEmbed('https://miro.com/app/board/uXjVN1ab=/')?.embedUrl).toBe(
      'https://miro.com/app/live-embed/uXjVN1ab=/',
    );
  });

  it('прочие сайты — карточка без плеера; не http(s) и ссылки с логином — null', () => {
    expect(parseEmbed('https://ru.wikipedia.org/wiki/Москва')).toMatchObject({
      provider: 'link',
      embedUrl: null,
    });
    expect(parseEmbed('javascript:alert(1)')).toBeNull();
    expect(parseEmbed('file:///etc/passwd')).toBeNull();
    expect(parseEmbed('https://user:pass@example.com/')).toBeNull();
    expect(parseEmbed('не ссылка')).toBeNull();
  });
});

describe('looksLikeUrl', () => {
  it('одна ссылка — да, текст со ссылкой внутри — нет', () => {
    expect(looksLikeUrl('  https://example.com/a?b=c  ')).toBe(true);
    expect(looksLikeUrl('смотри https://example.com')).toBe(false);
    expect(looksLikeUrl('https://example.com\nhttps://example.org')).toBe(false);
  });
});
