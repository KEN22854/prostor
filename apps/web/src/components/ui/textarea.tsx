import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-20 w-full rounded-lg border border-input bg-background/80 px-3 py-2 text-sm shadow-sm transition-all duration-200 placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-primary/60 focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
