import { describe, expect, it } from 'vitest';
import { decodeHtml, parseLinkMeta } from './link-meta';
import { assertPublicUrl, isPrivateAddress, UnsafeUrlError } from './safe-fetch';

describe('parseLinkMeta', () => {
  const page = new URL('https://example.com/blog/post');

  it('Open Graph важнее <title>, относительная картинка — абсолютной, сущности декодируются', () => {
    const html = `<html><head>
      <title>Запасной заголовок</title>
      <meta property="og:title" content="Новость &laquo;дня&raquo; &amp; не только">
      <meta content="Короткое описание" name="description">
      <meta property='og:site_name' content='Пример'>
      <meta property="og:image" content="/img/cover.png?x=1&amp;y=2">
    </head></html>`;
    expect(parseLinkMeta(html, page)).toEqual({
      title: 'Новость «дня» & не только',
      description: 'Короткое описание',
      siteName: 'Пример',
      image: 'https://example.com/img/cover.png?x=1&y=2',
    });
  });

  it('без og — <title> и twitter:image', () => {
    const meta = parseLinkMeta(
      '<title> Просто   страница </title><meta name="twitter:image" content="https://cdn.example.com/a.jpg">',
      page,
    );
    expect(meta.title).toBe('Просто страница');
    expect(meta.image).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('decodeHtml', () => {
  it('windows-1251 из <meta charset>', () => {
    // «Привет» в cp1251
    const body = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="windows-1251"><title>'),
      0xcf,
      0xf0,
      0xe8,
      0xe2,
      0xe5,
      0xf2,
      ...new TextEncoder().encode('</title>'),
    ]);
    expect(decodeHtml(body, 'text/html')).toContain('<title>Привет</title>');
  });
});

describe('защита от SSRF', () => {
  it('внутренние адреса IPv4/IPv6 распознаются', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '93.184.216.34', '2a00:1450:4010:c05::71']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('localhost, IP-литералы внутренней сети, чужие порты и схемы запрещены без сети', async () => {
    for (const url of [
      'http://localhost:3000/',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data/',
      'http://example.com:8080/',
      'ftp://example.com/',
      'http://printer.local/',
    ]) {
      await expect(assertPublicUrl(url), url).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });
});
