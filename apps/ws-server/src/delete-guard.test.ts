import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';
import { findForbiddenDeletions, restoreElements } from './delete-guard';

function element(fields: Record<string, unknown>): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(fields)) m.set(k, v);
  return m;
}

/** Сервер и клиент с общим состоянием; клиент удаляет ключи — получаем его апдейт */
function setup() {
  const server = new Y.Doc();
  const elements = server.getMap<unknown>(Y_KEYS.elements);
  server.transact(() => {
    elements.set('mine', element({ type: 'sticky', createdBy: 'u1', text: 'моё' }));
    elements.set('foreign', element({ type: 'sticky', createdBy: 'u2', text: 'чужое' }));
    elements.set('locked', element({ type: 'sticky', createdBy: 'u1', locked: true }));
    const rich = element({ type: 'text', createdBy: 'u2' });
    elements.set('rich', rich);
    const frag = new Y.XmlFragment();
    rich.set('content', frag);
    const p = new Y.XmlElement('paragraph');
    frag.insert(0, [p]);
    const t = new Y.XmlText();
    p.insert(0, [t]);
    t.insert(0, 'форматированный');
  });
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
  const deleteOnClient = (keys: string[]) => {
    const before = Y.encodeStateVector(client);
    client.transact(() => keys.forEach((k) => client.getMap(Y_KEYS.elements).delete(k)));
    return Y.encodeStateAsUpdate(client, before);
  };
  return { server, client, elements, deleteOnClient };
}

describe('защита от удаления чужих объектов', () => {
  it('при запрете политики чужие и заблокированные объекты возвращаются, свои — удаляются', () => {
    const { server, elements, deleteOnClient } = setup();
    const update = deleteOnClient(['mine', 'foreign', 'locked', 'rich']);
    const guarded = findForbiddenDeletions(server, update, { userId: 'u1', canDeleteOthers: false });
    expect(guarded.map((g) => g.key).sort()).toEqual(['foreign', 'locked', 'rich']);

    Y.applyUpdate(server, update, 'client');
    expect(elements.has('foreign')).toBe(false);
    expect(restoreElements(server, guarded, 'server')).toBe(3);

    expect(elements.has('mine')).toBe(false);
    expect((elements.get('foreign') as Y.Map<unknown>).get('text')).toBe('чужое');
    // Вложенный форматированный текст восстанавливается целиком
    const content = (elements.get('rich') as Y.Map<unknown>).get('content') as Y.XmlFragment;
    expect(content.toString()).toContain('форматированный');
  });

  it('при разрешении удаляются чужие, но не заблокированные', () => {
    const { server, deleteOnClient } = setup();
    const update = deleteOnClient(['foreign', 'locked']);
    const guarded = findForbiddenDeletions(server, update, { userId: 'u1', canDeleteOthers: true });
    expect(guarded.map((g) => g.key)).toEqual(['locked']);
  });

  it('правки полей (не удаление объектов) не трогаются; клиент сходится с сервером', () => {
    const { server, client, deleteOnClient } = setup();
    const before = Y.encodeStateVector(client);
    (client.getMap(Y_KEYS.elements).get('foreign') as Y.Map<unknown>).set('text', 'изменено');
    const edit = Y.encodeStateAsUpdate(client, before);
    expect(findForbiddenDeletions(server, edit, { userId: 'u1', canDeleteOthers: false })).toEqual([]);

    const update = deleteOnClient(['foreign']);
    const guarded = findForbiddenDeletions(server, update, { userId: 'u1', canDeleteOthers: false });
    Y.applyUpdate(server, edit, 'client');
    Y.applyUpdate(server, update, 'client');
    restoreElements(server, guarded, 'server');
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server, Y.encodeStateVector(client)));
    expect(client.getMap(Y_KEYS.elements).has('foreign')).toBe(true);
    expect(client.getMap(Y_KEYS.elements).toJSON()).toEqual(server.getMap(Y_KEYS.elements).toJSON());
  });
});
