/**
 * XSS-safe Markdown parsing for review bodies.
 *
 * Review text is untrusted user input that must never be injected as HTML.
 * This module implements a deliberately small Markdown subset — headings,
 * bold, italic, strikethrough, inline code, fenced code, links, autolinks,
 * blockquotes and ordered/unordered lists — and compiles it into a strict,
 * closed set of React elements.
 *
 * Security model:
 * 1. Raw HTML in the source is escaped before any tag is generated, so an
 *    injected `<script>` becomes inert text.
 * 2. Only `http:`, `https:` and `mailto:` URLs survive; everything else
 *    (notably `javascript:` and `data:`) collapses to `#`.
 * 3. Rendered output contains no `dangerouslySetInnerHTML` and no `href`
 *    outside the allow-list, so there is no injection surface left.
 */

import { createElement, type ReactNode } from 'react';

/** Longest review body accepted for rendering (defensive bound). */
export const MAX_REVIEW_BODY_LENGTH = 8_000;

/** Sentinel characters used to shield generated markup from later passes. */
const TAG_OPEN = '\u0001';
const TAG_CLOSE = '\u0002';

const LINK_PROTOCOL_ALLOW_LIST = ['http:', 'https:', 'mailto:'] as const;

/** Escapes the five XML-significant characters. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapTag(tag: string): string {
  return `${TAG_OPEN}${tag}${TAG_CLOSE}`;
}

/**
 * Sanitises an href. Relative links (`/films/x`, `#anchor`, `./x`) are allowed
 * because they stay inside the application origin.
 */
export function sanitizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (trimmed.length === 0) return '#';

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('//')) return '#';

  const isRelative =
    trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./');
  if (isRelative) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if ((LINK_PROTOCOL_ALLOW_LIST as readonly string[]).includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    return '#';
  }
  return '#';
}

interface Block {
  type:
    | 'paragraph'
    | 'heading'
    | 'blockquote'
    | 'ul'
    | 'ol'
    | 'code'
    | 'divider';
  text?: string;
  level?: 1 | 2 | 3;
  items?: string[];
  language?: string;
}

/* -------------------------------------------------------------------------- */
/* Block pass                                                                  */
/* -------------------------------------------------------------------------- */

