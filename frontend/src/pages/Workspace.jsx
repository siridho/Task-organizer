import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import api, { formatError } from "../api";
import {
  LayoutDashboard, ClipboardList, Bell, LogOut, Zap, Menu, Search,
  CirclePlus, ChevronDown, Users2, Settings2, X,
} from "lucide-react";
import { toast } from "sonner";
import Dashboard from "./Dashboard";
import Board from "./Board";
import MyTasks from "./MyTasks";
import Notifications from "./Notifications";
import Members from "./Members";
import TaskModal from "../components/TaskModal";
import AddTaskModal from "../components/AddTaskModal";
import BoardModal from "../components/BoardModal";

export default function Workspace() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === "super_admin" || user.role === "admin";
  const isSuper = user.role === "super_admin";

  const [view, setView] = useState({ kind: "dashboard" });
  const [boards, setBoards] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [search, setSearch] = useState("");

  const loadBoards = useCallback(async () => {
    try {
      const { data } = await api.get("/boards");
      setBoards(data);
    } catch (e) { /* ignore */ }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch { /* ignore */ }
  }, []);

  const loadNotifCount = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifCount(data.filter((n) => !n.read).length);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadBoards();
    loadUsers();
    loadNotifCount();
    const iv = setInterval(loadNotifCount, 20000);
    return () => clearInterval(iv);
  }, [loadBoards, loadUsers, loadNotifCount]);

  const navigate = (v) => {
    setView(v);
    setMobileMenu(false);
  };

  const openBoard = (b) => navigate({ kind: "board", boardId: b.id });

  const handleCreateBoard = async (name, color) => {
    try {
      const { data } = await api.post("/boards", { name, color });
      setBoards((prev) => [...prev, data]);
      setShowBoardModal(false);
      toast.success(`Board “${name}” created`);
      navigate({ kind: "board", boardId: data.id });
    } catch (e) { toast.error(formatError(e)); }
  };

  const currentBoard = view.kind === "board" ? boards.find((b) => b.id === view.boardId) : null;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <div className="brand-mark side-brand">
          <Zap size={17} fill="currentColor"/> nexus<span>task</span>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-icon">N</div>
          <div>
            <strong>Nexus workspace</strong>
            <small>{isAdmin ? "Admin control center" : "Personal workspace"}</small>
          </div>
          <ChevronDown size={15}/>
        </div>
        <nav>
          <p className="nav-label">WORKSPACE</p>
          <button className={`nav-item ${view.kind === "dashboard" ? "active" : ""}`}
                  data-testid="nav-dashboard" onClick={() => navigate({ kind: "dashboard" })}>
            <LayoutDashboard size={17}/> {isAdmin ? "Full dashboard" : "My dashboard"}
          </button>
          <button className={`nav-item ${view.kind === "mytasks" ? "active" : ""}`}
                  data-testid="nav-mytasks" onClick={() => navigate({ kind: "mytasks" })}>
            <ClipboardList size={17}/> My tasks
          </button>
          <button className={`nav-item ${view.kind === "notifications" ? "active" : ""}`}
                  data-testid="nav-notifications" onClick={() => navigate({ kind: "notifications" })}>
            <Bell size={17}/> Notifications
            {notifCount > 0 && <em data-testid="notif-badge">{notifCount}</em>}
          </button>
          {isSuper && (
            <button className={`nav-item ${view.kind === "members" ? "active" : ""}`}
                    data-testid="nav-members" onClick={() => navigate({ kind: "members" })}>
              <Users2 size={17}/> Members & roles
            </button>
          )}
          <p className="nav-label boards-label">
            ALL BOARDS
            {isAdmin && (
              <button data-testid="add-board-button" onClick={() => setShowBoardModal(true)} title="New board">
                <CirclePlus size={14}/>
              </button>
            )}
          </p>
          {boards.length === 0 && <p className="nav-empty">No boards yet</p>}
          {boards.map((b) => (
            <button key={b.id}
                    className={`nav-item ${view.kind === "board" && view.boardId === b.id ? "active" : ""}`}
                    data-testid={`nav-board-${b.id}`}
                    onClick={() => openBoard(b)}>
              <span className={`board-dot ${b.color || "violet"}`}/> {b.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-row">
            <div className="avatar avatar-violet">
              {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <strong data-testid="current-user-name">{user.name}</strong>
              <small>{prettyRole(user.role)}</small>
            </div>
            <button className="icon-btn" data-testid="logout-button" onClick={logout} title="Sign out">
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" data-testid="mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)}>
            <Menu size={20}/>
          </button>
          <div className="breadcrumb">
            <span>Workspace</span><b>/</b>
            <strong>{titleFor(view, currentBoard)}</strong>
          </div>
          <div className="top-actions">
            <div className="search-box">
              <Search size={16}/>
              <input placeholder="Search tasks…" value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     data-testid="global-search-input"/>
            </div>
            <button className="icon-btn notification-trigger"
                    data-testid="topbar-notif-btn"
                    onClick={() => navigate({ kind: "notifications" })}>
              <Bell size={18}/>
              {notifCount > 0 && <i>{notifCount}</i>}
            </button>
          </div>
        </header>

        <div className="content">
          {view.kind === "dashboard" && (
            <Dashboard user={user} boards={boards} onOpenTask={setSelectedTaskId}
                       onOpenBoard={openBoard} search={search}/>
          )}
          {view.kind === "board" && currentBoard && (
            <Board board={currentBoard} users={users} me={user}
                   onOpenTask={setSelectedTaskId}
                   onAddTask={() => setShowAddTask(true)}
                   onBoardChanged={loadBoards}
                   search={search}/>
          )}
          {view.kind === "mytasks" && (
            <MyTasks user={user} boards={boards} onOpenTask={setSelectedTaskId} search={search}/>
          )}
          {view.kind === "notifications" && (
            <Notifications onCountChange={setNotifCount}
                           onOpenTask={(id) => { setSelectedTaskId(id); }}/>
          )}
          {view.kind === "members" && isSuper && (
            <Members users={users} onUsersChanged={loadUsers}/>
          )}
        </div>
      </main>

      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          me={user}
          boards={boards}
          users={users}
          onClose={() => setSelectedTaskId(null)}
          onChanged={() => { loadBoards(); loadNotifCount(); }}
        />
      )}
      {showAddTask && currentBoard && (
        <AddTaskModal
          board={currentBoard}
          users={users}
          onClose={() => setShowAddTask(false)}
          onCreated={() => { setShowAddTask(false); loadBoards(); }}
        />
      )}
      {showBoardModal && (
        <BoardModal
          onClose={() => setShowBoardModal(false)}
          onSave={handleCreateBoard}
        />
      )}
    </div>
  );
}

function prettyRole(role) {
  return role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Member";
}
function titleFor(view, currentBoard) {
  if (view.kind === "dashboard") return "Dashboard";
  if (view.kind === "board") return currentBoard?.name || "Board";
  if (view.kind === "mytasks") return "My tasks";
  if (view.kind === "notifications") return "Notifications";
  if (view.kind === "members") return "Members & roles";
  return "";
}
