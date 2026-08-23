"""NexusTask backend — FastAPI + MongoDB + JWT cookie auth + Emergent Object Storage."""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import re
import uuid
import logging
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from bson import ObjectId
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response as FastApiResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "*")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "nexustask"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="NexusTask API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("nexus")

# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(400, "Invalid id")

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    def _walk(v):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, dict):
            return {kk: _walk(vv) for kk, vv in v.items()}
        if isinstance(v, list):
            return [_walk(x) for x in v]
        return v
    d = _walk(dict(doc))
    if "_id" in d:
        d["id"] = d.pop("_id")
    d.pop("password_hash", None)
    return d

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_access_token(uid: str, email: str) -> str:
    return jwt.encode(
        {"sub": uid, "email": email, "type": "access",
         "exp": datetime.now(timezone.utc) + timedelta(hours=12)},
        JWT_SECRET, algorithm=JWT_ALGO,
    )

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=12 * 3600, path="/",
    )

def clear_auth_cookie(response: Response):
    response.delete_cookie("access_token", path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"_id": oid(payload["sub"])})
    if not user:
        raise HTTPException(401, "User not found")
    return clean(user)

def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Forbidden: insufficient role")
        return user
    return dep

# ---------- Object Storage ----------
_storage_key: Optional[str] = None

def init_storage(force: bool = False) -> Optional[str]:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        log.warning("EMERGENT_LLM_KEY not set — object storage disabled")
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        return _storage_key
    except Exception as e:
        log.error("Storage init failed: %s", e)
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Storage unavailable")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(503, "Storage unavailable")
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=4)
    name: str = Field(min_length=1)

class LoginIn(BaseModel):
    email: str
    password: str

class RoleUpdate(BaseModel):
    role: str

class BoardIn(BaseModel):
    name: str
    color: str = "violet"
    stages: Optional[List[str]] = None

class BoardUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    stages: Optional[List[str]] = None

class MemberIn(BaseModel):
    user_id: str
    board_role: str = "editor"

class TaskIn(BaseModel):
    board_id: str
    parent_task_id: Optional[str] = None
    title: str
    description: str = ""
    stage: Optional[str] = None
    priority: str = "Medium"
    due_date: Optional[str] = None
    assignee_id: Optional[str] = None
    links: List[str] = []
    attachments: List[str] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    stage: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assignee_id: Optional[str] = None
    cancel_reason: Optional[str] = None
    links: Optional[List[str]] = None
    attachments: Optional[List[str]] = None

class ConvertIn(BaseModel):
    parent_task_id: Optional[str] = None

class CommentIn(BaseModel):
    body: str

DEFAULT_STAGES = ["Backlog", "To Do", "In Progress", "Review", "Done"]

# ---------- Utilities ----------
async def log_change(task_id: str, actor: dict, text: str):
    await db.change_logs.insert_one({
        "task_id": ObjectId(task_id),
        "actor_id": ObjectId(actor["id"]),
        "actor_name": actor.get("name") or actor.get("email"),
        "text": text,
        "created_at": now_iso(),
    })

async def notify(user_ids: List[str], type_: str, message: str,
                 task_id: Optional[str] = None, board_id: Optional[str] = None,
                 actor: Optional[dict] = None):
    if not user_ids:
        return
    docs = []
    for uid in user_ids:
        if not uid:
            continue
        if actor and str(actor["id"]) == str(uid):
            continue
        docs.append({
            "user_id": ObjectId(uid),
            "type": type_,
            "message": message,
            "task_id": ObjectId(task_id) if task_id else None,
            "board_id": ObjectId(board_id) if board_id else None,
            "actor_name": actor.get("name") if actor else None,
            "read": False,
            "created_at": now_iso(),
        })
    if docs:
        await db.notifications.insert_many(docs)

def parse_mentions(body: str) -> List[str]:
    return re.findall(r"@([A-Za-z0-9_.-]+)", body or "")

async def user_can_access_board(user: dict, board: dict) -> bool:
    if user["role"] in ("super_admin", "admin"):
        return True
    for m in board.get("members", []):
        if str(m.get("user_id")) == user["id"]:
            return True
    return False

async def user_can_edit_board(user: dict, board: dict) -> bool:
    if user["role"] in ("super_admin", "admin"):
        return True
    for m in board.get("members", []):
        if str(m.get("user_id")) == user["id"] and m.get("board_role") in ("owner", "editor"):
            return True
    return False

