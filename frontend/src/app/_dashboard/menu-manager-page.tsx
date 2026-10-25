"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { formatMinorCurrency } from "../currency";
import {
  bodyFromDraft,
  DIETARY_LABELS,
  type DraftField,
  draftFromItem,
  EMPTY_DRAFT,
  itemsInCategory,
  type ManagedMenu,
  type ManagedMenuItem,
  type MenuItemDraft,
  moveCategory,
  moveItem,
  PREP_STATIONS,
  parseManagedMenu,
} from "./menu-manager-data";
import { Icon } from "./ui";
import { apiSend, useApiResource } from "./use-api";
import "./menu-manager.css";

interface MenuManagerPageProps {
  accessToken: string | null;
  refreshKey: number;
  onToast: (message: string) => void;
}

function labelFor(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");
}

function ItemForm({
  initial,
  categories,
  editing,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: MenuItemDraft;
  categories: string[];
  editing: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const set = (field: keyof MenuItemDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = bodyFromDraft(draft, editing);
    if ("errors" in result) {
      setErrors(result.errors);
      const first = (["name", "category", "price", "prepMinutes"] as const).find(
        (field) => result.errors[field],
      );
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setErrors({});
    onSubmit(result.body);
  };

  const field = (name: DraftField, label: string, input: React.ReactNode, hint?: string) => (
    <div className="menu-form-field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {input}
      {hint ? (
        <span className="menu-form-hint" id={`${id}-${name}-hint`}>
          {hint}
        </span>
      ) : null}
      {errors[name] ? (
        <span className="menu-form-error" id={`${id}-${name}-error`}>
          {errors[name]}
        </span>
      ) : null}
    </div>
  );
  const described = (name: DraftField, hint = false) =>
    [hint ? `${id}-${name}-hint` : "", errors[name] ? `${id}-${name}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form
      className="menu-item-form"
      onSubmit={submit}
      noValidate
      aria-label={editing ? `Edit ${initial.name}` : "Add a menu item"}
    >
      <div className="menu-form-grid">
        {field(
          "name",
          "Dish name",
          <input
            id={`${id}-name`}
            value={draft.name}
            maxLength={80}
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={described("name")}
            onChange={(event) => set("name", event.target.value)}
          />,
        )}
        {field(
          "category",
          "Category",
          <>
            <input
              id={`${id}-category`}
              value={draft.category}
              maxLength={40}
              list={`${id}-categories`}
              autoComplete="off"
              aria-invalid={Boolean(errors.category)}
              aria-describedby={described("category")}
              onChange={(event) => set("category", event.target.value)}
            />
            <datalist id={`${id}-categories`}>
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </>,
        )}
        {field(
          "price",
          "Price (₹)",
          <input
            id={`${id}-price`}
            value={draft.price}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={Boolean(errors.price)}
            aria-describedby={described("price", true)}
            onChange={(event) => set("price", event.target.value)}
          />,
          "In rupees, for example 285 or 285.50.",
        )}
      </div>
      <div className="menu-form-field">
        <label htmlFor={`${id}-description`}>Description (optional)</label>
        <textarea
          id={`${id}-description`}
          value={draft.description}
          maxLength={280}
          rows={2}
          onChange={(event) => set("description", event.target.value)}
        />
      </div>
      <fieldset className="menu-form-labels">
        <legend>Dietary labels</legend>
        {DIETARY_LABELS.map((label) => (
          <label key={label} className="menu-form-check">
            <input
              type="checkbox"
              checked={draft.dietaryLabels.includes(label)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dietaryLabels: event.target.checked
                    ? [...current.dietaryLabels, label]
                    : current.dietaryLabels.filter((entry) => entry !== label),
                }))
              }
            />
            {labelFor(label)}
          </label>
        ))}
      </fieldset>
      <div className="menu-form-grid">
        <div className="menu-form-field">
          <label htmlFor={`${id}-allergens`}>Allergens (optional)</label>
          <input
            id={`${id}-allergens`}
            value={draft.allergens}
            autoComplete="off"
            aria-describedby={`${id}-allergens-hint`}
            onChange={(event) => set("allergens", event.target.value)}
          />
          <span className="menu-form-hint" id={`${id}-allergens-hint`}>
            Separate with commas, for example dairy, peanuts.
          </span>
        </div>
        <div className="menu-form-field">
          <label htmlFor={`${id}-station`} id={`${id}-station-label`}>
            Prep station
          </label>
          <select
            id={`${id}-station`}
            aria-labelledby={`${id}-station-label`}
            value={draft.prepStation}
            onChange={(event) => set("prepStation", event.target.value)}
          >
            <option value="">Not set</option>
            {PREP_STATIONS.map((station) => (
              <option key={station} value={station}>
                {labelFor(station)}
              </option>
            ))}
          </select>
        </div>
        {field(
          "prepMinutes",
          "Prep minutes",
          <input
            id={`${id}-prepMinutes`}
            value={draft.prepMinutes}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(errors.prepMinutes)}
            aria-describedby={described("prepMinutes")}
            onChange={(event) => set("prepMinutes", event.target.value)}
          />,
        )}
      </div>
      <div className="menu-form-actions">
        <button className="button button-dark" type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add to menu"}
        </button>
        <button className="button button-outline" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** S4-05 menu manager: Managers and Administrators add, edit, order and archive dishes. */
export function MenuManagerPage({ accessToken, refreshKey, onToast }: MenuManagerPageProps) {
  const resource = useApiResource("/menu/items", accessToken, parseManagedMenu, refreshKey);
  const [menu, setMenu] = useState<ManagedMenu | null>(null);
  const [mode, setMode] = useState<
    { kind: "add" } | { kind: "edit"; item: ManagedMenuItem } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (resource.data) setMenu(resource.data);
  }, [resource.data]);

  const save = async (body: Record<string, unknown>) => {
    if (!accessToken || !mode) return;
    setSaving(true);
    const result =
      mode.kind === "add"
        ? await apiSend("/menu/items", accessToken, "POST", body)
        : await apiSend(`/menu/items/${mode.item.id}`, accessToken, "PATCH", body);
    setSaving(false);
    if (!result.ok) {
      onToast(result.message);
      return;
    }
    onToast(
      mode.kind === "add"
        ? `${String(body.name)} was added to the menu.`
        : `${String(body.name)} was updated.`,
    );
    setMode(null);
    resource.reload();
  };

  const setLocalAvailability = (itemId: string, isAvailable: boolean) =>
    setMenu((current) =>
      current
        ? {
            ...current,
            items: current.items.map((entry) =>
              entry.id === itemId ? { ...entry, isAvailable } : entry,
            ),
          }
        : current,
    );

  /** 86 switch: flips at once, then reverts if the API refuses. */
  const toggleAvailability = async (item: ManagedMenuItem) => {
    if (!accessToken) return;
    const next = !item.isAvailable;
    setLocalAvailability(item.id, next);
    setTogglingId(item.id);
    const result = await apiSend(`/menu/items/${item.id}/availability`, accessToken, "PATCH", {
      isAvailable: next,
    });
    setTogglingId(null);
    if (!result.ok) {
      setLocalAvailability(item.id, item.isAvailable);
      onToast(`${item.name} could not be changed: ${result.message}`);
      return;
    }
    onToast(next ? `${item.name} is back on the menu.` : `${item.name} is marked sold out.`);
  };

  const archive = async (item: ManagedMenuItem) => {
    if (!accessToken) return;
    setConfirmArchive(null);
    const result = await apiSend(`/menu/items/${item.id}`, accessToken, "DELETE");
    onToast(result.ok ? `${item.name} was archived and left the menu.` : result.message);
    if (result.ok) resource.reload();
  };

  const arrange = async (arrangement: { categories: string[]; itemIds: string[] } | null) => {
    if (!accessToken || !arrangement) return;
    const result = await apiSend<unknown>(
      "/menu/items/arrangement",
      accessToken,
      "PUT",
      arrangement,
    );
    const parsed = result.ok ? parseManagedMenu(result.data) : null;
    if (parsed) {
      setMenu(parsed);
      return;
    }
    onToast(result.message || "The new order could not be saved.");
    resource.reload();
  };

  const categories = menu?.categories ?? [];
  return (
    <article className="card menu-manager-card" aria-labelledby="menu-manager-title">
      <div className="orders-toolbar">
        <div>
          <div className="card-overline">MENU</div>
          <h2 id="menu-manager-title">Menu manager</h2>
        </div>
        <div className="menu-manager-tools">
          <button
            className="select-button"
            type="button"
            onClick={resource.reload}
            disabled={!accessToken || resource.status === "loading"}
          >
            <Icon name="refresh" size={15} />
            <span>Refresh</span>
          </button>
          <button
            className="button button-dark"
            type="button"
            onClick={() => setMode({ kind: "add" })}
            disabled={!accessToken || resource.status !== "live"}
          >
            <Icon name="plus" size={15} />
            <span>Add item</span>
          </button>
        </div>
      </div>
      {mode?.kind === "add" ? (
        <ItemForm
          initial={EMPTY_DRAFT}
          categories={categories}
          editing={false}
          saving={saving}
          onCancel={() => setMode(null)}
          onSubmit={(body) => void save(body)}
        />
      ) : null}
      {!accessToken ? (
        <p className="panel-state">Sign in as a Manager or Administrator to manage the menu.</p>
      ) : resource.status === "restricted" ? (
        <p className="panel-state">Only Managers and Administrators can manage the menu.</p>
      ) : resource.status === "unavailable" ? (
        <p className="panel-state panel-state-error">The menu could not be loaded.</p>
      ) : !menu ? (
        <p className="panel-state">Loading the menu…</p>
      ) : menu.items.length === 0 ? (
        <p className="panel-state">No dishes yet. Add the first one to open the menu.</p>
      ) : (
        categories.map((category, categoryIndex) => (
          <section key={category} className="menu-manager-category" aria-label={category}>
            <div className="menu-manager-category-head">
              <h3>{category}</h3>
              <div className="menu-manager-move">
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Move ${category} up`}
                  disabled={categoryIndex === 0}
                  onClick={() => void arrange(moveCategory(menu, category, -1))}
                >
                  <Icon name="arrow-up" size={15} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Move ${category} down`}
                  disabled={categoryIndex === categories.length - 1}
                  onClick={() => void arrange(moveCategory(menu, category, 1))}
                >
                  <Icon name="arrow-down" size={15} />
                </button>
              </div>
            </div>
            <ul className="menu-manager-list">
              {itemsInCategory(menu, category).map((item, index, siblings) => (
                <li key={item.id} className="menu-manager-row">
                  {mode?.kind === "edit" && mode.item.id === item.id ? (
                    <ItemForm
                      initial={draftFromItem(item)}
                      categories={categories}
                      editing
                      saving={saving}
                      onCancel={() => setMode(null)}
                      onSubmit={(body) => void save(body)}
                    />
                  ) : (
                    <>
                      <div className="menu-manager-item">
                        <strong>{item.name}</strong>
                        <span className="menu-manager-meta">
                          {formatMinorCurrency(item.priceMinor, "INR")}
                          {item.prepStation ? ` · ${labelFor(item.prepStation)}` : ""}
                          {item.prepMinutes ? ` · ${item.prepMinutes} min` : ""}
                          {item.optionGroups.length > 0
                            ? ` · ${item.optionGroups.map((group) => group.name).join(", ")}`
                            : ""}
                        </span>
                        {item.dietaryLabels.length + item.allergenLabels.length > 0 ? (
                          <span className="menu-manager-tags">
                            {item.dietaryLabels.map(labelFor).join(", ")}
                            {item.allergenLabels.length > 0
                              ? `${item.dietaryLabels.length > 0 ? " · " : ""}Contains ${item.allergenLabels.join(", ")}`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                      <button
                        className={`menu-availability ${item.isAvailable ? "menu-availability-on" : ""}`}
                        type="button"
                        role="switch"
                        aria-checked={item.isAvailable}
                        aria-label={`${item.name} available`}
                        disabled={togglingId === item.id}
                        onClick={() => void toggleAvailability(item)}
                      >
                        <span className="menu-switch-track" aria-hidden="true">
                          <span className="menu-switch-thumb" />
                        </span>
                        {item.isAvailable ? "On the menu" : "Sold out"}
                      </button>
                      <div className="menu-manager-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Move ${item.name} up`}
                          disabled={index === 0}
                          onClick={() => void arrange(moveItem(menu, item.id, -1))}
                        >
                          <Icon name="arrow-up" size={15} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Move ${item.name} down`}
                          disabled={index === siblings.length - 1}
                          onClick={() => void arrange(moveItem(menu, item.id, 1))}
                        >
                          <Icon name="arrow-down" size={15} />
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          aria-label={`Edit ${item.name}`}
                          onClick={() => {
                            setConfirmArchive(null);
                            setMode({ kind: "edit", item });
                          }}
                        >
                          Edit
                        </button>
                        {confirmArchive === item.id ? (
                          <>
                            <button
                              className="text-button menu-archive-confirm"
                              type="button"
                              aria-label={`Confirm archiving ${item.name}`}
                              onClick={() => void archive(item)}
                            >
                              Confirm archive
                            </button>
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => setConfirmArchive(null)}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            className="text-button"
                            type="button"
                            aria-label={`Archive ${item.name}`}
                            onClick={() => setConfirmArchive(item.id)}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {menu?.truncated ? <p className="health-data-note">Showing the first 300 dishes.</p> : null}
    </article>
  );
}