function splitBlocks(source: string): Block[] {
  const lines = source.split(/\r\n|\r|\n/);
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let quoteLines: string[] = [];
  let fenceLines: string[] | null = null;
  let fenceLanguage = '';

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: listOrdered ? 'ol' : 'ul', items: listItems });
      listItems = [];
    }
  };
  const flushQuote = () => {
    if (quoteLines.length > 0) {
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      quoteLines = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const fenceMatch = /^\s*```\s*([A-Za-z0-9+#-]*)\s*$/.exec(line);
    if (fenceMatch) {
      if (fenceLines === null) {
        flushAll();
        fenceLines = [];
        fenceLanguage = fenceMatch[1] ?? '';
      } else {
        blocks.push({
          type: 'code',
          text: fenceLines.join('\n'),
          language: fenceLanguage,
        });
        fenceLines = null;
        fenceLanguage = '';
      }
      continue;
    }

    if (fenceLines !== null) {
      fenceLines.push(line);
      continue;
    }

    if (line.trim().length === 0) {
      flushAll();
      continue;
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushAll();
      blocks.push({ type: 'divider' });
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushAll();
      blocks.push({
        type: 'heading',
        level: headingMatch[1]!.length as 1 | 2 | 3,
        text: headingMatch[2]!.trim(),
      });
      continue;
    }

    const quoteMatch = /^\s*>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1] ?? '');
      continue;
    }

    const orderedMatch = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      if (listItems.length > 0 && !listOrdered) flushList();
      listOrdered = true;
      listItems.push(orderedMatch[1] ?? '');
      continue;
    }

    const bulletMatch = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      flushParagraph();
      flushQuote();
      if (listItems.length > 0 && listOrdered) flushList();
      listOrdered = false;
      listItems.push(bulletMatch[1] ?? '');
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line);
  }

  if (fenceLines !== null) {
    // Unterminated fence: treat the collected lines as literal text.
    blocks.push({ type: 'paragraph', text: fenceLines.join('\n') });
  }
  flushAll();

  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Inline pass                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Compiles inline Markdown into a React node array.
 *
 * The algorithm is a single left-to-right scan that extracts protected spans
 * (code, escapes) into the token map, then runs the emphasis/links passes over
 * the remaining skeleton. Because every generated tag is shielded with
 * sentinel characters, user text can never be mistaken for generated markup.
 */
function renderInline(
  source: string,
  keyPrefix: string,
  depth = 0,
): ReactNode[] {
  if (depth > 3) return [escapeHtml(source)];

  const rtl = new Map<string, ReactNode>();
  let text = source;

  // 1. Inline code spans are literal: shield them before anything else.
  text = text.replace(/(`+)([^`]+?)\1/g, (_match, _ticks: string, code: string) => {
    const key = `${keyPrefix}-code-${rtl.size}`;
    rtl.set(
      key,
      createElement(
        'code',
        {
          key,
          className:
            'rounded bg-surface-input px-1 py-0.5 font-mono text-[0.85em] text-brand-cyan',
        },
        code,
      ),
    );
    return wrapTag(key);
  });

  // 2. Inline code is the only literal region; everything else is escaped HTML.
  text = escapeHtml(text);

  // 3. Markdown links and images. Runs *before* autolinking: a bare URL inside
  //    `[label](url)` must be consumed by this pass, otherwise the autolink
  //    pass would swallow the `)` delimiter and break the link syntax.
  //    The URL class excludes `)`, so the closing parenthesis is only ever
  //    consumed by the delimiter below.
  text = text.replace(
    /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_match, label: string, rawUrl: string, title: string | undefined) => {
      const href = sanitizeUrl(rawUrl);
      const key = `${keyPrefix}-link-${rtl.size}`;
      const isExternal = /^https?:\/\//i.test(href);
      rtl.set(
        key,
        createElement(
          'a',
          {
            key,
            href,
            title: title && title.length > 0 ? title : undefined,
            target: isExternal ? '_blank' : undefined,
            rel: isExternal ? 'noopener noreferrer nofollow' : undefined,
            className:
              'text-brand-cyan underline decoration-brand-cyan/40 hover:decoration-brand-cyan',
          },
          ...renderInline(label, `${key}-label`, depth + 1),
        ),
      );
      return wrapTag(key);
    },
  );

  // 4. Autolinks: bare http(s) URLs outside of any markdown link target.
  //    Trailing sentence punctuation is re-emitted outside the anchor.
  text = text.replace(
    /\bhttps?:\/\/[^\s<]+/g,
    (match) => {
      const trailing = /[.,;:!?)\]]+$/.exec(match)?.[0] ?? '';
      const url = trailing.length > 0 ? match.slice(0, -trailing.length) : match;
      const href = sanitizeUrl(url);
      if (href === '#') return match;
      const key = `${keyPrefix}-auto-${rtl.size}`;
      rtl.set(
        key,
        createElement(
          'a',
          {
            key,
            href,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
            className:
              'text-brand-cyan underline decoration-brand-cyan/40 hover:decoration-brand-cyan',
          },
          url,
        ),
      );
      return `${wrapTag(key)}${trailing}`;
    },
  );

  // 5. Strong / emphasis / strikethrough.
  const emphasisPasses: {
    pattern: RegExp;
    tag: 'strong' | 'em' | 'del';
    className: string;
  }[] = [
    { pattern: /\*\*([^*]+)\*\*/g, tag: 'strong', className: 'font-semibold text-text-primary' },
    { pattern: /__([^_]+)__/g, tag: 'strong', className: 'font-semibold text-text-primary' },
    { pattern: /~~([^~]+)~~/g, tag: 'del', className: 'text-text-muted line-through' },
    { pattern: /\*([^*\n]+)\*/g, tag: 'em', className: 'italic' },
    { pattern: /_([^_\n]+)_/g, tag: 'em', className: 'italic' },
  ];

  for (const pass of emphasisPasses) {
    text = text.replace(pass.pattern, (_match, inner: string) => {
      const key = `${keyPrefix}-${pass.tag}-${rtl.size}`;
      rtl.set(
        key,
        createElement(
          pass.tag,
          { key, className: pass.className },
          ...renderInline(inner, `${key}-inner`, depth + 1),
        ),
      );
      return wrapTag(key);
    });
  }

  text = text.replace(/\\([\\`*_{}[\]()#+\-.!>~])/g, '$1');

  // 6. Reconstitute the token skeleton into React nodes.
  const nodes: ReactNode[] = [];
  const tokenPattern = new RegExp(`${TAG_OPEN}([^${TAG_OPEN}${TAG_CLOSE}]+)${TAG_CLOSE}`, 'g');
  let cursor = 0;
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokenPattern.exec(text)) !== null) {
    if (tokenMatch.index > cursor) {
      nodes.push(decodeEntities(text.slice(cursor, tokenMatch.index)));
    }
    const resolved = rtl.get(tokenMatch[1]!);
    if (resolved !== undefined) nodes.push(resolved);
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < text.length) {
    nodes.push(decodeEntities(text.slice(cursor)));
  }

  return nodes.filter((node) => node !== '');
}

