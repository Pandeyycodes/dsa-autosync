/**
 * Topic folder for SQL solutions.
 *
 * LeetCode and GeeksforGeeks tag virtually every SQL problem only "Database",
 * so the platform tags can't split them. Instead we classify by the main SQL
 * concept the *submitted solution* uses — fixed, deterministic rules (no AI).
 * The most advanced concept wins, in this order.
 */
export const SQL_TOPICS = [
  'Data-Modification',
  'Window-Functions',
  'CTE',
  'Subqueries',
  'Joins',
  'Set-Operations',
  'Aggregation',
  'Date-Functions',
  'String-Functions',
  'Conditional-Logic',
  'Basic-Select',
] as const;
export type SqlTopic = (typeof SQL_TOPICS)[number];

/** Remove comments and string literals so keywords inside them don't count. */
function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

const RULES: [SqlTopic, RegExp][] = [
  ['Data-Modification', /^\s*(?:update|delete|insert|alter|create)\b/im],
  ['Window-Functions', /\bover\s*\(/i],
  ['CTE', /\bwith\s+(?:recursive\s+)?[`"[\]\w]+\s*(?:\([^)]*\)\s*)?as\s*\(/i],
  ['Subqueries', /\(\s*select\b/i],
  ['Joins', /\bjoin\b|\bfrom\s+[`"[\]\w.]+(?:\s+(?:as\s+)?\w+)?\s*,\s*[`"[\]\w.]+/i],
  ['Set-Operations', /\b(?:union|intersect|except)\b/i],
  ['Aggregation', /\bgroup\s+by\b|\bhaving\b|\b(?:count|sum|avg|min|max)\s*\(/i],
  ['Date-Functions', /\b(?:datediff|date_add|date_sub|date_format|adddate|subdate|timestampdiff|extract|to_char|date_trunc|year|month|day|week|interval)\s*\(|\binterval\s+\d/i],
  ['String-Functions', /\b(?:concat|concat_ws|upper|lower|substring|substr|left|right|trim|ltrim|rtrim|replace|length|char_length|group_concat|string_agg|regexp|regexp_like|instr|locate)\s*\(|\b(?:like|regexp|rlike)\b/i],
  ['Conditional-Logic', /\bcase\s+when\b|\bcase\b[\s\S]+?\bwhen\b|\b(?:if|ifnull|coalesce|nullif|isnull)\s*\(/i],
];

export function sqlTopic(code: string): SqlTopic {
  const sql = stripNoise(code);
  for (const [topic, re] of RULES) if (re.test(sql)) return topic;
  return 'Basic-Select';
}
