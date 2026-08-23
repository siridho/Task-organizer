# NexusTask — Internal Task Tracker

A full-stack task and board management app with role-based dashboards, customizable Kanban boards, subtask conversion, cross-board links, @mention notifications, and real file attachments.

**Stack:** React (CRA + Craco) · FastAPI · MongoDB · JWT cookie auth · Emergent Object Storage · Tailwind + custom "casual business" CSS.

---

## Features

- **Auth** — JWT httpOnly cookies (register/login/logout/me).
- **Roles** — Super Admin, Admin, Member (Super Admin can promote/demote from Members & roles page).
- **Boards** — Configurable stages per board, board-level member roster (owner/editor/viewer).
- **Tasks** — CRUD, priority, due date, assignee, description, attachments.
- **Drag-and-drop** — HTML5 native drag between Kanban columns for instant stage moves.
- **Subtasks** — Any task can become a subtask (or be promoted back) of another task.
- **Cancellation** — Requires a reason; entry added to the change log.
- **Comments + @mentions** — `@localpart` or `@name.slug` parsed into a real user; notification fired.
- **Notifications** — assign / mention / comment / edit / move — with unread badge in sidebar.
- **Email alerts** — Optional SendGrid delivery for the same events. Silently no-ops when key is blank.
- **Dashboard** — visible/active/due-this-week/due-this-month/overdue/completed metrics + per-board rollups.
- **File attachments** — real uploads via Emergent Object Storage (proxied download endpoint).

---

## Repository layout

```
/app
├── backend
│   ├── server.py            # All FastAPI routes + startup seeding
│   ├── requirements.txt
│   └── .env                 # Backend secrets (see below)
├── frontend
│   ├── package.json
│   ├── tailwind.config.js
│   ├── .env                 # REACT_APP_BACKEND_URL
│   └── src
│       ├── App.js
│       ├── App.css
│       ├── api.js
│       ├── auth/AuthContext.jsx
│       ├── pages/           # AuthScreen, Workspace, Dashboard, Board, MyTasks, Notifications, Members
│       └── components/      # TaskModal, AddTaskModal, BoardModal
├── memory
│   ├── PRD.md
│   └── test_credentials.md
└── README.md                # (this file)
```

---

## Seeded test accounts

All passwords: **`demo123`**.

| Role         | Email                | Name            |
|--------------|----------------------|-----------------|
| Super Admin  | admin@nexus.local    | Jordan Lee      |
| Admin        | maya@nexus.local     | Maya Chen       |
| Member       | noah@nexus.local     | Noah Williams   |
| Member       | ava@nexus.local      | Ava Patel       |

Two demo boards are seeded on first launch: **Product launch** and **Website refresh**.

---

## Environment variables

### `backend/.env`
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="nexus_task"
CORS_ORIGINS="*"
JWT_SECRET="<64-char hex string>"
ADMIN_EMAIL="admin@nexus.local"
ADMIN_PASSWORD="demo123"
FRONTEND_URL="https://your-frontend-url"      # exact origin used for CORS with credentials
EMERGENT_LLM_KEY="sk-emergent-xxxxxxxxxxxx"    # required for Object Storage file uploads

# SendGrid email alerts (leave blank to disable — in-app notifications still work)
SENDGRID_API_KEY=""
SENDGRID_SENDER=""                              # verified sender e.g. notifications@yourdomain.com
APP_URL=""                                      # link included in email bodies
```

Generate a JWT secret:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### `frontend/.env`
```
REACT_APP_BACKEND_URL=https://your-backend-url   # no trailing slash
WDS_SOCKET_PORT=443
```

> **Note on cookies:** the backend sets cookies with `SameSite=None; Secure`. During local development over HTTP some browsers will refuse those cookies — use HTTPS via a tunnel (ngrok/Cloudflare) or run frontend and backend behind the same origin.

---

## Local development

### 1. Prerequisites
- Python 3.11+
- Node 18+ and **yarn** (do not use npm)
- MongoDB 5+ running locally on `mongodb://localhost:27017`

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
# make sure backend/.env is populated (see above)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The FastAPI server exposes everything under **`/api`** (e.g. `GET /api/health`).
On startup it seeds the super admin + demo users + demo boards if the DB is empty.

### 3. Frontend
```bash
cd frontend
yarn install
yarn start                # starts on http://localhost:3000
```

Open http://localhost:3000, the login form is pre-filled with the super admin credentials — hit **Sign in**.

### 4. Sanity check
```bash
curl http://localhost:8001/api/health
# → {"status":"ok","service":"nexus-task"}
```

