# NexusTask MVP PRD

## Original problem statement
Make me website for internal task tracker and a dashbord. Board that contains many task. Task ca have subtask. Task can convert to subtask and vice verca. Step of each board can customize. Master of board can add member. Each board has many members. Members can access many boards. Super user can set permission and role for member. Can CRUD task or subtask. Dashboard can view summary of each board or member. Can add comment and assign task to member. Can set due date of each task. Can move card. Can mention member and there is notification when move, comment, edit contains or assign task

## Architecture decisions
- React single-page experience with a FastAPI starter backend retained for future persistence.
- LocalStorage demo persistence keeps boards and tasks available between refreshes while the MVP is reviewed.
- Dark obsidian workspace UI with Outfit headings, Plus Jakarta Sans body text, and indigo/emerald status accents.

## Personas
- Super User: sees the whole workspace and manages permissions.
- Board Master: owns board setup, members, stages, and delivery.
- Member: focuses on assigned work, comments, mentions, and due dates.

## Core requirements
- Sign-in/register view plus selectable demo personas.
- Dashboard with board health, recent activity, overdue signal, and member workload.
- Kanban board with Backlog, To Do, In Progress, Review, Done.
- Create, inspect, assign, prioritize, date, and move tasks.
- Subtask progress, task detail comments, and notification center.
- Responsive desktop and mobile layouts with testable controls.

## Implemented
- 2026-08-23: Built NexusTask auth entry screen with email/password form and Super User, Board Master, and Member demo entry points.
- 2026-08-23: Built overview dashboard with four metrics, project momentum, activity feed, and workload cards.
- 2026-08-23: Built Product launch Kanban with five stages, task cards, stage movement, search, and create-task modal.
- 2026-08-23: Built My tasks table, notification center/popover, task detail modal, comments surface, subtask progress, and conversion control.
- 2026-08-23: Added responsive styling, motion, accessible labels, and unique data-testid hooks for critical flows.
- 2026-08-23: Added working comment feedback/count updates, mark-all-read state, mobile sidebar opening, role-aware greetings, and `/api/health`.
- 2026-08-23: Added task descriptions on cards and detail views, description editing, local attachment selection for new tasks, descriptions, and comments.
- 2026-08-23: Added live dashboard deadline breakdown for tasks due this week, due this month, and overdue tasks.
- 2026-08-23: Added Super Admin/Admin full dashboards, Member assigned-task dashboards, public board visibility, Admin board creation, required-reason cancellation, cross-board linked cards, and task change-log tabs.

## Prioritized backlog
- P0: Connect auth and workspace entities to MongoDB-backed API.
- P0: Persist boards, tasks, members, comments, and notifications server-side.
- P0: Persist role permissions, cancellation reasons, linked cards, and change logs through the authenticated API.
- P1: Add board stage editor and member/role administration screens.
- P1: Add true drag-and-drop ordering and task/subtask conversion logic.
- P1: Replace local attachment metadata with authenticated object storage and file references.
- P2: Add email provider delivery for notification events.

## Next tasks
1. Replace LocalStorage demo persistence with authenticated API calls.
2. Add Super User permissions matrix and Board Master member management.
3. Add real email delivery and notification preferences.