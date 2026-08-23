import { useState } from "react";
import { X, CirclePlus } from "lucide-react";

const COLORS = ["violet", "orange", "green", "blue"];

export default function BoardModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("violet");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="task-modal add-modal" data-testid="board-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" data-testid="close-board-modal" onClick={onClose}><X size={18}/></button>
        <p className="eyebrow">NEW BOARD</p>
        <h2>Create a board</h2>
        <label>Board name
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
                 placeholder="e.g. Q1 launch" data-testid="new-board-name"/>
        </label>
        <label>Accent color
          <div className="color-picker">
            {COLORS.map((c) => (
              <button key={c}
                      className={`color-dot ${c} ${color === c ? "active" : ""}`}
                      data-testid={`color-${c}`}
                      onClick={() => setColor(c)}/>
            ))}
          </div>
        </label>
        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!name.trim()}
                  data-testid="save-new-board" onClick={() => onSave(name.trim(), color)}>
            <CirclePlus size={16}/> Create board
          </button>
        </div>
      </section>
    </div>
  );
}
