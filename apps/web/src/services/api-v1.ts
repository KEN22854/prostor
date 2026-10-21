import 'server-only';
import * as Y from 'yjs';
import { generateNKeysBetween } from 'fractional-indexing';
import { prisma } from '@prostor/db';
import {
  Y_KEYS,
  apiCreateElementsSchema,
  type ApiElementInput,
  type BoardElement,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import {
  STICKY_SIZE,
  buildShape,
  buildSticky,
  buildText,
  insertElements,
  maxZIndex,
} from '@/lib/canvas/element-factory';
import { boundsOf, readElement } from '@/lib/canvas/read-element';
import type { SessionUser } from '@/lib/session';
import { changeBoardDocument, readBoardDocument } from '@/services/board-write';
import { requireBoardAccess } from '@/services/boards';
import { boardUrl, emitWebhookEvent } from '@/services/webhooks';

/** Все объекты доски из сохранённого состояния */
function readAll(doc: Y.Doc): BoardElement[] {
  const map = doc.getMap<unknown>(Y_KEYS.elements);
  const result: BoardElement[] = [];
  for (const [id, value] of map.entries()) {
    if (!(value instanceof Y.Map)) continue;
    const el = readElement(id, value as Y.Map<unknown>);
    if (el) result.push(el);
  }
  return result;
}

export async function apiGetBoard(user: SessionUser, boardId: string) {
  const access = await requireBoardAccess(boardId, user.id, 'view');
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      lastActivityAt: true,
      objectCount: true,
    },
  });
  if (!board) throw new ApiError(404, 'not_found', 'Доска не найдена');
  return {
    ...board,
    createdAt: board.createdAt.toISOString(),
    lastActivityAt: board.lastActivityAt.toISOString(),
    url: boardUrl(board.id),
    role: access.role,
  };
}

export async function apiListElements(user: SessionUser, boardId: string, type: string | null) {
  await requireBoardAccess(boardId, user.id, 'view');
  const doc = await readBoardDocument(boardId);
  try {
    const all = readAll(doc);
    return type ? all.filter((el) => el.type === type) : all;
  } finally {
    doc.destroy();
  }
}

const DEFAULT_COLORS = { sticky: '#fde68a', shape: '#ffffff', text: '#1f2937' } as const;
const GAP = 24;

/**
 * Создание объектов через API. Без координат объекты встают рядом ниже
 * текущего содержимого доски (по 8 в ряд), чтобы не лечь поверх чужой работы.
 */
export async function apiCreateElements(user: SessionUser, boardId: string, input: unknown) {
  await requireBoardAccess(boardId, user.id, 'edit');
  const { elements } = apiCreateElementsSchema.parse(input);

  const created = await changeBoardDocument(boardId, (doc) => {
    const existing = readAll(doc);
    let bottom = 0;
    let left = 0;
    if (existing.length > 0) {
      bottom = Math.max(...existing.map((el) => boundsOf(el).maxY)) + 80;
      left = Math.min(...existing.map((el) => boundsOf(el).minX));
    }
    const keys = generateNKeysBetween(
      maxZIndex(doc.getMap(Y_KEYS.elements)),
      null,
      elements.length,
    );
    const built = elements.map((item, i) => {
      const auto = {
        x: left + (i % 8) * (STICKY_SIZE + GAP),
        y: bottom + Math.floor(i / 8) * (STICKY_SIZE + GAP),
      };
      return buildFromInput(item, {
        x: item.x ?? auto.x,
        y: item.y ?? auto.y,
        userId: user.id,
        zIndex: keys[i] ?? 'a0',
        authorName: user.name ?? undefined,
      });
    });
    insertElements(doc, built);
    return built;
  });

  await prisma.board
    .update({ where: { id: boardId }, data: { objectCount: { increment: created.length } } })
    .catch(() => undefined);
  await emitWebhookEvent('element.created', boardId, user.id, {
    count: created.length,
    elements: created.map((el) => ({
      id: el.id,
      type: el.type,
      text: 'text' in el ? el.text : undefined,
    })),
  });
  return created;
}

function buildFromInput(
  item: ApiElementInput,
  base: { x: number; y: number; userId: string; zIndex: string; authorName?: string },
): BoardElement {
  switch (item.type) {
    case 'sticky': {
      const el = buildSticky({
        ...base,
        fill: item.color ?? DEFAULT_COLORS.sticky,
        text: item.text,
      });
      return {
        ...el,
        ...(item.width ? { width: item.width } : {}),
        ...(item.height ? { height: item.height } : {}),
      };
    }
    case 'text': {
      const el = buildText({ ...base, text: item.text, color: item.color ?? DEFAULT_COLORS.text });
      return { ...el, ...(item.width ? { width: item.width } : {}) };
    }
    case 'shape': {
      const el = buildShape({
        ...base,
        shape: item.shape ?? 'rect',
        width: item.width ?? 200,
        height: item.height ?? 120,
        fill: item.color ?? DEFAULT_COLORS.shape,
        stroke: '#1f2937',
      });
      return { ...el, text: item.text };
    }
  }
}