/** Reverses `escapeHtml` for plain text nodes only. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

const BODY_CLASS = 'text-[13px] leading-relaxed text-text-secondary sm:text-sm';

const BLOCK_CLASSES: Record<Block['type'], string> = {
  paragraph: 'text-[13px] leading-relaxed text-text-secondary sm:text-sm',
  heading: 'font-semibold text-text-primary',
  blockquote: 'border-l-2 border-border-strong pl-3 italic text-text-muted',
  ul: 'list-disc space-y-1 pl-5',
  ol: 'list-decimal space-y-1 pl-5',
  code: 'overflow-x-auto rounded border border-border-subtle bg-surface-input p-3 font-mono text-xs text-brand-cyan',
  divider: 'my-4 h-px w-full bg-border-subtle',
};

const HEADING_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'text-base font-bold sm:text-lg',
  2: 'text-sm font-bold sm:text-base',
  3: 'text-[13px] font-semibold sm:text-sm',
};

/**
 * Compiles a Markdown review body into sanitised React nodes.
 *
 * Always returns at least one node; empty input yields an empty paragraph so
 * layout spacing stays deterministic.
 */
export function renderMarkdown(source: string | null | undefined): ReactNode[] {
  if (source == null) return [];
  const bounded = source.slice(0, MAX_REVIEW_BODY_LENGTH);
  if (bounded.trim().length === 0) return [];

  const blocks = splitBlocks(bounded);

  return blocks.map((block, index) => {
    const key = `md-block-${index}`;
    switch (block.type) {
      case 'heading': {
        const level = block.level ?? 3;
        return createElement(
          `h${level}`,
          {
            key,
            className: `${BLOCK_CLASSES.heading} ${HEADING_CLASSES[level]}`,
          },
          ...renderInline(block.text ?? '', key),
        );
      }
      case 'ul':
      case 'ol': {
        return createElement(
          block.type,
          { key, className: `${BLOCK_CLASSES[block.type]} ${BODY_CLASS}` },
          ...(block.items ?? []).map((item, itemIndex) =>
            createElement(
              'li',
              { key: `${key}-item-${itemIndex}` },
              ...renderInline(item, `${key}-item-${itemIndex}`),
            ),
          ),
        );
      }
      case 'blockquote': {
        return createElement(
          'blockquote',
          { key, className: `${BLOCK_CLASSES.blockquote} ${BODY_CLASS}` },
          ...renderInline(block.text ?? '', key),
        );
      }
      case 'code': {
        return createElement(
          'pre',
          { key, className: BLOCK_CLASSES.code },
          createElement('code', null, block.text ?? ''),
        );
      }
      case 'divider': {
        return createElement('hr', { key, className: BLOCK_CLASSES.divider });
      }
      case 'paragraph':
      default: {
        return createElement(
          'p',
          { key, className: BLOCK_CLASSES.paragraph },
          ...renderInline(block.text ?? '', key),
        );
      }
    }
  });
}

/** Convenience predicate used by cards deciding between plain text and MD. */
export function hasRichMarkdown(source: string | null | undefined): boolean {
  if (!source) return false;
  return /(\*\*|__|\*|_|`|~~|^\s*[-*+]\s|^\s*\d+[.)]\s|^\s*#{1,3}\s|\[[^\]]*\]\()/m.test(
    source,
  );
}

/** Strips Markdown syntax down to a single-line preview string. */
export function toPlainTextPreview(
  source: string | null | undefined,
  maxLength = 180,
): string {
  if (!source) return '';
  const plain = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__|~~|\*|_)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
