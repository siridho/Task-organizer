import { useEffect, useRef, useState } from "react";
import api, { formatError } from "../api";
import {
  X, CalendarDays, MessageSquare, Paperclip, ArrowUpRight, ArrowDown, Link2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function TaskModal({ taskId, me, boards, users, onClose, onChanged }) {
  const [task, setTask] = useState(null);
  const [allTasks, setAllTasks] = useState([]);
  const [tab, setTab] = useState("overview");
  const [comment, setComment] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const isAdmin = me.role === "super_admin" || me.role === "admin";
  const board = task ? boards.find((b) => b.id === task.board_id) : null;
  const isEditor = isAdmin || (board?.members || []).some(
    (m) => String(m.user_id) === me.id && (m.board_role === "editor" || m.board_role === "owner")
  );
  const stages = board?.stages || ["Backlog", "To Do", "In Progress", "Review", "Done"];
  const stageOptions = stages.includes("Canceled") ? stages : [...stages, "Canceled"];

  const load = async () => {
    try {
      const { data } = await api.get(`/tasks/${taskId}`);
      setTask(data);
    } catch (e) { toast.error(formatError(e)); onClose(); }
  };
  const loadAllTasks = async () => {
    try {
      const { data } = await api.get("/tasks");
      setAllTasks(data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadAllTasks(); /* eslint-disable-next-line */ }, [taskId]);

  if (!task) {
    return (
      <div className="modal-backdrop" data-testid="task-modal-loading">
        <section className="task-modal"><p className="muted">Loading…</p></section>
      </div>
    );
  }

  const patch = async (payload, successMsg) => {
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, payload);
      setTask((prev) => ({ ...prev, ...data }));
      if (successMsg) toast.success(successMsg);
      onChanged && onChanged();
      load();
    } catch (e) { toast.error(formatError(e)); }
  };

  const changeStage = (stage) => {
    if (stage === "Canceled") { setShowCancel(true); return; }
    patch({ stage }, `Moved to ${stage}`);
  };

  const doCancel = async () => {
    if (!cancelReason.trim()) { toast.error("A reason is required"); return; }
    await patch({ stage: "Canceled", cancel_reason: cancelReason.trim() }, "Task canceled");
    setShowCancel(false);
    setCancelReason("");
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await api.post(`/tasks/${taskId}/comments`, { body: comment.trim() });
      setComment("");
      toast.success("Comment added");
      load();
    } catch (e) { toast.error(formatError(e)); }
  };

  const uploadAttachment = async (file) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/files/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const next = [...(task.attachments || []), data.id];
      await patch({ attachments: next }, `Attached ${data.original_filename}`);
    } catch (e) { toast.error(formatError(e)); }
    finally { setUploading(false); }
  };

  const promoteToTop = () => {
    if (!task.parent_task_id) return;
    (async () => {
      try {
        await api.post(`/tasks/${taskId}/convert`, { parent_task_id: null });
        toast.success("Promoted to top-level task");
        load();
      } catch (e) { toast.error(formatError(e)); }
    })();
  };
  const convertToSub = async (parentId) => {
    if (!parentId) return;
    try {
      await api.post(`/tasks/${taskId}/convert`, { parent_task_id: parentId });
      toast.success("Converted to subtask");
      load();
    } catch (e) { toast.error(formatError(e)); }
  };

  const linkCard = async (linkedId) => {
    if (!linkedId) return;
    const links = Array.from(new Set([...(task.links || []), linkedId]));
    await patch({ links }, "Card linked");
  };
  const unlinkCard = async (linkedId) => {
    const links = (task.links || []).filter((x) => x !== linkedId);
    await patch({ links }, "Card unlinked");
  };

  const assignee = users.find((u) => u.id === task.assignee_id);
  const linkedTasks = (task.links || []).map((id) => allTasks.find((t) => t.id === id)).filter(Boolean);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="task-modal" data-testid="task-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" data-testid="close-task-modal" onClick={onClose}>
          <X size={18}/>
        </button>
        <div className="modal-eyebrow">
          <span className={`priority ${(task.priority || "medium").toLowerCase()}`}>{task.priority} priority</span>
          <span>{board?.name}</span>
          {task.parent_task_id && <span className="subtask-badge">Subtask</span>}
          {task.stage === "Canceled" && <span className="canceled-badge">Canceled</span>}
        </div>
        <h2 data-testid="task-modal-title">{task.title}</h2>

        <div className="task-tabs">
          <button className={tab === "overview" ? "active" : ""} data-testid="tab-overview" onClick={() => setTab("overview")}>Overview</button>
          <button className={tab === "comments" ? "active" : ""} data-testid="tab-comments" onClick={() => setTab("comments")}>
            Comments <b>{(task.comments || []).length}</b>
          </button>
          <button className={tab === "subtasks" ? "active" : ""} data-testid="tab-subtasks" onClick={() => setTab("subtasks")}>
            Subtasks <b>{(task.subtasks || []).length}</b>
          </button>
          <button className={tab === "links" ? "active" : ""} data-testid="tab-links" onClick={() => setTab("links")}>
            Linked <b>{linkedTasks.length}</b>
          </button>
          <button className={tab === "changes" ? "active" : ""} data-testid="tab-changes" onClick={() => setTab("changes")}>
            Log <b>{(task.history || []).length}</b>
          </button>
        </div>

        {tab === "overview" && (
          <>
            <label className="description-field">Description
              <textarea data-testid="task-description-input"
                        defaultValue={task.description}
                        onBlur={(e) => e.target.value !== task.description && patch({ description: e.target.value }, "Description updated")}/>
            </label>
            <div className="detail-grid">
              <div>
                <small>ASSIGNEE</small>
                {isEditor ? (
                  <select value={task.assignee_id || ""}
                          data-testid="task-assignee-select"
                          onChange={(e) => patch({ assignee_id: e.target.value || null }, "Assignee updated")}>
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : <strong>{assignee?.name || "Unassigned"}</strong>}
              </div>
              <div>
                <small>DUE DATE</small>
                {isEditor ? (
                  <input type="date" defaultValue={task.due_date || ""}
                         data-testid="task-due-input"
                         onBlur={(e) => e.target.value !== (task.due_date || "") && patch({ due_date: e.target.value || null }, "Due date updated")}/>
                ) : <div className="detail-value"><CalendarDays size={15}/> {task.due_date || "—"}</div>}
              </div>
              <div>
                <small>STATUS</small>
                {isEditor ? (
                  <select className="detail-select" value={task.stage}
                          data-testid="task-stage-select-modal"
                          onChange={(e) => changeStage(e.target.value)}>
                    {stageOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                ) : <strong>{task.stage}</strong>}
              </div>
              <div>
                <small>PRIORITY</small>
                {isEditor ? (
                  <select value={task.priority} data-testid="task-priority-select"
                          onChange={(e) => patch({ priority: e.target.value }, "Priority updated")}>
                    {["Low", "Medium", "High"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                ) : <strong>{task.priority}</strong>}
              </div>
            </div>

            {task.cancel_reason && (
              <div className="cancel-reason-box" data-testid="cancel-reason-display">
                <strong>Cancellation reason:</strong> {task.cancel_reason}
              </div>
            )}

            <div className="attachment-row">
              <label className="attach-btn">
                <Paperclip size={13}/> Attach a file
                <input type="file" ref={fileInputRef}
                       data-testid="task-attachment-input"
                       onChange={(e) => {
                         const f = e.target.files?.[0];
                         if (f) uploadAttachment(f);
                         e.target.value = "";
                       }}/>
              </label>
              {uploading && <span className="muted small-text">Uploading…</span>}
              {(task.attachments || []).map((fid) => (
                <a key={fid} className="attachment-chip"
                   href={`${api.defaults.baseURL}/files/${fid}/download`}
                   target="_blank" rel="noreferrer"
                   data-testid={`attachment-chip-${fid}`}>
                  📄 File
                </a>
              ))}
            </div>

            {isEditor && (
              <div className="convert-row">
                {task.parent_task_id ? (
                  <button className="secondary-btn" data-testid="promote-to-task-btn" onClick={promoteToTop}>
                    <ArrowUpRight size={14}/> Promote to top-level task
                  </button>
                ) : (
                  <label className="convert-label">
                    Convert to subtask of:
                    <select onChange={(e) => convertToSub(e.target.value)}
                            data-testid="convert-to-subtask-select"
                            defaultValue="">
                      <option value="">Pick a parent task…</option>
                      {allTasks.filter((t) => t.id !== task.id && !t.parent_task_id && t.board_id === task.board_id)
                              .map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}

            {isEditor && task.stage !== "Canceled" && (
              <div className="modal-actions">
                <button className="secondary-btn danger-btn" data-testid="open-cancel-dialog"
                        onClick={() => setShowCancel(true)}>
                  <XCircle size={14}/> Cancel task
                </button>
              </div>
            )}
          </>
        )}

        {tab === "comments" && (
          <>
            <div className="comment-list">
              {(task.comments || []).length === 0 && <p className="muted">No comments yet.</p>}
              {(task.comments || []).map((c) => (
                <div className="change-row" key={c.id} data-testid={`comment-${c.id}`}>
                  <div className="avatar avatar-violet">
                    {(c.author_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <strong>{c.author_name}</strong>
                    <p className="comment-body">{c.body}</p>
                    <small>{formatTime(c.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="comment-box">
              <input value={comment}
                     data-testid="comment-input"
                     onChange={(e) => setComment(e.target.value)}
                     placeholder="Write a comment or @mention someone (e.g. @noah)"/>
              <button className="primary-btn" data-testid="comment-submit" onClick={addComment}>
                <MessageSquare size={15}/> Send
              </button>
            </div>
          </>
        )}

        {tab === "subtasks" && (
          <div className="change-log">
            {(task.subtasks || []).length === 0 && (
              <p className="muted">No subtasks yet. Turn any task into a subtask from its detail view.</p>
            )}
            {(task.subtasks || []).map((s) => (
              <div className="change-row subtask-row" key={s.id} data-testid={`subtask-row-${s.id}`}>
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.stage} · {s.priority} · {s.due_date || "no due date"}</small>
                </div>
                {isEditor && (
                  <button className="icon-btn"
                          data-testid={`promote-subtask-${s.id}`}
                          title="Promote to top-level task"
                          onClick={async () => {
                            try {
                              await api.post(`/tasks/${s.id}/convert`, { parent_task_id: null });
                              toast.success("Promoted to top-level");
                              load();
                            } catch (e) { toast.error(formatError(e)); }
                          }}>
                    <ArrowUpRight size={14}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "links" && (
          <div className="links-panel">
            {linkedTasks.length === 0 && <p className="muted">No linked cards yet.</p>}
            {linkedTasks.map((l) => (
              <div className="linked-card" key={l.id} data-testid={`linked-card-${l.id}`}>
                <Link2 size={14}/>
                <strong>{l.title}</strong>
                <small>{boards.find((b) => b.id === l.board_id)?.name}</small>
                {isEditor && (
                  <button className="icon-btn" onClick={() => unlinkCard(l.id)} title="Unlink">
                    <X size={14}/>
                  </button>
                )}
              </div>
            ))}
            {isEditor && (
              <select data-testid="link-card-select" defaultValue=""
                      onChange={(e) => { linkCard(e.target.value); e.target.value = ""; }}>
                <option value="">Link another card…</option>
                {allTasks.filter((t) => t.id !== task.id && !(task.links || []).includes(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title} — {boards.find((b) => b.id === t.board_id)?.name || "Board"}
                          </option>
                        ))}
              </select>
            )}
          </div>
        )}

        {tab === "changes" && (
          <div className="change-log">
            {(task.history || []).length === 0 && <p className="muted">No activity yet.</p>}
            {(task.history || []).map((h) => (
              <div className="change-row" key={h.id} data-testid={`history-row-${h.id}`}>
                <div className="avatar avatar-violet">
                  {(h.actor_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <strong>{h.text}</strong>
                  <small>{h.actor_name} · {formatTime(h.created_at)}</small>
                </div>
              </div>
            ))}
          </div>
        )}

        {showCancel && (
          <div className="cancel-inline" data-testid="cancel-inline-form">
            <p className="eyebrow">CANCEL TASK</p>
            <textarea placeholder="Why is this task being canceled?"
                      value={cancelReason}
                      data-testid="cancel-reason-input"
                      onChange={(e) => setCancelReason(e.target.value)}/>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowCancel(false)}>Keep task</button>
              <button className="primary-btn danger-btn" data-testid="confirm-cancel-btn"
                      disabled={!cancelReason.trim()} onClick={doCancel}>
                Cancel task
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
