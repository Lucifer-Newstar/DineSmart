"use client";

import type { InventoryItem, InventoryViewStatus } from "./types";
import { Icon } from "./ui";
import { InventoryRows } from "./widgets";

export function InventoryPage({
  inventory,
  onRestock,
  canManageInventory,
  inventoryStatus,
  inventoryTruncated,
  onRefresh,
}: {
  inventory: InventoryItem[];
  onRestock: (item: InventoryItem, quantity: number) => Promise<boolean>;
  canManageInventory: boolean;
  inventoryStatus: InventoryViewStatus;
  inventoryTruncated: boolean;
  onRefresh: () => void;
}) {
  const lowCount = inventory.filter((item) => item.onHand <= item.minimum).length;
  return (
    <>
      <section className="inventory-summary-row">
        <div className="inventory-summary-box">
          <span className="summary-icon summary-icon-coral">
            <Icon name="alert" size={18} />
          </span>
          <div>
            <span>Below reorder point</span>
            <strong>
              {lowCount} <small>items</small>
            </strong>
          </div>
        </div>
        <div className="inventory-summary-box">
          <span className="summary-icon summary-icon-green">
            <Icon name="box" size={18} />
          </span>
          <div>
            <span>Healthy stock</span>
            <strong>
              {inventory.length - lowCount} <small>items</small>
            </strong>
          </div>
        </div>
        <div className="inventory-summary-box inventory-supplier">
          <div>
            <span>Supplier connection</span>
            <strong>Preview only</strong>
            <small>No live supplier integration</small>
          </div>
          <span className="supplier-icon">
            <Icon name="arrow-right" size={16} />
          </span>
        </div>
      </section>
      <article className="card inventory-page-card">
        <div className="orders-toolbar">
          <div>
            <div className="card-overline">
              {canManageInventory ? "STOCK CONTROL" : "STOCK AVAILABILITY"} ·{" "}
              {inventoryStatus === "live"
                ? "LIVE"
                : inventoryStatus === "loading"
                  ? "LOADING"
                  : inventoryStatus === "unavailable"
                    ? "PREVIEW · API OFFLINE"
                    : "PREVIEW"}
            </div>
            <h2>Inventory snapshot</h2>
          </div>
          {inventoryStatus !== "preview" ? (
            <button
              className="icon-button"
              type="button"
              aria-label="Refresh inventory"
              title="Refresh inventory"
              onClick={onRefresh}
              disabled={inventoryStatus === "loading"}
            >
              <Icon name="refresh" size={16} />
            </button>
          ) : null}
        </div>
        {canManageInventory ? (
          <p className="health-data-note inventory-adjustment-hint">
            Set the exact on-hand count for each item. Stock is not deducted automatically.
          </p>
        ) : null}
        <InventoryRows inventory={inventory} onRestock={onRestock} canManage={canManageInventory} />
        {inventoryTruncated ? (
          <p className="health-data-note">Showing the first 2,000 inventory items.</p>
        ) : null}
      </article>
      {inventoryStatus !== "live" ? (
        <article className="stock-guidance">
          <span className="stock-guidance-icon">
            <Icon name="spark" size={18} />
          </span>
          <div>
            <strong>Preview guidance for the dinner rush</strong>
            <p>
              Sample paneer and spinach are below their reorder points. Live recommendations require
              connected incident data.
            </p>
          </div>
          <span className="guidance-pill">Sample only</span>
        </article>
      ) : null}
      <p className="preview-note" role={inventoryStatus === "unavailable" ? "alert" : "status"}>
        <Icon name="alert" size={15} />
        {inventoryStatus === "live"
          ? canManageInventory
            ? "Inventory counts are loaded from the API; manager stock adjustments save to the restaurant record."
            : "Inventory availability is live and read-only for this role."
          : inventoryStatus === "loading"
            ? "Loading live inventory. Sample rows are shown until it arrives; preview adjustments are not saved."
            : inventoryStatus === "unavailable"
              ? "Live inventory could not be loaded. Showing sample data; preview adjustments are not saved. Refresh to retry."
              : "Showing sample inventory. Adjustments in this preview are not persisted."}
      </p>
    </>
  );
}
