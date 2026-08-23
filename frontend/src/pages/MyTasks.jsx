import { useEffect, useState } from "react";
import api, { formatError } from "../api";
import { toast } from "sonner";

export default function MyTasks({ user, boards, onOpenTask, search }) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/tasks");
        setTasks(data);
      } catch (e) { toast.error(formatError(e)); }
    })();
  }, []);

  const filtered = search
    ? tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  return (
    <>
      <div className="page-heading reveal">
        <div>
          <p className="eyebrow">PERSONAL QUEUE</p>
          <h1>My tasks</h1>
          <p className="muted">Everything on your plate, sorted by newest.</p>
        </div>
      </div>
      <div className="task-table panel reveal">
        {filtered.length === 0 && <p className="muted" style={{ padding: "20px" }}>No tasks yet.</p>}
        {filtered.map((t) => (
          <button className="table-row" key={t.id}
                  data-testid={`my-task-row-${t.id}`}
                  onClick={() => onOpenTask(t.id)}>
            <span>
              <b>{t.title}</b>
              <small>{boards.find((b) => b.id === t.board_id)?.name || "Board"} · {t.priority}</small>
            </span>
            <span>{t.due_date || "—"}</span>
            <span className="status-pill">{t.stage}</span>
          </button>
        ))}
      </div>
    </>
  );
}