---

## Emergent platform (this environment)

If you are running inside the Emergent preview pod, services are managed by supervisor:

```bash
sudo supervisorctl status
sudo supervisorctl restart backend       # after backend/.env changes or new deps
sudo supervisorctl restart frontend      # after frontend/.env changes or yarn add
```

Logs:
```bash
tail -f /var/log/supervisor/backend.err.log
tail -f /var/log/supervisor/frontend.err.log
```

To deploy from Emergent, just click **Deploy** in the top-right of the workspace. The pipeline uses the `.env` files as-is — make sure `FRONTEND_URL`, `EMERGENT_LLM_KEY`, and `MONGO_URL` are set for production.

---

## Deploying to your own infra

### Option A — Docker Compose (recommended)

A ready-to-use `docker-compose.yml`, backend `Dockerfile`, and frontend `Dockerfile` are included at the repo root.

1. Copy the example envs and fill in secrets:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   # edit backend/.env — set JWT_SECRET, EMERGENT_LLM_KEY, (optional) SENDGRID_*
   ```
2. Bring the stack up:
   ```bash
   docker compose up --build
   ```
3. Visit http://localhost:3000 — the login form is pre-filled with the seeded super admin.

The compose file starts three services: **mongo** (with a named volume `mongo_data`), **backend** (FastAPI on `:8001`), and **frontend** (static React served with `serve` on `:3000`). The backend `MONGO_URL` is overridden inside compose to point at the `mongo` service.

### Option B — Split deploy (Render/Railway/Fly + Vercel/Netlify)

1. **Backend** on Render/Railway/Fly:
   - Runtime Python 3.11, install `backend/requirements.txt`, start with `uvicorn server:app --host 0.0.0.0 --port $PORT`.
   - Set env vars from `backend/.env`.
   - Point `MONGO_URL` at MongoDB Atlas.
2. **Frontend** on Vercel/Netlify:
   - Root directory `frontend`, build command `yarn build`, output `build/`.
   - Env var `REACT_APP_BACKEND_URL=https://<your-backend-domain>`.
3. Update `FRONTEND_URL` in the backend env to match the frontend origin (needed for cookie-based auth).

### Option C — Bare-metal (systemd + nginx)

- Reverse-proxy `/api` to `http://127.0.0.1:8001` and everything else to the built React `build/` folder.
- Run the backend as a systemd unit calling `uvicorn server:app --host 0.0.0.0 --port 8001`.
- Terminate HTTPS at nginx (SameSite=None cookies require HTTPS).

---

## API reference (short)

All routes are prefixed with `/api`.

**Auth**: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
**Users**: `GET /users`, `PATCH /users/{id}/role` (super_admin only)
**Boards**: `GET /boards`, `POST /boards`, `GET /boards/{id}`, `PATCH /boards/{id}`, `DELETE /boards/{id}`
**Board members**: `POST /boards/{id}/members`, `DELETE /boards/{id}/members/{user_id}`
**Tasks**: `GET /tasks?board_id=`, `POST /tasks`, `GET /tasks/{id}`, `PATCH /tasks/{id}`, `DELETE /tasks/{id}`, `POST /tasks/{id}/convert`
**Comments**: `POST /tasks/{id}/comments`
**Notifications**: `GET /notifications`, `PATCH /notifications/read-all`, `PATCH /notifications/{id}/read`
**Files**: `POST /files/upload` (multipart, field `file`), `GET /files/{id}/download`, `GET /files/{id}`
**Dashboard**: `GET /dashboard/summary`

---

## Troubleshooting

- **`401 Not authenticated` from every call** — cookie was not set. Check that both frontend and backend are HTTPS (SameSite=None + Secure) and that `axios` is called with `withCredentials: true` (already the case in `frontend/src/api.js`). Also confirm `FRONTEND_URL` in `backend/.env` matches the exact browser origin (no trailing slash).
- **File upload returns 503 `Storage unavailable`** — `EMERGENT_LLM_KEY` is missing or invalid in `backend/.env`. Restart the backend after setting it.
- **Frontend shows a blank page** — verify `REACT_APP_BACKEND_URL` in `frontend/.env`; then rebuild (env vars are baked at build time for CRA apps).
- **`ValueError: 'ObjectId' object is not iterable`** — should not occur; the `clean()` helper in `server.py` walks nested docs. If it reappears after a schema change, extend `clean()` accordingly.

---

## License

Internal / proprietary. Adjust before sharing publicly.
