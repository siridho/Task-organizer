import { useEffect, useState, useCallback, useMemo } from "react";
import api, { formatError } from "../api";
import {
  CirclePlus, CalendarDays, MessageSquare, Settings2, X, Plus, Trash2, ArrowUp, ArrowDown,
  Filter as FilterIcon,
} from "lucide-react";
import { toast } from "sonner";

export default function Board({ board, users, me, onOpenTask, onAddTask, onBoardChanged, search }) {
  const [tasks, setTasks] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState("all");   // "all" | "me" | "unassigned" | userId
  const [filterPriority, setFilterPriority] = useState("all");   // "all" | "Low" | "Medium" | "High"
  const [filterDue, setFilterDue] = useState("all");             // "all" | "week" | "month" | "overdue" | "none"
  const isAdmin = me.role === "super_admin" || me.role === "admin";
  const isBoardEditor = isAdmin || (board.members || []).some(
    (m) => String(m.user_id) === me.id && (m.board_role === "editor" || m.board_role === "owner")
  );

  const stages = board.stages || ["Backlog", "To Do", "In Progress", "Review", "Done"];
  const displayStages = stages.includes("Canceled") ? stages : [...stages, "Canceled"];

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/tasks", { params: { board_id: board.id } });
      setTasks(data);
    } catch (e) { toast.error(formatError(e)); }
  }, [board.id]);

  useEffect(() => { load(); }, [load]);

  const moveTask = async (task, newStage) => {
    if (newStage === "Canceled") {
      const reason = window.prompt("Reason for canceling this task? (required)");
      if (!reason || !reason.trim()) return;
      try {
        await api.patch(`/tasks/${task.id}`, { stage: "Canceled", cancel_reason: reason.trim() });
        toast.success("Task canceled");
        load();
      } catch (e) { toast.error(formatError(e)); }
      return;
    }
    try {
      await api.patch(`/tasks/${task.id}`, { stage: newStage });
      toast.success(`Moved to ${newStage}`);
      load();
    } catch (e) { toast.error(formatError(e)); }
  };

  const filtered = useMemo(() => {
    const q = (search || "").toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const monthEnd = new Date(today); monthEnd.setDate(today.getDate() + 30);
    const parseD = (s) => { if (!s) return null; const d = new Date(s + "T00:00:00Z"); return isNaN(d) ? null : d; };
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (filterAssignee === "me" && t.assignee_id !== me.id) return false;
      if (filterAssignee === "unassigned" && t.assignee_id) return false;
      if (filterAssignee !== "all" && filterAssignee !== "me" && filterAssignee !== "unassigned"
          && t.assignee_id !== filterAssignee) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterDue !== "all") {
        const d = parseD(t.due_date);
        if (filterDue === "none" && d) return false;
        if (filterDue === "overdue" && (!d || d >= today || t.stage === "Done" || t.stage === "Canceled")) return false;
        if (filterDue === "week" && (!d || d < today || d > weekEnd)) return false;
        if (filterDue === "month" && (!d || d < today || d > monthEnd)) return false;
      }
      return true;
    });
  }, [tasks, search, filterAssignee, filterPriority, filterDue, me.id]);

  const topLevel = filtered.filter((t) => !t.parent_task_id);
  const subtaskCounts = filtered.reduce((acc, t) => {
    if (t.parent_task_id) acc[t.parent_task_id] = (acc[t.parent_task_id] || 0) + 1;
    return acc;
  }, {});

  const hasActiveFilter = filterAssignee !== "all" || filterPriority !== "all" || filterDue !== "all";
  const clearFilters = () => { setFilterAssignee("all"); setFilterPriority("all"); setFilterDue("all"); };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/task-id") || dragTaskId;
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.stage === stage) return;
    moveTask(task, stage);
    setDragTaskId(null);
  };

  return (
    <>
      <div className="page-heading board-heading reveal">
        <div>
          <p className="eyebrow">
            <span className={`board-dot ${board.color || "violet"}`}/> {(board.members || []).length} members
          </p>
          <h1 data-testid="board-title">{board.name}</h1>
          <p className="muted">
            {isBoardEditor ? "Move cards, edit stages, assign work." : "Read-only — you are a viewer on this board."}
          </p>
        </div>
        <div className="board-actions">
          {isBoardEditor && (
            <button className="secondary-btn" data-testid="board-settings-btn"
                    onClick={() => setShowSettings(true)}>
              <Settings2 size={15}/> Board settings
            </button>
          )}
          {isBoardEditor && (
            <button className="primary-btn" data-testid="create-task-button" onClick={onAddTask}>
              <CirclePlus size={16}/> New task
            </button>
          )}
        </div>
      </div>

      <div className="filter-bar reveal" data-testid="filter-bar">
        <div className="filter-group">
          <FilterIcon size={13}/>
          <label>
            Assignee
            <select value={filterAssignee}
                    data-testid="filter-assignee"
                    onChange={(e) => setFilterAssignee(e.target.value)}>
              <option value="all">Everyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {(board.members || []).map((m) => {
                const u = users.find((x) => x.id === m.user_id);
                if (!u) return null;
                return <option key={u.id} value={u.id}>{u.name}</option>;
              })}
            </select>
          </label>
          <label>
            Priority
            <select value={filterPriority} data-testid="filter-priority"
                    onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="all">All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
          <label>
            Due
            <select value={filterDue} data-testid="filter-due"
                    onChange={(e) => setFilterDue(e.target.value)}>
              <option value="all">Anytime</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="overdue">Overdue</option>
              <option value="none">No due date</option>
            </select>
          </label>
        </div>
        <div className="filter-chips">
          {filterAssignee !== "all" && (
            <button className="filter-chip" data-testid="chip-assignee"
                    onClick={() => setFilterAssignee("all")}>
              {filterAssignee === "me" ? "Me" : filterAssignee === "unassigned" ? "Unassigned"
                : users.find((u) => u.id === filterAssignee)?.name || "User"} <X size={11}/>
            </button>
          )}
          {filterPriority !== "all" && (
            <button className="filter-chip" data-testid="chip-priority"
                    onClick={() => setFilterPriority("all")}>
              {filterPriority} <X size={11}/>
            </button>
          )}
          {filterDue !== "all" && (
            <button className="filter-chip" data-testid="chip-due"
                    onClick={() => setFilterDue("all")}>
              {filterDue === "week" ? "This week" : filterDue === "month" ? "This month"
                : filterDue === "overdue" ? "Overdue" : "No due date"} <X size={11}/>
            </button>
          )}
          {hasActiveFilter && (
            <button className="filter-chip clear-chip" data-testid="clear-filters"
                    onClick={clearFilters}>Clear all</button>
          )}
        </div>
      </div>

      <div className="kanban reveal">
        {displayStages.map((stage) => (
          <div className={`kanban-column ${dragOverStage === stage ? "drag-over" : ""}`}
               key={stage}
               data-testid={`column-${stage.toLowerCase().replace(/\s+/g, "-")}`}
               onDragOver={(e) => { if (isBoardEditor) { e.preventDefault(); setDragOverStage(stage); } }}
               onDragLeave={() => setDragOverStage((s) => s === stage ? null : s)}
               onDrop={(e) => isBoardEditor && handleDrop(e, stage)}>
            <div className="column-head">
              <div>
                <span className="stage-dot"/>
                <strong>{stage}</strong>
                <small>{topLevel.filter((t) => t.stage === stage).length}</small>
              </div>
            </div>
            <div className="task-list">
              {topLevel.filter((t) => t.stage === stage).map((task) => (
                <TaskCard key={task.id} task={task}
                          subtaskCount={subtaskCounts[task.id] || 0}
                          stages={stages}
                          isEditor={isBoardEditor}
                          users={users}
                          isDragging={dragTaskId === task.id}
                          onDragStart={(e) => {
                            if (!isBoardEditor) return;
                            e.dataTransfer.setData("text/task-id", task.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragTaskId(task.id);
                          }}
                          onDragEnd={() => { setDragTaskId(null); setDragOverStage(null); }}
                          onOpen={() => onOpenTask(task.id)}
                          onMove={(s) => moveTask(task, s)}/>
              ))}
              {topLevel.filter((t) => t.stage === stage).length === 0 && (
                <p className="muted small-text">
                  {dragOverStage === stage ? "Drop here to move" : "No tasks"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showSettings && (
        <BoardSettingsModal
          board={board}
          onClose={() => setShowSettings(false)}
          onSaved={() => { setShowSettings(false); onBoardChanged(); }}
          users={users}
        />
      )}
    </>
  );
}

function TaskCard({ task, subtaskCount, stages, isEditor, users, onOpen, onMove,
                    isDragging, onDragStart, onDragEnd }) {
  const stageOptions = stages.includes("Canceled") ? stages : [...stages, "Canceled"];
  const assigneeName = users.find((u) => u.id === task.assignee_id)?.name || "Unassigned";
  const initials = assigneeName === "Unassigned" ? "—" : assigneeName.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <article className={`task-card ${isDragging ? "dragging" : ""}`}
             data-testid={`task-card-${task.id}`}
             draggable={isEditor}
             onDragStart={onDragStart}
             onDragEnd={onDragEnd}
             onClick={onOpen}>
      <div className="task-card-top">
        <span className={`priority ${(task.priority || "medium").toLowerCase()}`}>{task.priority}</span>
        <small>{task.due_date || "—"}</small>
      </div>
      <h3>{task.title}</h3>
      {task.description && <p className="task-description">{task.description}</p>}
      <div className="task-meta">
        <span><CalendarDays size={13}/> {task.due_date || "—"}</span>
        {subtaskCount > 0 && <span>▧ {subtaskCount} subtasks</span>}
        {(task.attachments || []).length > 0 && <span>📎 {task.attachments.length}</span>}
      </div>
      <div className="task-bottom">
        <div className="avatar avatar-violet" title={assigneeName}>{initials}</div>
        {isEditor && (
          <select value={task.stage}
                  aria-label={`Move ${task.title}`}
                  data-testid={`task-stage-select-${task.id}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onMove(e.target.value)}>
            {stageOptions.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      </div>
    </article>
  );
}

function BoardSettingsModal({ board, onClose, onSaved, users }) {
  const [stages, setStages] = useState(board.stages || []);
  const [newStage, setNewStage] = useState("");
  const [name, setName] = useState(board.name);
  const [members, setMembers] = useState(board.members || []);
  const [pickedUser, setPickedUser] = useState("");
  const [pickedRole, setPickedRole] = useState("editor");

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[idx], next[j]] = [next[j], next[idx]];
    setStages(next);
  };
  const addStage = () => {
    const s = newStage.trim();
    if (!s || stages.includes(s)) return;
    setStages([...stages, s]);
    setNewStage("");
  };
  const removeStage = (s) => setStages(stages.filter((x) => x !== s));

  const save = async () => {
    try {
      await api.patch(`/boards/${board.id}`, { name, stages });
      toast.success("Board updated");
      onSaved();
    } catch (e) { toast.error(formatError(e)); }
  };

  const addMember = async () => {
    if (!pickedUser) return;
    try {
      const { data } = await api.post(`/boards/${board.id}/members`, {
        user_id: pickedUser, board_role: pickedRole,
      });
      setMembers(data.members || []);
      setPickedUser("");
      toast.success("Member added");
    } catch (e) { toast.error(formatError(e)); }
  };

  const removeMember = async (uid) => {
    try {
      const { data } = await api.delete(`/boards/${board.id}/members/${uid}`);
      setMembers(data.members || []);
      toast.success("Member removed");
    } catch (e) { toast.error(formatError(e)); }
  };

  return (
    <div className="modal-backdrop">
      <section className="task-modal" data-testid="board-settings-modal">
        <button className="modal-close icon-btn" onClick={onClose} data-testid="close-board-settings"><X size={18}/></button>
        <p className="eyebrow">BOARD SETTINGS</p>
        <h2>Configure board</h2>

        <label>Board name
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="settings-board-name"/>
        </label>

        <div className="settings-block">
          <p className="eyebrow small-text">STAGES</p>
          <div className="stage-list">
            {stages.map((s, idx) => (
              <div className="stage-row" key={s} data-testid={`stage-row-${s}`}>
                <span>{s}</span>
                <div className="stage-actions">
                  <button className="icon-btn" onClick={() => move(idx, -1)} title="Up"><ArrowUp size={14}/></button>
                  <button className="icon-btn" onClick={() => move(idx, 1)} title="Down"><ArrowDown size={14}/></button>
                  <button className="icon-btn" onClick={() => removeStage(s)} title="Delete" data-testid={`remove-stage-${s}`}><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>
          <div className="stage-add">
            <input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="Add a new stage (e.g. Blocked)" data-testid="new-stage-input"/>
            <button className="secondary-btn" onClick={addStage} data-testid="add-stage-btn"><Plus size={14}/> Add</button>
          </div>
        </div>

        <div className="settings-block">
          <p className="eyebrow small-text">MEMBERS</p>
          <div className="members-list">
            {members.map((m) => {
              const u = users.find((x) => x.id === m.user_id);
              return (
                <div className="stage-row" key={m.user_id}>
                  <span>{u?.name || m.user_id} <small>· {m.board_role}</small></span>
                  <button className="icon-btn" onClick={() => removeMember(m.user_id)} title="Remove"><Trash2 size={14}/></button>
                </div>
              );
            })}
          </div>
          <div className="member-add">
            <select value={pickedUser} onChange={(e) => setPickedUser(e.target.value)} data-testid="member-pick-user">
              <option value="">Pick a user…</option>
              {users.filter((u) => !members.some((m) => m.user_id === u.id))
                    .map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
            </select>
            <select value={pickedRole} onChange={(e) => setPickedRole(e.target.value)} data-testid="member-pick-role">
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>
            <button className="secondary-btn" onClick={addMember} data-testid="add-member-btn"><Plus size={14}/> Add</button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={save} data-testid="save-board-settings">Save changes</button>
        </div>
      </section>
    </div>
  );
}
