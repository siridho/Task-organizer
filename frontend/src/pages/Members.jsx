import api, { formatError } from "../api";
import { toast } from "sonner";

export default function Members({ users, onUsersChanged }) {
  const changeRole = async (uid, role) => {
    try {
      await api.patch(`/users/${uid}/role`, { role });
      toast.success("Role updated");
      onUsersChanged();
    } catch (e) { toast.error(formatError(e)); }
  };

  return (
    <>
      <div className="page-heading reveal">
        <div>
          <p className="eyebrow">SUPER ADMIN CONTROL</p>
          <h1>Members & roles</h1>
          <p className="muted">Change workspace roles. Super Admin can promote or demote any member.</p>
        </div>
      </div>
      <section className="panel reveal">
        <div className="member-admin-list">
          {users.map((u) => (
            <div className="member-row" key={u.id} data-testid={`member-row-${u.id}`}>
              <div>
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </div>
              <select value={u.role}
                      data-testid={`member-role-${u.id}`}
                      onChange={(e) => changeRole(u.id, e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
