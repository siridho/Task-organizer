import { useEffect, useState } from "react";
import api, { formatError } from "../api";
import { Activity, AlertCircle, Clock3, LayoutDashboard, Users2, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard({ user, boards, onOpenTask, onOpenBoard, search }) {
  const isAdmin = user.role === "super_admin" || user.role === "admin";
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: s }, { data: t }] = await Promise.all([
          api.get("/dashboard/summary"),
          api.get("/tasks"),
        ]);
        setSummary(s);
        setTasks(t);
      } catch (e) {
        toast.error(formatError(e));
      }
    })();
  }, []);

  if (!summary) return <div className="muted" data-testid="dashboard-loading">Loading dashboard…</div>;

  const t = summary.totals;
  const shown = (search ? tasks.filter((x) => x.title.toLowerCase().includes(search.toLowerCase())) : tasks)
    .slice(0, 8);

  return (
    <>
      <div className="page-heading reveal">
        <div>
          <p className="eyebrow">{isAdmin ? "ADMIN CONTROL CENTER" : "PERSONAL WORKSPACE"}</p>
          <h1 data-testid="dashboard-greeting">
            {isAdmin ? "Workspace overview" : `Good day, ${user.name.split(" ")[0]}`}
          </h1>
          <p className="muted">
            {isAdmin ? "Every board and every member — all in one place." : "Your assigned work across every board you can see."}
          </p>
        </div>
      </div>

      <div className="metric-grid reveal">
        <Metric label={isAdmin ? "Visible tasks" : "My tasks"} value={t.visible} icon={Activity} color="violet" testId="metric-visible"/>
        <Metric label="Due this week" value={t.due_week} icon={Clock3} color="orange" testId="metric-due-week"
                sub={`${t.due_month} this month`}/>
        <Metric label="Overdue" value={t.overdue} icon={AlertCircle} color="red" testId="metric-overdue"/>
        <Metric label="Boards" value={t.boards} icon={LayoutDashboard} color="blue" testId="metric-boards"/>
      </div>

      <section className="panel reveal">
        <div className="section-head">
          <div>
            <p className="eyebrow">BOARD HEALTH</p>
            <h2>Project momentum</h2>
          </div>
          <span className="muted small-text">{t.completed} completed · {t.active} active</span>
        </div>
        <div className="board-health-grid">
          {summary.boards.map((b) => {
            const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
            return (
              <button key={b.id} className="health-tile" data-testid={`health-tile-${b.id}`}
                      onClick={() => onOpenBoard({ id: b.id, name: b.name })}>
                <div className="health-tile-head">
                  <span className={`board-dot ${b.color || "violet"}`}/>
                  <strong>{b.name}</strong>
                </div>
                <div className="mini-bar"><span className={`fill-${b.color || "violet"}`} style={{ width: `${pct}%` }}/></div>
                <div className="health-tile-foot">
                  <small>{b.done}/{b.total} done</small>
                  <b>{pct}%</b>
                </div>
              </button>
            );
          })}
          {summary.boards.length === 0 && <p className="muted">No boards yet — create one from the sidebar.</p>}
        </div>
      </section>

      <section className="panel reveal">
        <div className="section-head">
          <div>
            <p className="eyebrow">{isAdmin ? "ALL WORKSPACE TASKS" : "ASSIGNED TO YOU"}</p>
            <h2>{isAdmin ? "Work across every board" : "Your tasks"}</h2>
          </div>
        </div>
        <div className="dashboard-task-list">
          {shown.length === 0 && <p className="muted">Nothing to show yet.</p>}
          {shown.map((task) => (
            <button className="table-row" key={task.id}
                    data-testid={`dashboard-task-${task.id}`}
                    onClick={() => onOpenTask(task.id)}>
              <span>
                <b>{task.title}</b>
                <small>{boards.find((b) => b.id === task.board_id)?.name || "Board"} · {task.priority} · {task.due_date || "no due date"}</small>
              </span>
              <span className="status-pill">{task.stage}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, icon: Icon, color, testId, sub }) {
  return (
    <div className="metric">
      <div className={`metric-icon ${color}`}><Icon size={18}/></div>
      <div>
        <small>{label}</small>
        <strong data-testid={testId}>{value}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}
