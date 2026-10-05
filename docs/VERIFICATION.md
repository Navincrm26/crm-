# Delivery verification — 2026-10-05

| Check | Result |
| --- | --- |
| Dependency installation with lock file | Passed |
| React/Vite production build | Passed |
| Local unit / anonymous HTTP tests | 12 passed, 0 failed |
| Backend syntax check | Passed |
| Real MongoDB replica-set startup in build environment | Blocked: `open: Operation not permitted`; no controls bypassed |
| Atlas integration test | Included but not executed; user will configure Atlas |
| SMTP delivery and mailbox setup link | Not verified; requires user's SMTP |
| Browser visual/responsive/print/OCR tests | Not executed |
| Existing Sites/Supabase record migration | Not performed |
| Production deployment, DNS or PR merge | Not performed |

The anonymous HTTP tests use a minimal stub that cannot return records. They establish pre-database auth/origin guards, not real authenticated RBAC or MongoDB behavior. The optional Atlas integration suite exercises real database queries and transactions, private password setup (mail captured), duplicates, activation, device approval and limit, cross-owner read/write/file denial, Admin task closure, force logout, idle expiry without poll renewal and account disable. It still does not replace the manual tests below.

Before a staff pilot verify on isolated TEST accounts:

1. Deliver setup email through actual SMTP; expired/used/invalid links must fail; failed delivery must show an error. No password appears in Admin UI.
2. Confirm Admin, Marketing and each required department dashboard and effective role/view intersection. Attempt unauthorized URLs/APIs/file downloads directly.
3. Confirm customer owner reassignment updates access to linked records and files. Test multiple departments, unassigned queues, specific assignees and attempted changes to other staff records.
4. Confirm device revocation, simultaneous approvals at the device cap, force logout, password change, account disable, 45-minute idle and 7-day absolute expiry.
5. Exercise real customer → enquiry → task/reply → quotation → dispatch/payment workflows and verify the imported historical cases, formulas, print layout and file access.
6. Test desktop/mobile browsers, OCR model download and XLSX preview/import. Large screens/role combinations and exact historical parity remain unverified.
7. Back up/restore MongoDB including GridFS. Delete or disable all temporary pilot identities and remove dummy records after verification.

Known implementation limits: only Admin/Marketing/Department roles are implemented; department accounts have task views (up to three departments). Lists currently return at most 10,000 records. History is capped at 500 entries per record. Device identity is a browser cookie (clearing it requests a new device). Audit logging is a separate write from most business mutations; it is not a tamper-evident external ledger. JSON export/import omits attachment bytes and authentication secrets. The quotation financial-year prefix is `NP/26-27`; change it deliberately in the counter configuration for the next year. Further workflow parity and production hardening should be checked before rollout.

Dependency review: the first production-dependency audit reported a Nodemailer high-severity advisory and ExcelJS/uuid moderate advisories. Nodemailer was updated to 10.0.14 and local message composition was checked without sending mail. ExcelJS 4.4.0 still brings a uuid bounds-check advisory for v3/v5/v6 buffer APIs; the app does not call those APIs. A final clean audit is not claimed. Re-run `npm audit --omit=dev` before deployment and review the remaining upstream dependency findings.
