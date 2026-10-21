import { describe, expect, it } from 'vitest';
import { plural } from './utils';

describe('plural', () => {
  const forms = ['объект', 'объекта', 'объектов'] as const;
  it.each([
    [0, 'объектов'],
    [1, 'объект'],
    [2, 'объекта'],
    [5, 'объектов'],
    [11, 'объектов'],
    [12, 'объектов'],
    [21, 'объект'],
    [22, 'объекта'],
    [111, 'объектов'],
    [10007, 'объектов'],
  ])('%i → %s', (n, expected) => {
    expect(plural(n, forms)).toBe(expected);
  });
});
