import { describe, expect, it } from 'vitest';
import { audioFormat } from '@/services/audio';

const bytes = (...parts: Array<string | number[]>) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe('формат аудио по сигнатуре', () => {
  it('распознаёт MP3, WAV, OGG, FLAC, WebM, M4A, AAC', () => {
    expect(audioFormat(bytes('ID3', [3, 0]))?.mime).toBe('audio/mpeg');
    expect(audioFormat(bytes([0xff, 0xfb, 0x90, 0x64]))?.mime).toBe('audio/mpeg');
    expect(audioFormat(bytes([0xff, 0xf1, 0x50, 0x80]))?.mime).toBe('audio/aac');
    expect(audioFormat(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))?.mime).toBe('audio/wav');
    expect(audioFormat(bytes('OggS'))?.mime).toBe('audio/ogg');
    expect(audioFormat(bytes('fLaC'))?.mime).toBe('audio/flac');
    expect(audioFormat(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.mime).toBe('audio/webm');
    expect(audioFormat(bytes([0, 0, 0, 32], 'ftypM4A '))?.mime).toBe('audio/mp4');
  });

  it('картинки и текст — не аудио', () => {
    expect(audioFormat(bytes([0x89], 'PNG'))).toBeNull();
    expect(audioFormat(bytes('hello world'))).toBeNull();
  });
});