# ---------- Auth Routes ----------
@api.get("/health")
async def health():
    return {"status": "ok", "service": "nexus-task"}

@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": "member",
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    token = make_access_token(str(res.inserted_id), email)
    set_auth_cookie(response, token)
    doc["_id"] = res.inserted_id
    return clean(doc)

@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = make_access_token(str(user["_id"]), email)
    set_auth_cookie(response, token)
    return clean(user)

@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookie(response)
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------- Users ----------
@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}).sort("name", 1).to_list(500)
    return [clean(u) for u in users]

@api.patch("/users/{user_id}/role")
async def update_role(user_id: str, payload: RoleUpdate,
                      actor: dict = Depends(require_role("super_admin"))):
    if payload.role not in ("super_admin", "admin", "member"):
        raise HTTPException(400, "Invalid role")
    r = await db.users.update_one({"_id": oid(user_id)}, {"$set": {"role": payload.role}})
    if r.matched_count == 0:
        raise HTTPException(404, "User not found")
    updated = await db.users.find_one({"_id": oid(user_id)})
    return clean(updated)

# ---------- Boards ----------
@api.get("/boards")
async def list_boards(user: dict = Depends(get_current_user)):
    if user["role"] in ("super_admin", "admin"):
        cursor = db.boards.find({}).sort("created_at", 1)
    else:
        cursor = db.boards.find({"members.user_id": oid(user["id"])}).sort("created_at", 1)
    boards = await cursor.to_list(500)
    return [clean(b) for b in boards]

@api.post("/boards")
async def create_board(payload: BoardIn, user: dict = Depends(require_role("super_admin", "admin"))):
    doc = {
        "name": payload.name.strip(),
        "color": payload.color or "violet",
        "stages": payload.stages or list(DEFAULT_STAGES),
        "members": [{"user_id": oid(user["id"]), "board_role": "owner"}],
        "owner_id": oid(user["id"]),
        "created_at": now_iso(),
    }
    res = await db.boards.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)

@api.get("/boards/{board_id}")
async def get_board(board_id: str, user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"_id": oid(board_id)})
    if not board:
        raise HTTPException(404, "Board not found")
    if not await user_can_access_board(user, board):
        raise HTTPException(403, "No access")
    return clean(board)

@api.patch("/boards/{board_id}")
async def update_board(board_id: str, payload: BoardUpdate, user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"_id": oid(board_id)})
    if not board:
        raise HTTPException(404, "Board not found")
    if not await user_can_edit_board(user, board):
        raise HTTPException(403, "Forbidden")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        await db.boards.update_one({"_id": oid(board_id)}, {"$set": updates})
    updated = await db.boards.find_one({"_id": oid(board_id)})
    return clean(updated)

@api.delete("/boards/{board_id}")
async def delete_board(board_id: str, user: dict = Depends(require_role("super_admin", "admin"))):
    await db.boards.delete_one({"_id": oid(board_id)})
    await db.tasks.delete_many({"board_id": oid(board_id)})
    return {"ok": True}

@api.post("/boards/{board_id}/members")
async def add_member(board_id: str, payload: MemberIn, user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"_id": oid(board_id)})
    if not board:
        raise HTTPException(404, "Board not found")
    if not await user_can_edit_board(user, board):
        raise HTTPException(403, "Forbidden")
    if payload.board_role not in ("owner", "editor", "viewer"):
        raise HTTPException(400, "Invalid board_role")
    await db.boards.update_one(
        {"_id": oid(board_id)},
        {"$pull": {"members": {"user_id": oid(payload.user_id)}}}
    )
    await db.boards.update_one(
        {"_id": oid(board_id)},
        {"$push": {"members": {"user_id": oid(payload.user_id), "board_role": payload.board_role}}}
    )
    updated = await db.boards.find_one({"_id": oid(board_id)})
    return clean(updated)

@api.delete("/boards/{board_id}/members/{user_id}")
async def remove_member(board_id: str, user_id: str, user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"_id": oid(board_id)})
    if not board:
        raise HTTPException(404, "Board not found")
    if not await user_can_edit_board(user, board):
        raise HTTPException(403, "Forbidden")
    await db.boards.update_one(
        {"_id": oid(board_id)},
        {"$pull": {"members": {"user_id": oid(user_id)}}}
    )
    updated = await db.boards.find_one({"_id": oid(board_id)})
    return clean(updated)

