/**
 * Deterministic README generator. No AI, no invented content: every section
 * is emitted only when the source data exists (and the user opted in).
 */
import { LANGUAGES, type LanguageId } from './languages';
import type { ReadmePrefs, SubmissionCapture } from './schemas';
import { PLATFORM_FOLDERS } from './repo-paths';
import { sql50Entry } from './sql50';

const PLATFORM_NAMES = { leetcode: 'LeetCode', gfg: 'GeeksforGeeks' } as const;

export interface ReadmeSolution {
  language: LanguageId;
  /** Path relative to the README's directory. */
  relativePath: string;
}

/** Escape text for inline Markdown (titles, table cells). */
export function escapeInline(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/[\\`*_{}[\]#|!]/g, (c) => `\\${c}`)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/** Neutralise raw HTML in untrusted Markdown while leaving fenced code intact. */
export function neutralizeHtml(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((chunk) => (chunk.startsWith('```') ? chunk : chunk.replace(/</g, '&lt;').replace(/>/g, '&gt;')))
    .join('')
    .trim();
}

/** A Markdown image line pointing at an https URL (alt text without brackets/newlines). */
export const IMAGE_LINE = /^!\[[^\][\n]{0,200}\]\(https:\/\/[^\s()<>]+\)$/;

function fence(text: string, lang = 'text'): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${lang}\n${text.replace(/\s+$/, '')}\n${ticks}`;
}

export function generateReadme(
  capture: SubmissionCapture,
  prefs: ReadmePrefs,
  solutions: ReadmeSolution[],
): string {
  const p = capture.problem;
  const heading = p.id && capture.platform === 'leetcode' ? `${p.id}. ${p.title}` : p.title;
  const lines: string[] = [`# ${escapeInline(heading)}`, ''];

  const rows: [string, string][] = [['Platform', PLATFORM_NAMES[capture.platform]]];
  if (p.id) rows.push(['Problem ID', escapeInline(p.id)]);
  if (p.difficulty) rows.push(['Difficulty', escapeInline(p.difficulty)]);
  const langLabels = [...new Set(solutions.map((s) => LANGUAGES[s.language].label))].sort();
  rows.push(['Language' + (langLabels.length > 1 ? 's' : ''), langLabels.map(escapeInline).join(', ')]);
  if (p.topics.length) rows.push(['Topics', p.topics.map(escapeInline).join(', ')]);
  const plan = capture.platform === 'leetcode' ? sql50Entry(p.slug) : null;
  if (plan) rows.push(['Study plan', `[LeetCode SQL 50](https://leetcode.com/studyplan/top-sql-50/) · ${escapeInline(plan.section)} · ${plan.position} of ${plan.of}`]);
  rows.push(['Link', `[${escapeInline(p.url)}](${encodeURI(p.url)})`]);
  rows.push(['Submitted', `${capture.submittedAt.slice(0, 10)} · submission \`${capture.submissionId}\``]);

  lines.push('| | |', '|---|---|', ...rows.map(([k, v]) => `| **${k}** | ${v} |`), '');

  if (prefs.includeStatement && p.statementMarkdown?.trim()) {
    lines.push('## Problem Statement', '', neutralizeHtml(p.statementMarkdown), '');
  }
  if (prefs.includeExamples && p.examples.length) {
    lines.push('## Examples', '');
    p.examples.forEach((ex, i) => {
      // Diagrams (https images from the platform) render as images above the example text.
      const all = ex.split('\n');
      const images = all.map((l) => l.trim()).filter((l) => IMAGE_LINE.test(l));
      const text = all.filter((l) => !IMAGE_LINE.test(l.trim())).join('\n').trim();
      lines.push(`### Example ${i + 1}`, '');
      for (const img of images) lines.push(img, '');
      if (text) lines.push(fence(text), '');
    });
  }
  if (prefs.includeConstraints && p.constraints.length) {
    lines.push('## Constraints', '', ...p.constraints.map((c) => `- ${neutralizeHtml(c).replace(/\r?\n/g, ' ')}`), '');
  }

  lines.push('## Solution' + (solutions.length > 1 ? 's' : ''), '');
  for (const s of [...solutions].sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    lines.push(`- [${LANGUAGES[s.language].label}](${s.relativePath.split('/').map(encodeURIComponent).join('/')})`);
  }
  lines.push(
    '',
    '---',
    '',
    `<sub>Synced by CodeSync from ${PLATFORM_NAMES[capture.platform]} (${PLATFORM_FOLDERS[capture.platform]}). ` +
      'Problem content belongs to its original platform.</sub>',
    '',
  );
  return lines.join('\n');
}
