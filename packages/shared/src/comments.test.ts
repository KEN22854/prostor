import { describe, expect, it } from 'vitest';
import { commentPlainText, createCommentSchema, parseMentions, tokenizeComment } from './comments';

describe('комментарии', () => {
  const body = 'Привет, @[Анна Смирнова](ckuser00001) и @[Иван](ckuser00002)! @[Анна Смирнова](ckuser00001)';

  it('упоминания: уникальные id', () => {
    expect(parseMentions(body)).toEqual(['ckuser00001', 'ckuser00002']);
    expect(parseMentions('просто @почта и @[без id]')).toEqual([]);
  });

  it('разбор на текст и упоминания, плоский текст', () => {
    const tokens = tokenizeComment('Да, @[Иван](ckuser00002), смотри');
    expect(tokens).toEqual([
      { kind: 'text', text: 'Да, ' },
      { kind: 'mention', name: 'Иван', userId: 'ckuser00002' },
      { kind: 'text', text: ', смотри' },
    ]);
    expect(commentPlainText('Да, @[Иван](ckuser00002)')).toBe('Да, @Иван');
  });

  it('новый тред требует объект или точку, ответ — родителя', () => {
    expect(createCommentSchema.safeParse({ body: 'x' }).success).toBe(false);
    expect(createCommentSchema.safeParse({ body: 'x', x: 1, y: 2 }).success).toBe(true);
    expect(createCommentSchema.safeParse({ body: 'x', elementId: 'el1' }).success).toBe(true);
    expect(createCommentSchema.safeParse({ body: 'x', parentId: 'c1' }).success).toBe(true);
    expect(createCommentSchema.safeParse({ body: '   ', parentId: 'c1' }).success).toBe(false);
  });
});
