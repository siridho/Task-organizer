"""NexusTask backend regression tests (pytest)."""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else "https://board-task-manager.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = ("admin@nexus.local", "demo123")
MAYA = ("maya@nexus.local", "demo123")
NOAH = ("noah@nexus.local", "demo123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s, r


# ---------- Auth ----------
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_login_admin_and_me(self):
        s, r = _login(*ADMIN)
        data = r.json()
        assert data["email"] == ADMIN[0]
        assert data["role"] == "super_admin"
        # cookie set
        assert "access_token" in s.cookies
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200
        assert me.json()["email"] == ADMIN[0]

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": "wrong"}, timeout=15)
        assert r.status_code == 401


# ---------- Boards ----------
class TestBoards:
    def test_list_and_create_and_patch(self):
        s, _ = _login(*ADMIN)
        r = s.get(f"{API}/boards", timeout=15)
        assert r.status_code == 200
        boards = r.json()
        names = [b["name"] for b in boards]
        assert "Product launch" in names
        assert "Website refresh" in names
        for b in boards:
            assert "stages" in b and "members" in b

        # Create new board
        cr = s.post(f"{API}/boards", json={"name": "TEST_Board", "color": "violet"}, timeout=15)
        assert cr.status_code == 200
        bid = cr.json()["id"]

        # Patch name+stages
        new_stages = ["Backlog", "Doing", "Review", "Done", "Canceled", "Archived"]
        pr = s.patch(f"{API}/boards/{bid}", json={"name": "TEST_Board2", "stages": new_stages}, timeout=15)
        assert pr.status_code == 200
        got = pr.json()
        assert got["name"] == "TEST_Board2"
        assert got["stages"] == new_stages

        # cleanup
        s.delete(f"{API}/boards/{bid}", timeout=15)

    def test_member_add_remove(self):
        s, _ = _login(*ADMIN)
        cr = s.post(f"{API}/boards", json={"name": "TEST_Members"}, timeout=15)
        bid = cr.json()["id"]

        users = s.get(f"{API}/users", timeout=15).json()
        noah = next(u for u in users if u["email"] == NOAH[0])

        ar = s.post(f"{API}/boards/{bid}/members", json={"user_id": noah["id"], "board_role": "viewer"}, timeout=15)
        assert ar.status_code == 200
        found = any(str(m["user_id"]) == noah["id"] and m["board_role"] == "viewer" for m in ar.json()["members"])
        assert found

        dr = s.delete(f"{API}/boards/{bid}/members/{noah['id']}", timeout=15)
        assert dr.status_code == 200
        assert not any(str(m["user_id"]) == noah["id"] for m in dr.json()["members"])

        s.delete(f"{API}/boards/{bid}", timeout=15)


# ---------- Tasks ----------
class TestTasks:
    @pytest.fixture(scope="class")
    def admin_ctx(self):
        s, _ = _login(*ADMIN)
        boards = s.get(f"{API}/boards", timeout=15).json()
        board = next(b for b in boards if b["name"] == "Product launch")
        return s, board

    def test_create_list_get(self, admin_ctx):
        s, board = admin_ctx
        cr = s.post(f"{API}/tasks", json={"board_id": board["id"], "title": "TEST_TaskA"}, timeout=15)
        assert cr.status_code == 200
        task_id = cr.json()["id"]

        lr = s.get(f"{API}/tasks", params={"board_id": board["id"]}, timeout=15)
        assert lr.status_code == 200
        assert any(t["id"] == task_id for t in lr.json())

        gr = s.get(f"{API}/tasks/{task_id}", timeout=15)
        assert gr.status_code == 200
        data = gr.json()
        assert "subtasks" in data
        assert "comments" in data
        assert "history" in data

        s.delete(f"{API}/tasks/{task_id}", timeout=15)

    def test_patch_moves_and_cancel_reason(self, admin_ctx):
        s, board = admin_ctx
        # add "Canceled" stage
        stages = list(board["stages"])
        if "Canceled" not in stages:
            stages.append("Canceled")
            s.patch(f"{API}/boards/{board['id']}", json={"stages": stages}, timeout=15)

        cr = s.post(f"{API}/tasks", json={"board_id": board["id"], "title": "TEST_Cancelable"}, timeout=15)
        tid = cr.json()["id"]

        # Move to canceled without reason - 400
        bad = s.patch(f"{API}/tasks/{tid}", json={"stage": "Canceled"}, timeout=15)
        assert bad.status_code == 400

        # With reason -> success + history entry
        ok = s.patch(f"{API}/tasks/{tid}", json={"stage": "Canceled", "cancel_reason": "TEST reason"}, timeout=15)
        assert ok.status_code == 200
        det = s.get(f"{API}/tasks/{tid}", timeout=15).json()
        assert any("Canceled" in h.get("text", "") for h in det["history"])

        s.delete(f"{API}/tasks/{tid}", timeout=15)

    def test_convert_subtask(self, admin_ctx):
        s, board = admin_ctx
        p = s.post(f"{API}/tasks", json={"board_id": board["id"], "title": "TEST_Parent"}, timeout=15).json()
        c = s.post(f"{API}/tasks", json={"board_id": board["id"], "title": "TEST_Child"}, timeout=15).json()

        # self-parent -> 400
        bad = s.post(f"{API}/tasks/{p['id']}/convert", json={"parent_task_id": p["id"]}, timeout=15)
        assert bad.status_code == 400

        # Make child a subtask of parent
        r = s.post(f"{API}/tasks/{c['id']}/convert", json={"parent_task_id": p["id"]}, timeout=15)
        assert r.status_code == 200
        assert r.json()["parent_task_id"] == p["id"]

        # Promote back
        r2 = s.post(f"{API}/tasks/{c['id']}/convert", json={"parent_task_id": None}, timeout=15)
        assert r2.status_code == 200
        assert not r2.json().get("parent_task_id")

        s.delete(f"{API}/tasks/{c['id']}", timeout=15)
        s.delete(f"{API}/tasks/{p['id']}", timeout=15)


# ---------- Comments + Notifications ----------
class TestCommentsNotifications:
    def test_mention_creates_notification(self):
        s_admin, _ = _login(*ADMIN)
        boards = s_admin.get(f"{API}/boards", timeout=15).json()
        board = next(b for b in boards if b["name"] == "Product launch")
        users = s_admin.get(f"{API}/users", timeout=15).json()
        noah = next(u for u in users if u["email"] == NOAH[0])

        # create task assigned to noah -> assign notification
        t = s_admin.post(f"{API}/tasks", json={
            "board_id": board["id"], "title": "TEST_Mention", "assignee_id": noah["id"]
        }, timeout=15).json()

        # add comment mentioning noah
        c = s_admin.post(f"{API}/tasks/{t['id']}/comments", json={"body": "hey @noah please look"}, timeout=15)
        assert c.status_code == 200

        # login as noah, expect notifications
        s_noah, _ = _login(*NOAH)
        notifs = s_noah.get(f"{API}/notifications", timeout=15).json()
        types = {n["type"] for n in notifs}
        assert "mention" in types
        assert "assign" in types

        # read-all
        rr = s_noah.patch(f"{API}/notifications/read-all", timeout=15)
        assert rr.status_code == 200
        after = s_noah.get(f"{API}/notifications", timeout=15).json()
        assert all(n["read"] for n in after)

        s_admin.delete(f"{API}/tasks/{t['id']}", timeout=15)


# ---------- Files ----------
class TestFiles:
    def test_upload_download_roundtrip(self):
        s, _ = _login(*ADMIN)
        payload = b"hello nexus 12345"
        files = {"file": ("test.txt", io.BytesIO(payload), "text/plain")}
        up = s.post(f"{API}/files/upload", files=files, timeout=60)
        if up.status_code == 503:
            pytest.skip("storage unavailable")
        assert up.status_code == 200, up.text
        data = up.json()
        assert "id" in data and "storage_path" in data
        fid = data["id"]

        dl = s.get(f"{API}/files/{fid}/download", timeout=60)
        assert dl.status_code == 200
        assert dl.content == payload


# ---------- Dashboard ----------
class TestDashboard:
    def test_summary_shape(self):
        s, _ = _login(*ADMIN)
        r = s.get(f"{API}/dashboard/summary", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("visible", "active", "due_week", "due_month", "overdue", "completed", "boards"):
            assert k in d["totals"], f"missing totals.{k}"
        assert isinstance(d["boards"], list) and len(d["boards"]) >= 2
        for b in d["boards"]:
            assert "total" in b and "done" in b


# ---------- Role visibility ----------
class TestRoleVisibility:
    def test_member_task_scope_and_forbidden_writes(self):
        s_noah, _ = _login(*NOAH)
        # No board_id -> only assigned tasks
        r = s_noah.get(f"{API}/tasks", timeout=15)
        assert r.status_code == 200
        tasks = r.json()
        # Every task must have noah as assignee
        me = s_noah.get(f"{API}/auth/me", timeout=15).json()
        for t in tasks:
            assert t.get("assignee_id") == me["id"]

        # Cannot create board
        bad = s_noah.post(f"{API}/boards", json={"name": "TEST_NoahBoard"}, timeout=15)
        assert bad.status_code == 403

        # Cannot change role
        users_admin, _ = _login(*ADMIN)
        users = users_admin.get(f"{API}/users", timeout=15).json()
        ava = next(u for u in users if u["email"] == "ava@nexus.local")
        bad2 = s_noah.patch(f"{API}/users/{ava['id']}/role", json={"role": "admin"}, timeout=15)
        assert bad2.status_code == 403

    def test_super_admin_can_change_role(self):
        s, _ = _login(*ADMIN)
        users = s.get(f"{API}/users", timeout=15).json()
        ava = next(u for u in users if u["email"] == "ava@nexus.local")
        original = ava["role"]
        r = s.patch(f"{API}/users/{ava['id']}/role", json={"role": "admin"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
        # restore
        s.patch(f"{API}/users/{ava['id']}/role", json={"role": original}, timeout=15)
