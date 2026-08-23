# NexusTask MVP PRD

## Original problem statement
Make me website for internal task tracker and a dashboard. Board that contains many task. Task can have subtask. Task can convert to subtask and vice versa. Step of each board can customize. Master of board can add member. Each board has many members. Members can access many boards. Super user can set permission and role for member. Can CRUD task or subtask. Dashboard can view summary of each board or member. Can add comment and assign task to member. Can set due date of each task. Can move card. Can mention member and there is notification when move, comment, edit contains or assign task.

## Architecture
- React SPA (refactored into `pages/*` + `components/*`) + FastAPI backend + MongoDB.
- JWT httpOnly cookie authentication (12h access token, samesite=none, secure).
- Emergent Object Storage for file attachments (init at startup with EMERGENT_LLM_KEY).
- Casual-business light theme (green/blue accents, white surfaces, Sora + Manrope typography).

## Personas
- **Super Admin**: manages workspace-wide roles/permissions, sees every board.
- **Admin**: sees every board, creates boards, manages board membership.
- **Member**: sees only boards they're a member of; personal dashboard shows only assigned tasks.

## Core requirements
- Auth (register/login/logout/me) with real password hashing.
- Boards with configurable stages + member roster (owner/editor/viewer).
- Tasks with subtasks; task⇄subtask conversion; cross-board linking; cancellation with mandatory reason.
- Comments with @mention parsing that spawns notifications.
- Notifications for move/comment/edit/assign/mention.
- Dashboard summarizes visible/active/due_week/due_month/overdue/completed and per-board rollups.
- Real file attachments via Emergent Object Storage.

## Implemented — 2026-08-23
- MongoDB-backed FastAPI with 13/13 backend tests passing.
- Auth: JWT cookies, register/login/logout/me, protected routes.
- Boards: CRUD + custom stages editor + member management.
- Tasks: CRUD + move stage + subtask conversion + cancel-with-reason + cross-board links.
- Comments: @mention parsing + notifications (assign / mention / comment / edit).
- File uploads: Emergent Object Storage integration for attachments.
- Dashboard: real summary endpoint powering metrics + board health.
- Super Admin `Members & roles` page for role changes.
- Frontend fully refactored — App.js is now a 25-line gate; UI split into modular pages/components.
- Seeded super admin + demo admin + 2 members + 2 sample boards with tasks.
- Fixed duplicate `Canceled` column edge case (stages already containing it).

## Deferred (P1/P2 next)
- P1: Drag-and-drop card ordering (currently uses dropdown stage selector).
- P1: Real @mention autocomplete (currently text-parsed `@localpart` / `@name.slug`).
- P2: Email notification delivery (Resend/SendGrid).
- P2: Password reset flow.
- P2: Task filters + saved views on boards.

## Test credentials
See `/app/memory/test_credentials.md`.
