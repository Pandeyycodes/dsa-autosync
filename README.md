<div align="center">

# DSA AutoSync

**Solve a problem. It's on GitHub.**

A Chrome extension that automatically commits your **accepted** LeetCode and GeeksforGeeks solutions to your GitHub repository, with a clean README for every problem.

</div>

---

## What it does

You submit a solution on **LeetCode** or **GeeksforGeeks**. If it's **Accepted**, DSA AutoSync:

1. confirms the verdict with the platform itself (not just the green banner on screen);
2. fetches the **exact code you submitted**;
3. commits it to your repository, in the right folder, with a README.

Wrong answers, compile errors and time-outs are ignored. Nothing is uploaded unless it's accepted.

## What you get on GitHub

```
DSA/
├── LeetCode/
│   ├── Array/
│   │   └── 0001-two-sum/
│   │       ├── README.md        ← problem, link, examples, diagrams
│   │       ├── solution.py
│   │       └── solution.cpp     ← solved it in another language? it sits next to it
│   └── Tree/
│       └── 0104-maximum-depth-of-binary-tree/
└── GeeksForGeeks/
    └── Linked-List/
        └── reverse-a-linked-list/
```

**SQL can go to its own repository** (optional). Problems from LeetCode's **[SQL 50](https://leetcode.com/studyplan/top-sql-50/)** study plan are filed under its official sections, in study order:

```
sql-solutions/
└── LeetCode/
    ├── 01-Select/                                    (5)
    │   └── 1757-recyclable-and-low-fat-products/
    │       ├── README.md                             ← includes "SQL 50 · Select · 1 of 5"
    │       └── solution.sql
    ├── 02-Basic-Joins/                               (9)
    ├── 03-Basic-Aggregate-Functions/                 (8)
    ├── 04-Sorting-and-Grouping/                      (7)
    ├── 05-Advanced-Select-and-Joins/                 (7)
    ├── 06-Subqueries/                                (7)
    └── 07-Advanced-String-Functions-Regex-Clause/    (7)
```

**SQL problems outside SQL 50** go to a folder named after the main SQL concept your solution uses, because LeetCode tags every SQL problem only "Database". The concept is picked by fixed rules (no AI), most advanced first: Data-Modification, Window-Functions, CTE, Subqueries, Joins, Set-Operations, Aggregation, Date-Functions, String-Functions, Conditional-Logic, Basic-Select. Such a problem stays in the folder it first landed in, even if you solve it again a different way. Prefer Easy / Medium / Hard folders instead? Choose **By difficulty**.

Each problem's **README** contains:
- the title, difficulty, topics and a link to the problem;
- the full statement, examples (with diagrams) and constraints, if you turn them on;
- links to every language you've solved it in.

## Features

| | |
|---|---|
| ✅ **Accepted only** | The verdict is checked through the platform's own data for that exact submission |
| 📄 **Exact code** | Fetches the submitted code, never what's left in the editor |
| 🗂️ **Organised folders** | Platform → topic → problem (SQL by concept: Joins, Aggregation …). By-difficulty and flat layouts are also available |
| 🧾 **Auto README** | Statement, examples, diagrams and constraints, copied as-is, nothing invented |
| 🗄️ **Separate SQL repo** | Optionally send SQL solutions to their own repository |
| 🔁 **No duplicates** | The same code is never committed twice. Changed code updates the file (configurable) |
| 🔒 **Secure GitHub access** | GitHub App with access only to the repositories you pick. Your token is encrypted |
| ♻️ **Reliable** | Retries if GitHub or your network is down. Nothing is lost if the browser restarts |

**Languages:** C, C++, Python, Java, JavaScript, TypeScript, Go, Rust, C#, Kotlin, PHP, Ruby, Swift and SQL (MySQL, PostgreSQL, MS SQL, Oracle).

## How to use it

1. **Install** the extension. During development: load `dist/` at `chrome://extensions`.
2. Click the icon → **Connect GitHub** → approve.
3. **Install the app** on the repository you want to use. The dashboard links to it.
4. In **Dashboard → Repository**, pick the repository and click **Save**. Optionally, also pick a separate SQL repository.
5. Solve problems. Watch them appear under **Activity** and on GitHub.

Optional: **Dashboard → General → README content** adds the full problem statement, examples and constraints.

> The problem text belongs to LeetCode and GeeksforGeeks. It's off by default, and a private repository is recommended if you turn it on.

## Run it yourself

You need **Node.js 20+** and **Chrome**.

```bash
npm install
cd backend && npm install && cp .env.example .env    # then fill in your GitHub App keys
npm run dev                                          # backend at http://localhost:8787
```

In a second terminal, from the project folder:

```bash
npm run build                                        # extension → dist/
```

Then load `dist/` at `chrome://extensions` with Developer mode on.

The full walkthrough — creating the GitHub App, hosting the backend, publishing to the Chrome Web Store — is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## How it works

```
 LeetCode / GfG page          Chrome extension                 Backend (no database)         GitHub
┌────────────────────┐      ┌──────────────────────┐        ┌──────────────────────┐      ┌──────────┐
│ you click Submit   │ ───▶ │ checks the verdict,  │ ─────▶ │ builds the folder    │ ───▶ │ 1 commit │
│                    │      │ gets the exact code  │        │ path + README        │      │ per      │
└────────────────────┘      └──────────────────────┘        └──────────────────────┘      │ solution │
                                                                                          └──────────┘
```

- **The extension** watches problem pages, verifies accepted submissions and queues uploads.
- **The backend** holds the GitHub App secret and commits to GitHub on your behalf. It stores nothing: your GitHub access is sealed (encrypted) inside your session.

## Privacy & security

- No passwords are ever entered into or stored by DSA AutoSync.
- LeetCode and GfG use your existing browser login; nothing is shared from them except the accepted solution.
- GitHub access is limited to the repositories you choose. Revoke it any time from the dashboard or GitHub settings.
- No database, no tracking, no analytics.

Details: **[PRIVACY.md](PRIVACY.md)** · **[SECURITY.md](SECURITY.md)**

## Project structure

```
src/
  content/      reads LeetCode and GeeksforGeeks submissions
  background/   upload queue, retries, GitHub sign-in
  dashboard/    dashboard pages
  popup/        toolbar popup
  shared/       folder paths, README generator, validation
backend/        small API that talks to GitHub
```

## Development

| Command | What it does |
|---|---|
| `npm run build` | Build the extension into `dist/` (with safety checks) |
| `npm test` | Extension tests |
| `cd backend && npm run dev` | Run the backend with auto-reload |
| `cd backend && npm test` | Backend tests |

## Known limitations

- **GeeksforGeeks** has no public API. The adapter follows how GfG's own website works, so if GfG changes it, syncing pauses safely: it uploads nothing rather than the wrong thing.
- **LeetCode premium** problems you don't have access to are synced without the statement.
- Built for **personal use**: no database, so history lives in your browser.

---

<div align="center">
Built with React, TypeScript, Vite, Tailwind CSS and Fastify.
</div>
