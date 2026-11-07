/**
 * Convert a platform's problem HTML into structured, source-faithful parts:
 * statement (Markdown), examples (plain text) and constraints (one per line).
 * Pure DOM — no network, no rewriting of wording.
 */
export interface ProblemContent {
  statementMarkdown: string | null;
  examples: string[];
  constraints: string[];
}

const EXAMPLE_RE = /^examples?\s*\d*\s*:?\s*$/i;
const EXAMPLE_INLINE_RE = /^examples?\s*\d*\s*:/i;
const CONSTRAINTS_RE = /^constraints?\s*:?/i;
const TAIL_RE = /^(follow[\s-]?up|note|expected (time|auxiliary)|your task)\b/i;

const clean = (s: string) => s.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
  if (!(node instanceof Element)) return '';
  const kids = () => [...node.childNodes].map(inline).join('');
  switch (node.tagName.toLowerCase()) {
    case 'strong': case 'b': { const t = kids().trim(); return t ? `**${t}**` : ''; }
    case 'em': case 'i': { const t = kids().trim(); return t ? `*${t}*` : ''; }
    case 'code': return `\`${kids().replace(/`/g, "'")}\``;
    case 'sup': return `^${kids()}`;
    case 'sub': return `_${kids()}`;
    case 'br': return '\n';
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      return /^https?:\/\//.test(href) ? `[${kids()}](${href})` : kids();
    }
    case 'img': {
      const src = node.getAttribute('src') ?? '';
      return /^https:\/\//.test(src) ? `![${node.getAttribute('alt') ?? 'image'}](${src})` : '';
    }
    default: return kids();
  }
}

function block(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'pre') return '```text\n' + (el.textContent ?? '').replace(/ /g, ' ').trim() + '\n```';
  if (tag === 'ul' || tag === 'ol') {
    return [...el.children].filter((c) => c.tagName === 'LI').map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${clean(inline(li))}`).join('\n');
  }
  if (/^h[1-6]$/.test(tag)) return `### ${clean(inline(el))}`;
  if (tag === 'img') return inline(el);
  const hasBlocks = [...el.children].some((c) => /^(P|DIV|PRE|UL|OL|TABLE)$/.test(c.tagName));
  if (hasBlocks) return [...el.childNodes].map((c) => (c instanceof Element ? block(c) : clean(inline(c)))).filter(Boolean).join('\n\n');
  return clean(inline(el));
}

/** Plain text of an example block, preserving line breaks. */
function exampleText(el: Element): string {
  if (el.tagName === 'PRE') return clean(el.textContent ?? '');
  const lines: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { lines.push(n.textContent ?? ''); return; }
    if (!(n instanceof Element)) return;
    if (n.tagName === 'BR') { lines.push('\n'); return; }
    const isBlock = /^(P|DIV|PRE|LI)$/.test(n.tagName);
    if (isBlock) lines.push('\n');
    n.childNodes.forEach(walk);
    if (isBlock) lines.push('\n');
  };
  walk(el);
  return clean(lines.join('').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n'));
}

function constraintLines(el: Element): string[] {
  if (el.tagName === 'UL' || el.tagName === 'OL') return [...el.querySelectorAll('li')].map((li) => clean(inline(li))).filter(Boolean);
  return clean(inline(el))
    .split('\n')
    .map((s) => s.trim())
    .map((s) => s.replace(/^\*\*constraints?\s*:?\s*\*\*\s*/i, '').replace(/^constraints?\s*:\s*/i, ''))
    .filter(Boolean);
}

export function extractProblemContent(html: string | null | undefined): ProblemContent {
  if (!html?.trim()) return { statementMarkdown: null, examples: [], constraints: [] };
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root')!;
  // Flatten single wrapper divs (GfG wraps everything in one <div>).
  let container: Element = root;
  while (container.children.length === 1 && container.firstElementChild!.tagName === 'DIV' && !container.firstElementChild!.classList.contains('example-block')) {
    container = container.firstElementChild!;
  }

  const statement: string[] = [];
  const tail: string[] = [];
  const examples: string[] = [];
  const constraints: string[] = [];
  let mode: 'statement' | 'example' | 'constraints' | 'tail' = 'statement';
  let current: string[] | null = null;

  const flush = () => {
    if (current?.length) examples.push(current.join('\n').trim());
    current = null;
  };

  for (const node of [...container.childNodes]) {
    if (!(node instanceof Element)) {
      const t = clean(node.textContent ?? '');
      if (t && mode === 'statement') statement.push(t);
      continue;
    }
    const text = clean(node.textContent ?? '');
    if (!text && node.tagName !== 'IMG') continue;

    if (EXAMPLE_INLINE_RE.test(text) && node.tagName !== 'PRE') {
      flush();
      mode = 'example';
      current = [];
      const rest = text.replace(EXAMPLE_INLINE_RE, '').trim();
      if (rest && !EXAMPLE_RE.test(text)) current.push(exampleText(node).replace(EXAMPLE_INLINE_RE, '').trim());
      continue;
    }
    if (CONSTRAINTS_RE.test(text)) {
      flush();
      mode = 'constraints';
      const own = constraintLines(node);
      constraints.push(...own);
      continue;
    }
    if (TAIL_RE.test(text) && mode !== 'statement') {
      flush();
      mode = 'tail';
      tail.push(block(node));
      continue;
    }

    switch (mode) {
      case 'statement':
        statement.push(block(node));
        break;
      case 'example':
        // "Examples:" followed by several <pre> blocks → one example each.
        if (node.tagName === 'PRE' && current && current.length) flush(), (current = []);
        (current ??= []).push(exampleText(node));
        break;
      case 'constraints':
        constraints.push(...constraintLines(node));
        break;
      case 'tail':
        tail.push(block(node));
    }
  }
  flush();

  const statementMarkdown = clean([...statement, ...tail].filter(Boolean).join('\n\n'));
  return {
    statementMarkdown: statementMarkdown || null,
    examples: examples.filter(Boolean).slice(0, 30),
    constraints: constraints.slice(0, 60),
  };
}
