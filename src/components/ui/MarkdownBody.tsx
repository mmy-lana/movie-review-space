/**
 * React renderer for the XSS-safe Markdown pipeline.
 *
 * `renderMarkdown` (see `markdown-sanitizer.ts`) compiles review bodies into a
 * closed set of React elements: no raw HTML survives, and no `href` outside the
 * `http`/`https`/`mailto`/relative allow-list is emitted. This component only
 * supplies layout, so the security guarantees stay owned by the parser.
 */

import type { ReactNode } from 'react';
import { renderMarkdown, toPlainTextPreview } from '@/lib/utils/markdown-sanitizer';

export interface MarkdownBodyProps {
  /** Markdown source. Empty or whitespace-only input renders `emptyFallback`. */
  source: string | null | undefined;
  /** Copy shown when the source is empty. */
  emptyFallback?: ReactNode;
  className?: string;
}

export function MarkdownBody({
  source,
  emptyFallback = null,
  className = '',
}: MarkdownBodyProps) {
  const nodes = renderMarkdown(source);

  if (nodes.length === 0) {
    return emptyFallback ? <div className={className}>{emptyFallback}</div> : null;
  }

  return <div className={`flex flex-col gap-2.5 ${className}`}>{nodes}</div>;
}

export interface MarkdownPreviewProps {
  source: string | null | undefined;
  /** Truncation length in characters. */
  maxLength?: number;
  className?: string;
}

/** Single-line plain-text preview of a Markdown body. */
export function MarkdownPreview({
  source,
  maxLength = 180,
  className = '',
}: MarkdownPreviewProps) {
  const preview = toPlainTextPreview(source, maxLength);
  if (preview.length === 0) return null;
  return <p className={className}>{preview}</p>;
}

export default MarkdownBody;
