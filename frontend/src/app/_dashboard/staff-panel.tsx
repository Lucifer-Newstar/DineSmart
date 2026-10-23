"use client";

import { useState } from "react";
import { Icon } from "./ui";
import { apiSend, isRecord, useApiResource } from "./use-api";

export const STAFF_ROLES = ["Reception", "Kitchen Staff", "Manager", "Administrator"] as const;

export interface StaffMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export function parseStaff(value: unknown): StaffMember[] | null {
  if (!isRecord(value) || !Array.isArray(value.staff)) return null;
  return value.staff.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const { id, userId, name, email, role, isActive } = raw;
    if (typeof id !== "string" || typeof userId !== "string" || typeof name !== "string") {
      return [];
    }
    if (typeof email !== "string" || typeof role !== "string" || typeof isActive !== "boolean") {
      return [];
    }
    return [{ id, userId, name, email, role, isActive }];
  });
}

interface StaffPanelProps {
  accessToken: string | null;
  currentUserId: string | null;
  onToast: (message: string) => void;
}

/** S2-16 roster: Managers and Administrators change roles and active state. */
export function StaffPanel({ accessToken, currentUserId, onToast }: StaffPanelProps) {
  const roster = useApiResource("/staff", accessToken, parseStaff);
  const [savingId, setSavingId] = useState<string | null>(null);

  const update = async (member: StaffMember, change: { role?: string; isActive?: boolean }) => {
    if (!accessToken) return;
    setSavingId(member.id);
    const result = await apiSend(`/staff/${member.id}`, accessToken, "PUT", change);
    setSavingId(null);
    onToast(result.ok ? `${member.name} was updated.` : result.message);
    if (result.ok) roster.reload();
  };

  const members = roster.data ?? [];
  return (
    <article className="card staff-card">
      <div className="orders-toolbar">
        <div>
          <div className="card-overline">TEAM</div>
          <h2>Staff roster</h2>
        </div>
        <button
          className="select-button"
          type="button"
          onClick={roster.reload}
          disabled={!accessToken || roster.status === "loading"}
        >
          <Icon name="refresh" size={15} />
          <span>Refresh</span>
        </button>
      </div>
      {!accessToken ? (
        <p className="panel-state">Sign in as a Manager or Administrator to manage staff.</p>
      ) : roster.status === "loading" && !roster.data ? (
        <p className="panel-state">Loading the roster…</p>
      ) : roster.status === "restricted" ? (
        <p className="panel-state">Only Managers and Administrators can manage staff.</p>
      ) : roster.status === "unavailable" ? (
        <p className="panel-state panel-state-error">The roster could not be loaded.</p>
      ) : members.length === 0 ? (
        <p className="panel-state">No staff accounts yet. Add them with the bootstrap command.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table staff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;
                const saving = savingId === member.id;
                return (
                  <tr key={member.id} className={member.isActive ? "" : "row-muted"}>
                    <td>
                      <span className="cell-strong">
                        {member.name}
                        {isSelf ? " (you)" : ""}
                      </span>
                      <span className="cell-subline">{member.email}</span>
                    </td>
                    <td>
                      <label>
                        <span className="sr-only">Role for {member.name}</span>
                        <select
                          className="inline-select"
                          value={member.role}
                          disabled={saving}
                          onChange={(event) => void update(member, { role: event.target.value })}
                        >
                          {STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`status-toggle ${member.isActive ? "status-toggle-on" : ""}`}
                        aria-pressed={member.isActive}
                        disabled={saving || (isSelf && member.isActive)}
                        title={isSelf ? "You can't deactivate your own account" : undefined}
                        onClick={() => void update(member, { isActive: !member.isActive })}
                      >
                        {member.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