# ---------- Tasks ----------
async def enrich_task(t: dict) -> dict:
    d = clean(t)
    for k in ("board_id", "parent_task_id", "assignee_id", "created_by"):
        if d.get(k):
            d[k] = str(d[k])
    d["links"] = [str(x) for x in d.get("links", [])]
    d["attachments"] = [str(x) for x in d.get("attachments", [])]
    return d

@api.get("/tasks")
async def list_tasks(board_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: dict = {}
    if board_id:
        q["board_id"] = oid(board_id)
        board = await db.boards.find_one({"_id": oid(board_id)})
        if not board:
            raise HTTPException(404, "Board not found")
        if not await user_can_access_board(user, board):
            raise HTTPException(403, "No access")
    else:
        if user["role"] not in ("super_admin", "admin"):
            q["assignee_id"] = oid(user["id"])
    tasks = await db.tasks.find(q).sort("created_at", -1).to_list(2000)
    return [await enrich_task(t) for t in tasks]

@api.post("/tasks")
async def create_task(payload: TaskIn, user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"_id": oid(payload.board_id)})
    if not board:
        raise HTTPException(404, "Board not found")
    if not await user_can_edit_board(user, board):
        raise HTTPException(403, "Forbidden")
    stage = payload.stage or (board.get("stages") or DEFAULT_STAGES)[0]
    if payload.parent_task_id:
        parent = await db.tasks.find_one({"_id": oid(payload.parent_task_id)})
        if not parent:
            raise HTTPException(404, "Parent task not found")
    doc = {
        "board_id": oid(payload.board_id),
        "parent_task_id": oid(payload.parent_task_id) if payload.parent_task_id else None,
        "title": payload.title.strip(),
        "description": payload.description or "",
        "stage": stage,
        "priority": payload.priority or "Medium",
        "due_date": payload.due_date,
        "assignee_id": oid(payload.assignee_id) if payload.assignee_id else None,
        "cancel_reason": None,
        "links": [oid(x) for x in (payload.links or [])],
        "attachments": [oid(x) for x in (payload.attachments or [])],
        "created_by": oid(user["id"]),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    res = await db.tasks.insert_one(doc)
    doc["_id"] = res.inserted_id
    tid = str(res.inserted_id)
    await log_change(tid, user, f"Task created in {board['name']}")
    if payload.assignee_id:
        await notify([payload.assignee_id], "assign",
                     f"{user['name']} assigned you '{payload.title}'",
                     task_id=tid, board_id=payload.board_id, actor=user)
    return await enrich_task(doc)

@api.get("/tasks/{task_id}")
async def get_task(task_id: str, user: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"_id": oid(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    board = await db.boards.find_one({"_id": t["board_id"]})
    if not board or not await user_can_access_board(user, board):
        raise HTTPException(403, "No access")
    result = await enrich_task(t)
    subs = await db.tasks.find({"parent_task_id": oid(task_id)}).to_list(500)
    result["subtasks"] = [await enrich_task(s) for s in subs]
    comments = await db.comments.find({"task_id": oid(task_id)}).sort("created_at", 1).to_list(500)
    result["comments"] = [clean(c) for c in comments]
    logs = await db.change_logs.find({"task_id": oid(task_id)}).sort("created_at", -1).to_list(500)
    result["history"] = [clean(l) for l in logs]
    return result

@api.patch("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"_id": oid(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    board = await db.boards.find_one({"_id": t["board_id"]})
    if not board or not await user_can_edit_board(user, board):
        raise HTTPException(403, "Forbidden")
    updates = payload.model_dump(exclude_unset=True)
    changes_log: List[str] = []
    notify_users: set = set()

    if "assignee_id" in updates:
        new_ass = updates["assignee_id"]
        if new_ass and str(t.get("assignee_id")) != str(new_ass):
            notify_users.add(new_ass)
            changes_log.append("Assignee updated")
        updates["assignee_id"] = oid(new_ass) if new_ass else None
    if "stage" in updates and updates["stage"] and updates["stage"] != t.get("stage"):
        if updates["stage"] == "Canceled" and not updates.get("cancel_reason") and not t.get("cancel_reason"):
            raise HTTPException(400, "cancel_reason required when moving to Canceled")
        changes_log.append(f"Moved to {updates['stage']}")
        if t.get("assignee_id"):
            notify_users.add(str(t["assignee_id"]))
    if "title" in updates and updates["title"] != t.get("title"):
        changes_log.append("Title updated")
    if "description" in updates and updates["description"] != t.get("description"):
        changes_log.append("Description updated")
    if "due_date" in updates and updates["due_date"] != t.get("due_date"):
        changes_log.append(f"Due date set to {updates['due_date'] or 'none'}")
    if "priority" in updates and updates["priority"] != t.get("priority"):
        changes_log.append(f"Priority set to {updates['priority']}")
    if "cancel_reason" in updates and updates["cancel_reason"]:
        changes_log.append(f"Cancel reason: {updates['cancel_reason']}")
    if "links" in updates and updates["links"] is not None:
        updates["links"] = [oid(x) for x in updates["links"]]
        changes_log.append("Linked cards updated")
    if "attachments" in updates and updates["attachments"] is not None:
        updates["attachments"] = [oid(x) for x in updates["attachments"]]
        changes_log.append("Attachments updated")

    updates["updated_at"] = now_iso()
    await db.tasks.update_one({"_id": oid(task_id)}, {"$set": updates})
    updated = await db.tasks.find_one({"_id": oid(task_id)})
    for msg in changes_log:
        await log_change(task_id, user, msg)
    if notify_users and changes_log:
        await notify(
            list(notify_users), "edit",
            f"{user['name']} updated '{updated['title']}'",
            task_id=task_id, board_id=str(t["board_id"]), actor=user,
        )
    return await enrich_task(updated)

@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"_id": oid(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    board = await db.boards.find_one({"_id": t["board_id"]})
    if not board or not await user_can_edit_board(user, board):
        raise HTTPException(403, "Forbidden")
    await db.tasks.update_many({"parent_task_id": oid(task_id)}, {"$set": {"parent_task_id": None}})
    await db.tasks.delete_one({"_id": oid(task_id)})
    return {"ok": True}

@api.post("/tasks/{task_id}/convert")
async def convert_task(task_id: str, payload: ConvertIn, user: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"_id": oid(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    board = await db.boards.find_one({"_id": t["board_id"]})
    if not board or not await user_can_edit_board(user, board):
        raise HTTPException(403, "Forbidden")
    if payload.parent_task_id:
        parent = await db.tasks.find_one({"_id": oid(payload.parent_task_id)})
        if not parent:
            raise HTTPException(404, "Parent task not found")
        if str(parent["_id"]) == task_id:
            raise HTTPException(400, "Cannot be child of itself")
        subs = await db.tasks.find({"parent_task_id": oid(task_id)}).to_list(500)
        if any(str(s["_id"]) == payload.parent_task_id for s in subs):
            raise HTTPException(400, "Circular parent not allowed")
        await db.tasks.update_one(
            {"_id": oid(task_id)},
            {"$set": {"parent_task_id": oid(payload.parent_task_id), "updated_at": now_iso()}}
        )
        await log_change(task_id, user, f"Converted to subtask of '{parent['title']}'")
    else:
        await db.tasks.update_one(
            {"_id": oid(task_id)},
            {"$set": {"parent_task_id": None, "updated_at": now_iso()}}
        )
        await log_change(task_id, user, "Promoted to top-level task")
    updated = await db.tasks.find_one({"_id": oid(task_id)})
    return await enrich_task(updated)

# ---------- Comments ----------
@api.post("/tasks/{task_id}/comments")
async def add_comment(task_id: str, payload: CommentIn, user: dict = Depends(get_current_user)):
    t = await db.tasks.find_one({"_id": oid(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    board = await db.boards.find_one({"_id": t["board_id"]})
    if not board or not await user_can_access_board(user, board):
        raise HTTPException(403, "No access")
    mentions_raw = parse_mentions(payload.body)
    mentioned_ids: List[str] = []
    if mentions_raw:
        users_all = await db.users.find({}).to_list(500)
        for m in mentions_raw:
            m_lower = m.lower()
            for u in users_all:
                localpart = (u["email"].split("@")[0]).lower()
                name_slug = re.sub(r"\s+", ".", u["name"].strip().lower())
                if m_lower == localpart or m_lower == name_slug:
                    mentioned_ids.append(str(u["_id"]))
                    break
    doc = {
        "task_id": oid(task_id),
        "author_id": oid(user["id"]),
        "author_name": user["name"],
        "body": payload.body,
        "mentions": [oid(x) for x in mentioned_ids],
        "created_at": now_iso(),
    }
    res = await db.comments.insert_one(doc)
    doc["_id"] = res.inserted_id
    await log_change(task_id, user, "Comment added")
    notify_targets = set(mentioned_ids)
    if t.get("assignee_id"):
        notify_targets.add(str(t["assignee_id"]))
    if mentioned_ids:
        await notify(mentioned_ids, "mention",
                     f"{user['name']} mentioned you in '{t['title']}'",
                     task_id=task_id, board_id=str(t["board_id"]), actor=user)
        notify_targets -= set(mentioned_ids)
    if notify_targets:
        await notify(list(notify_targets), "comment",
                     f"{user['name']} commented on '{t['title']}'",
                     task_id=task_id, board_id=str(t["board_id"]), actor=user)
    return clean(doc)

# ---------- Notifications ----------
@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": oid(user["id"])}).sort("created_at", -1).to_list(200)
    return [clean(i) for i in items]

@api.patch("/notifications/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": oid(user["id"]), "read": False}, {"$set": {"read": True}})
    return {"ok": True}

@api.patch("/notifications/{notif_id}/read")
async def read_one(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"_id": oid(notif_id), "user_id": oid(user["id"])},
        {"$set": {"read": True}}
    )
    return {"ok": True}

# ---------- Files ----------
@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    fname = file.filename or "file"
    ext = fname.rsplit(".", 1)[-1] if "." in fname else "bin"
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, data, content_type)
    doc = {
        "storage_path": result["path"],
        "original_filename": fname,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "owner_id": oid(user["id"]),
        "is_deleted": False,
        "created_at": now_iso(),
    }
    res = await db.files.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)

@api.get("/files/{file_id}/download")
async def download_file(file_id: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"_id": oid(file_id), "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ct = get_object(rec["storage_path"])
    return FastApiResponse(content=data, media_type=rec.get("content_type") or ct)

@api.get("/files/{file_id}")
async def file_meta(file_id: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"_id": oid(file_id), "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    return clean(rec)

# ---------- Dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    if user["role"] in ("super_admin", "admin"):
        q: dict = {}
    else:
        q = {"assignee_id": oid(user["id"])}
    tasks = await db.tasks.find(q).to_list(2000)
    today = datetime.now(timezone.utc).date()
    week_end = today + timedelta(days=7)
    month_end = today + timedelta(days=30)
    def parse_dt(s):
        if not s: return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        except Exception:
            try:
                return datetime.strptime(s[:10], "%Y-%m-%d").date()
            except Exception:
                return None
    active = [t for t in tasks if t.get("stage") not in ("Done", "Canceled")]
    due_week = [t for t in active if (d := parse_dt(t.get("due_date"))) and today <= d <= week_end]
    due_month = [t for t in active if (d := parse_dt(t.get("due_date"))) and today <= d <= month_end]
    overdue = [t for t in active if (d := parse_dt(t.get("due_date"))) and d < today]
    completed = [t for t in tasks if t.get("stage") == "Done"]
    if user["role"] in ("super_admin", "admin"):
        boards = await db.boards.find({}).to_list(500)
    else:
        boards = await db.boards.find({"members.user_id": oid(user["id"])}).to_list(500)
    return {
        "totals": {
            "visible": len(tasks),
            "active": len(active),
            "due_week": len(due_week),
            "due_month": len(due_month),
            "overdue": len(overdue),
            "completed": len(completed),
            "boards": len(boards),
        },
        "boards": [
            {
                "id": str(b["_id"]),
                "name": b["name"],
                "color": b.get("color", "violet"),
                "total": sum(1 for t in tasks if str(t.get("board_id")) == str(b["_id"])),
                "done": sum(1 for t in tasks if str(t.get("board_id")) == str(b["_id"]) and t.get("stage") == "Done"),
            }
            for b in boards
        ],
    }

# ---------- Startup ----------
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@nexus.local")
    admin_password = os.environ.get("ADMIN_PASSWORD", "demo123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Jordan Lee",
            "role": "super_admin",
            "created_at": now_iso(),
        })
        log.info("Seeded super admin %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

async def seed_sample_data():
    if await db.boards.count_documents({}) > 0:
        return
    demo_users = [
        {"email": "maya@nexus.local", "name": "Maya Chen", "role": "admin", "password": "demo123"},
        {"email": "noah@nexus.local", "name": "Noah Williams", "role": "member", "password": "demo123"},
        {"email": "ava@nexus.local", "name": "Ava Patel", "role": "member", "password": "demo123"},
    ]
    for u in demo_users:
        if not await db.users.find_one({"email": u["email"]}):
            await db.users.insert_one({
                "email": u["email"], "name": u["name"], "role": u["role"],
                "password_hash": hash_password(u["password"]),
                "created_at": now_iso(),
            })
    admin = await db.users.find_one({"email": os.environ.get("ADMIN_EMAIL", "admin@nexus.local")})
    maya = await db.users.find_one({"email": "maya@nexus.local"})
    noah = await db.users.find_one({"email": "noah@nexus.local"})
    ava = await db.users.find_one({"email": "ava@nexus.local"})

    board = {
        "name": "Product launch", "color": "violet",
        "stages": list(DEFAULT_STAGES),
        "members": [
            {"user_id": admin["_id"], "board_role": "owner"},
            {"user_id": maya["_id"], "board_role": "editor"},
            {"user_id": noah["_id"], "board_role": "editor"},
            {"user_id": ava["_id"], "board_role": "editor"},
        ],
        "owner_id": admin["_id"], "created_at": now_iso(),
    }
    b1 = await db.boards.insert_one(board)
    sample = [
        ("Map the new onboarding flow", "Turn the first-run experience into a clear path.", "In Progress", "High", "2026-03-05", maya["_id"]),
        ("Finalize workspace permissions", "Review the access matrix and confirm defaults.", "Review", "Medium", "2026-03-08", noah["_id"]),
        ("Audit Q1 customer feedback", "Group customer themes into decisions.", "To Do", "Low", "2026-03-12", ava["_id"]),
        ("Create release notes", "Summarize the customer-facing improvements.", "Done", "Medium", "2026-02-20", maya["_id"]),
        ("Set up analytics events", "Instrument the activation moments.", "Backlog", "Medium", "2026-03-20", maya["_id"]),
    ]
    for title, desc, stage, prio, due, assn in sample:
        await db.tasks.insert_one({
            "board_id": b1.inserted_id, "parent_task_id": None,
            "title": title, "description": desc,
            "stage": stage, "priority": prio, "due_date": due,
            "assignee_id": assn, "cancel_reason": None,
            "links": [], "attachments": [],
            "created_by": admin["_id"],
            "created_at": now_iso(), "updated_at": now_iso(),
        })
    board2 = {
        "name": "Website refresh", "color": "orange",
        "stages": list(DEFAULT_STAGES),
        "members": [
            {"user_id": admin["_id"], "board_role": "owner"},
            {"user_id": maya["_id"], "board_role": "editor"},
            {"user_id": noah["_id"], "board_role": "viewer"},
        ],
        "owner_id": admin["_id"], "created_at": now_iso(),
    }
    b2 = await db.boards.insert_one(board2)
    await db.tasks.insert_one({
        "board_id": b2.inserted_id, "parent_task_id": None,
        "title": "Redesign homepage hero", "description": "Refresh hero copy and visuals.",
        "stage": "To Do", "priority": "High", "due_date": "2026-03-15",
        "assignee_id": noah["_id"], "cancel_reason": None,
        "links": [], "attachments": [],
        "created_by": admin["_id"],
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    log.info("Seeded sample boards + tasks")

@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.boards.create_index("members.user_id")
        await db.tasks.create_index("board_id")
        await db.tasks.create_index("assignee_id")
        await db.tasks.create_index("parent_task_id")
        await db.comments.create_index("task_id")
        await db.change_logs.create_index("task_id")
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    except Exception as e:
        log.warning("Index setup: %s", e)
    await seed_admin()
    await seed_sample_data()
    init_storage()

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

# ---------- Wire router + CORS ----------
app.include_router(api)

allowed_origins = [FRONTEND_URL, "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
