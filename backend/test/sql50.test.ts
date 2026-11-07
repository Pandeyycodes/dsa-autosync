import { describe, expect, it } from 'vitest';
import { generateReadme } from '../../src/shared/readme';
import { buildSolutionPaths } from '../../src/shared/repo-paths';
import { SQL50_SECTIONS, sql50Entry } from '../../src/shared/sql50';
import { connect, setup, syncRequest } from './helpers';

const sqlPath = (slug: string, id: string, code = 'SELECT 1;') =>
  buildSolutionPaths('', 'platform/topic/problem', { platform: 'leetcode', problemId: id, slug, title: slug, topics: ['Database'], language: 'sql', difficulty: 'Easy', code }).solutionFile;

describe('LeetCode SQL 50 layout', () => {
  it('covers exactly the 50 official problems in 7 sections', () => {
    expect(SQL50_SECTIONS).toHaveLength(7);
    const all = SQL50_SECTIONS.flatMap((s) => s.slugs);
    expect(all).toHaveLength(50);
    expect(new Set(all).size).toBe(50);
  });

  it('files SQL 50 problems under their official section, regardless of the SQL used', () => {
    expect(sqlPath('recyclable-and-low-fat-products', '1757')).toBe('LeetCode/01-Select/1757-recyclable-and-low-fat-products/solution.sql');
    expect(sqlPath('rising-temperature', '197')).toBe('LeetCode/02-Basic-Joins/0197-rising-temperature/solution.sql');
    // uses a window function, but SQL 50 says "Subqueries" — the plan wins
    expect(sqlPath('department-top-three-salaries', '185', 'SELECT * FROM (SELECT DENSE_RANK() OVER (ORDER BY salary) r FROM Employee) t')).toBe('LeetCode/06-Subqueries/0185-department-top-three-salaries/solution.sql');
    expect(sqlPath('second-highest-salary', '176')).toBe('LeetCode/07-Advanced-String-Functions-Regex-Clause/0176-second-highest-salary/solution.sql');
  });

  it('falls back to SQL-concept folders for problems outside SQL 50', () => {
    expect(sqlPath('combine-two-tables', '175', 'SELECT * FROM Person p LEFT JOIN Address a ON p.personId = a.personId')).toBe('LeetCode/Joins/0175-combine-two-tables/solution.sql');
  });

  it('adds a "Study plan" row to the README', () => {
    const c = syncRequest({
      language: 'sql', languageVariant: 'MySQL', code: 'SELECT 1;',
      problem: { id: '197', title: 'Rising Temperature', slug: 'rising-temperature', url: 'https://leetcode.com/problems/rising-temperature/', difficulty: 'Easy', topics: ['Database'], statementMarkdown: null, examples: [], constraints: [] },
    }).capture;
    const md = generateReadme(c, { includeStatement: false, includeExamples: false, includeConstraints: false }, [{ language: 'sql', relativePath: 'solution.sql' }]);
    expect(md).toContain('| **Study plan** | [LeetCode SQL 50](https://leetcode.com/studyplan/top-sql-50/) · Basic Joins · 4 of 9 |');
    expect(sql50Entry('two-sum')).toBeNull();
  });

  it('syncs an SQL 50 problem into its section folder', async () => {
    const { app, gh } = await setup();
    const { code } = gh.addUser('octocat', 1);
    gh.addRepo('octocat/sql', 10, { installedFor: ['octocat'] });
    const auth = { authorization: `Bearer ${await connect(app, code)}` };
    const res = await app.inject({
      method: 'POST', url: '/v1/sync', headers: auth,
      payload: syncRequest(
        {
          submissionId: '9', language: 'sql', languageVariant: 'MySQL', code: 'SELECT product_id FROM Products WHERE low_fats = "Y" AND recyclable = "Y";\n',
          problem: { id: '1757', title: 'Recyclable and Low Fat Products', slug: 'recyclable-and-low-fat-products', url: 'https://leetcode.com/problems/recyclable-and-low-fat-products/', difficulty: 'Easy', topics: ['Database'], statementMarkdown: null, examples: [], constraints: [] },
        },
        { repo: { repositoryId: '10', branch: 'main', rootFolder: '', layout: 'platform/topic/problem' } },
      ),
    });
    expect(res.json().outcome).toBe('created');
    expect(gh.files('octocat/sql').has('LeetCode/01-Select/1757-recyclable-and-low-fat-products/solution.sql')).toBe(true);
  });
});
