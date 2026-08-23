import { useState } from "react";
import api, { formatError } from "../api";
import { X, CirclePlus } from "lucide-react";
import { toast } from "sonner";

export default function AddTaskModal({ board, users, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [stage, setStage] = useState((board.stages || ["Backlog"])[0]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post("/tasks", {
        board_id: board.id,
        title: title.trim(),
        description,
        priority,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        stage,
      });
      toast.success("Task created");
      onCreated();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="task-modal add-modal" data-testid="add-task-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} data-testid="close-add-task-modal"><X size={18}/></button>
        <p className="eyebrow">NEW TASK · {board.name}</p>
        <h2>Create a task</h2>
        <label>Task title
          <input autoFocus data-testid="new-task-title" value={title}
                 onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?"/>
        </label>
        <label>Description
          <textarea data-testid="new-task-description" value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add context, decisions, or acceptance criteria…"/>
        </label>
        <div className="form-two">
          <label>Stage
            <select data-testid="new-task-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
              {(board.stages || []).map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Priority
            <select data-testid="new-task-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {["Low", "Medium", "High"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="form-two">
          <label>Assignee
            <select data-testid="new-task-assignee" value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label>Due date
            <input type="date" data-testid="new-task-due"
                   value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
          </label>
        </div>
        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" data-testid="save-new-task"
                  disabled={saving || !title.trim()} onClick={save}>
            <CirclePlus size={16}/> {saving ? "Saving…" : "Create task"}
          </button>
        </div>
      </section>
    </div>
  );
}
