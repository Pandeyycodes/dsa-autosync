# CodeSync Privacy Policy

_Last updated: 7 November 2026_

CodeSync is a browser extension with a small companion server ("the CodeSync service"). It copies coding solutions you have had **accepted** on LeetCode or GeeksforGeeks into a GitHub repository you choose. **The CodeSync service has no database and stores nothing about you.**

## 1. What the extension reads

The extension only runs on `leetcode.com/problems/*`, `www.geeksforgeeks.org/problems/*` and `practice.geeksforgeeks.org/problems/*`, and only for the platforms you enable. On those pages, using your existing login on that platform, it reads:

- The **submission ID** of each submission you make, and its **final verdict**.
- For **accepted** submissions only, the **exact source code** the platform stored for that submission, plus its language.
- Problem **metadata**: title, ID, URL, difficulty and topics. If you turn the options on, it also reads the **statement, examples and constraints**.

It does not read your editor while you type, your browsing history, other websites, or your platform passwords or cookies.

## 2. What is sent to the CodeSync service

Data is sent only when an accepted submission is uploaded, or when you manage your repository settings:

- The accepted source code, its SHA-256 hash, language, submission ID and timestamp.
- The problem metadata above, including the statement, examples and constraints **only if you enabled them**.
- Your target repository, branch, folder and README and duplicate preferences.
- Your **sealed session token** (see §4).

The service uses this data **in memory only**, to create the files in your GitHub repository, and then discards it. It does not write it to any database or file.

Rejected submissions are **never** sent.

## 3. What is sent to GitHub

Through the GitHub API, using your authorization, the service writes the solution file and a `README.md` to the repository and branch you selected. It also reads repository and branch lists and checks whether a file already exists. Public repositories are visible to everyone. GitHub's own privacy statement applies to data on GitHub.

## 4. Where your GitHub credentials live

- When you connect GitHub, the service receives your GitHub token. It **encrypts it with AES-256-GCM** using a key that only the server holds, and returns the result to the extension as an opaque "sealed session".
- The extension stores this sealed session but **cannot read the token inside it**. It sends the sealed session with each request; the server decrypts it in memory, calls GitHub, and forgets it.
- The server never logs tokens, session tokens or OAuth codes.
- The GitHub App only requests repository **Contents (read & write)** and **Metadata (read)**, and only for repositories you install it on.

## 5. What is stored in your browser

`chrome.storage.local` on your device holds:
- Your preferences and selected repository.
- The sealed session.
- Your GitHub username and avatar URL.
- A history of detected submissions, capped at the 500 most recent.

For an accepted submission that has not been uploaded yet, the history entry includes its code. The code is removed from the entry once the upload succeeds. Uninstalling the extension deletes all of this.

## 6. What the server keeps

| Data | Retention |
|---|---|
| Your account, code, tokens, history | **Not stored** |
| A short-lived in-memory record of recent uploads (to avoid duplicate commits) and of used sign-in codes | Lost on server restart; at most 1 hour |
| Hosting-provider request logs: method, path (no query strings), IP address, status, time | Per the host's log retention (typically 7–30 days) |

## 7. Disconnecting and deleting your data

- **Dashboard → Repository → Disconnect** revokes CodeSync's authorization at GitHub, which makes every sealed session useless, and clears your local session.
- **Dashboard → General → Delete account data** does the same and also erases your local history.
- You can also revoke from **GitHub → Settings → Applications → Authorized GitHub Apps → CodeSync → Revoke**, or uninstall the app.
- Files already committed to your repository are yours and are not deleted.

## 8. Problem content

Problem statements, examples and constraints belong to LeetCode and GeeksforGeeks. CodeSync leaves them out by default. If you enable them, make sure your use is permitted, for example by keeping the repository private.

## 9. Contact

See the support contact in the Chrome Web Store listing, or the repository's issue tracker.
