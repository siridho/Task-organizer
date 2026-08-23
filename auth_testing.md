# Authentication Testing Playbook

The current MVP uses local demo sign-in and LocalStorage persistence. Verify:

1. Login form accepts a valid email and password.
2. Invalid short passwords show an inline error.
3. Each demo role opens the workspace with the correct role label.
4. Logout returns to the auth screen.
5. Refresh preserves an authenticated demo session.

API-backed JWT authentication and email delivery are planned for the next phase.