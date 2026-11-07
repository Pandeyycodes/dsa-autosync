/**
 * LeetCode "SQL 50" study plan (leetcode.com/studyplan/top-sql-50) — the
 * official sections and problem order, as returned by LeetCode's
 * studyPlanV2Detail("top-sql-50"). SQL 50 problems are filed under these
 * sections, numbered so folders sort in study order.
 */
export const SQL50_SECTIONS: { folder: string; name: string; slugs: string[] }[] = [
  {
    folder: '01-Select',
    name: 'Select',
    slugs: ['recyclable-and-low-fat-products', 'find-customer-referee', 'big-countries', 'article-views-i', 'invalid-tweets'],
  },
  {
    folder: '02-Basic-Joins',
    name: 'Basic Joins',
    slugs: [
      'replace-employee-id-with-the-unique-identifier', 'product-sales-analysis-i', 'customer-who-visited-but-did-not-make-any-transactions',
      'rising-temperature', 'average-time-of-process-per-machine', 'employee-bonus', 'students-and-examinations',
      'managers-with-at-least-5-direct-reports', 'confirmation-rate',
    ],
  },
  {
    folder: '03-Basic-Aggregate-Functions',
    name: 'Basic Aggregate Functions',
    slugs: [
      'not-boring-movies', 'average-selling-price', 'project-employees-i', 'percentage-of-users-attended-a-contest',
      'queries-quality-and-percentage', 'monthly-transactions-i', 'immediate-food-delivery-ii', 'game-play-analysis-iv',
    ],
  },
  {
    folder: '04-Sorting-and-Grouping',
    name: 'Sorting and Grouping',
    slugs: [
      'number-of-unique-subjects-taught-by-each-teacher', 'user-activity-for-the-past-30-days-i', 'product-sales-analysis-iii',
      'classes-with-at-least-5-students', 'find-followers-count', 'biggest-single-number', 'customers-who-bought-all-products',
    ],
  },
  {
    folder: '05-Advanced-Select-and-Joins',
    name: 'Advanced Select and Joins',
    slugs: [
      'the-number-of-employees-which-report-to-each-employee', 'primary-department-for-each-employee', 'triangle-judgement',
      'consecutive-numbers', 'product-price-at-a-given-date', 'last-person-to-fit-in-the-bus', 'count-salary-categories',
    ],
  },
  {
    folder: '06-Subqueries',
    name: 'Subqueries',
    slugs: [
      'employees-whose-manager-left-the-company', 'exchange-seats', 'movie-rating', 'restaurant-growth',
      'friend-requests-ii-who-has-the-most-friends', 'investments-in-2016', 'department-top-three-salaries',
    ],
  },
  {
    folder: '07-Advanced-String-Functions-Regex-Clause',
    name: 'Advanced String Functions / Regex / Clause',
    slugs: [
      'fix-names-in-a-table', 'patients-with-a-condition', 'delete-duplicate-emails', 'second-highest-salary',
      'group-sold-products-by-the-date', 'list-the-products-ordered-in-a-period', 'find-users-with-valid-e-mails',
    ],
  },
];

export interface Sql50Entry {
  folder: string;
  section: string;
  /** 1-based position inside the section, and the section size. */
  position: number;
  of: number;
}

const INDEX = new Map<string, Sql50Entry>();
for (const s of SQL50_SECTIONS) s.slugs.forEach((slug, i) => INDEX.set(slug, { folder: s.folder, section: s.name, position: i + 1, of: s.slugs.length }));

export function sql50Entry(slug: string): Sql50Entry | null {
  return INDEX.get(slug) ?? null;
}
