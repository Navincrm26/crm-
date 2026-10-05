# Navin CRM — MERN source export

A standalone conversion of the Navin CRM workflows to **MongoDB Atlas + Express + React + Node.js**. The MongoDB native driver is used; Mongoose is not required. It does not require ChatGPT, Vercel or Supabase accounts for staff login.

**Delivery status:** React production build and 12 local tests pass. This is source for your own deployment, not an already deployed or production-certified release. Real MongoDB, SMTP delivery and full browser end-to-end tests remain to be run against your isolated setup. No existing CRM site, PR, production database or DNS was changed by this export. Real records, passwords and live service keys are not included.

## 1. Requirements

- Node.js 24 LTS recommended (minimum 22.12).
- MongoDB Atlas database and a database user with `readWrite` on your CRM database.
- SMTP credentials for staff private password setup emails. You can bootstrap your own Admin locally before configuring SMTP.

## 2. Connect your MongoDB Atlas

1. In Atlas create/select your cluster. Create a **database user**, separate from your Atlas dashboard login.
2. Add your development computer's public IP (later your server's outbound IP) to the project's IP access list.
3. Choose **Connect → Drivers → Node.js** and copy the connection string.
4. Extract this ZIP and open a terminal in the `navin-crm-mern` folder.
5. Run:

```bash
npm ci
cp .env.example .env
```

On Windows, copy `.env.example` to `.env` in File Explorer instead.

Edit `.env` using a text editor. Replace the example value with your own connection string, including the database name `navin_crm`:

```dotenv
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/navin_crm?retryWrites=true&w=majority
APP_ORIGIN=http://localhost:3000
PORT=3000
NODE_ENV=development
```

Keep the password in `.env` only. Percent-encode special characters in the username/password part of the URI. Do not put the URI in frontend source or a `VITE_` variable. Official Atlas connection guide: https://www.mongodb.com/docs/atlas/connect-to-database-deployment/

## 3. Run the application

```bash
npm run build
npm start
```

Open **http://localhost:3000**. Keep that terminal running. For frontend development with automatic reload use `npm run dev` instead (UI port 3000, API port 3001).

## 4. Create your first Admin

In a **second terminal**, in the same project folder, run this command after replacing the example email and name with your own:

```bash
npm run bootstrap -- --email you@yourcompany.com --name "Your Name" --print-link
```

The command creates the first Admin and prints a **private, single-use link valid for one hour**. Open the complete link in your browser and choose your own password. Then sign in with that email and password. There is no default password. The first Admin browser device is approved during first login.

Do not share or record the private link in a public place. To send the link through configured SMTP, omit `--print-link`. To issue a replacement Admin setup link use the same email with `--resend`. If the Admin browser's device cookie has been lost, an authorized server operator can also add `--reset-devices` together with `--resend`; this revokes all Admin sessions/devices so the next successfully authenticated browser becomes the first approved device again. This is an operator recovery command, not a staff login feature.

## 5. Set up staff email/password login

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and verified `MAIL_FROM` in `.env`, then restart the server. Usually port 587 uses `SMTP_SECURE=false` with required STARTTLS; port 465 uses `true`.

As Admin:

1. Open **Users & roles → Create user**. Enter the staff member's own email/name, role, permitted views, departments and device limit.
2. Click **Send setup email**. The user opens their private email link and sets their own password. Admin does not see it.
3. After the password is set, click **Activate**.
4. Staff sign in. Their browser first shows **waiting for Admin approval**.
5. Open **Devices & sessions**, verify the requested device and click **Approve**. The user signs in again.

Marketing opens its assigned overview; department users open their task dashboard. Only permitted navigation appears. Admin sees all records without switching into another person's identity. The server checks access on every API/file request and protected page route. Ordinary staff email addresses are accepted: there is no `TEST identity required` restriction in this standalone app.

## Included workflows

- Customer details, owner assignment, follow-up dates and notes.
- Enquiries and stage updates; progressed enquiries above untouched enquiries; first three enquiry cards with More.
- Department task queues, individual assignment, replies, expected dates, sampling items/courier/AWB, production readiness, dispatch and payment follow-up fields.
- Admin task closure with a reason; it does not close the linked enquiry.
- Quote calculation using model/material/hook/trading masters, margin, manual rate, customer-safe print/PDF (use browser Save as PDF).
- Model, material, hook, trading and sample masters; XLSX import with preview.
- Screenshot text extraction in the browser. OCR downloads English model data on first use; verify extracted text before saving.
- Protected attachments in MongoDB GridFS, audit history, records export.
- Admin user management, role/view intersection, account activation/disable, force logout, device approval/revocation and 1–2 device limits.
- Persistent hashed server sessions; HttpOnly cookies; 45-minute idle expiry, 7-day absolute expiry. Polling does not extend activity.

## Data storage and imports

All business records, users, password hashes, session hashes, roles, devices and audit events are in MongoDB. Files are in GridFS in the same database. The browser holds session/device cookies, temporary UI state and optional OCR cache, not the authoritative CRM records.

The included export/import is **not an automatic migration from your live Sites/Supabase schema**. Existing records must be exported, mapped and reviewed separately. See [docs/DATA_IMPORT.md](docs/DATA_IMPORT.md). The app starts with empty business data. Creating this ZIP has not copied or altered real enquiries.

## Tests

```bash
npm run build
npm test
```

12 local tests cover passwords, input validation, pricing, workflows, anonymous access, direct-route login protection, CSRF origin checks and safe user serialization. They do **not** verify Mongo query semantics or transactions.

For real MongoDB tests, create a separate empty Atlas database named `navin_crm_test_<your_suffix>`, give the test database user permission on that database, and set `TEST_MONGODB_URI` in `.env` to it. Never point this to your CRM database.

```bash
npm run test:integration
```

The suite refuses names outside that pattern and refuses a database with existing collections. It creates dummy identities and records and drops **only that dedicated empty-at-start test database** in cleanup. Email delivery is captured in memory; real SMTP must be tested separately. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for exact delivery-time results and remaining checks.

## Deployment on your server / AWS

Run `npm ci`, `npm run build`, then `npm start`, with a process manager or the supplied Dockerfile. Use your own HTTPS reverse proxy/load balancer; set `NODE_ENV=production` and `APP_ORIGIN=https://your-crm-domain`. Set `TRUST_PROXY=1` only for exactly one trusted reverse proxy. Serve UI/API on the same origin. Supply secrets through the server environment and restrict Atlas access to the server's outbound IP. Domain/DNS/hosting changes are not performed by this ZIP.

Back up the entire database including `attachments.files` and `attachments.chunks`; the Admin JSON export includes record metadata, not file bytes. Use an isolated pilot and finish the listed security/business checks before importing real data or giving access to staff.

## Source layout

| Folder | Purpose |
| --- | --- |
| `client/src` | React screens and styling |
| `server/src` | Express API, authorization, sessions, MongoDB/GridFS, SMTP |
| `server/scripts` | First Admin bootstrap and reviewed JSON importer |
| `shared` | Department workflows and quotation calculation |
| `tests` | Local tests and optional real-Atlas integration test |
| `docs` | Data import contract and verification status |

The source was mapped from the TEST CRM snapshot `0a72b38e817eeee613e344aa626bedf4a5fec837`. UI components and backend were rewritten for MERN; exact visual parity and every historical workflow combination have not been certified. Package lock is included. Third-party packages retain their own licenses.
