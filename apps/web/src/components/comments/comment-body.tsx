import { tokenizeComment } from '@prostor/shared';

/** Текст комментария: упоминания — подсвеченные «@Имя», остальное — как есть (без HTML) */
export function CommentBody({ body }: { body: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {tokenizeComment(body).map((token, i) =>
        token.kind === 'mention' ? (
          <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
            @{token.name}
          </span>
        ) : (
          <span key={i}>{token.text}</span>
        ),
      )}
    </p>
  );
}
