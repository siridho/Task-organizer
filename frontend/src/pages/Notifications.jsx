import { useEffect, useState, useCallback } from "react";
import api, { formatError } from "../api";
import { Bell, Check, MessageSquare, AtSign, Move, Edit, UserPlus } from "lucide-react";
import { toast } from "sonner";

const iconFor = (type) => {
  if (type === "comment") return MessageSquare;
  if (type === "mention") return AtSign;
  if (type === "assign") return UserPlus;
  if (type === "edit") return Edit;
  return Bell;
};

export default function Notifications({ onCountChange, onOpenTask }) {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data);
      onCountChange && onCountChange(data.filter((n) => !n.read).length);
    } catch (e) { toast.error(formatError(e)); }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const readAll = async () => {
    try {
      await api.patch("/notifications/read-all");
      toast.success("All notifications marked as read");
      load();
    } catch (e) { toast.error(formatError(e)); }
  };

  const openItem = async (n) => {
    if (!n.read) { try { await api.patch(`/notifications/${n.id}/read`); } catch {} }
    if (n.task_id && onOpenTask) onOpenTask(n.task_id);
    load();
  };

  return (
    <>
      <div className="page-heading reveal">
        <div>
          <p className="eyebrow">ACTIVITY CENTER</p>
          <h1>Notifications</h1>
          <p className="muted">Every move, mention, and change that involves your work.</p>
        </div>
        <button className="secondary-btn" data-testid="mark-all-read" onClick={readAll}>
          <Check size={16}/> Mark all read
        </button>
      </div>

      <section className="panel notification-list reveal">
        {items.length === 0 && <p className="muted" style={{ padding: "16px" }}>You're all caught up.</p>}
        {items.map((n) => {
          const Icon = iconFor(n.type);
          return (
            <button className={`notification-item ${n.read ? "read" : ""}`}
                    key={n.id}
                    data-testid={`notification-${n.type}-${n.id}`}
                    onClick={() => openItem(n)}>
              <div className={`notification-icon ${n.type}`}><Icon size={16}/></div>
              <div>
                <strong>{n.message}</strong>
                <small>{formatTime(n.created_at)}</small>
              </div>
              {!n.read && <span className="unread-dot"/>}
            </button>
          );
        })}
      </section>
    </>
  );
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}
