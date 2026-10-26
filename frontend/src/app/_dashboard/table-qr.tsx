"use client";

import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { menuLinkFor, parseQrLinks, qrModulesPath, type TableQrLink } from "./table-qr-data";
import "./table-qr.css";
import { apiSend, useApiResource } from "./use-api";

function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const encoded = encode(value, { ecc: "M", border: 2 });
    return { path: qrModulesPath(encoded.data), size: encoded.size };
  }, [value]);
  return (
    <svg
      aria-label={label}
      className="qr-code"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${size} ${size}`}
    >
      <rect fill="#fff" height={size} width={size} />
      <path d={path} fill="#111" />
    </svg>
  );
}

/** S5-03: one printable card per table; each QR opens the menu for that table. */
export function TableQrPanel({
  accessToken,
  canRotate,
  onToast,
}: {
  accessToken: string | null;
  canRotate: boolean;
  onToast: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [origin, setOrigin] = useState("");
  const [rotating, setRotating] = useState("");
  const links = useApiResource(open ? "/tables/qr" : null, accessToken, parseQrLinks, refreshKey);

  useEffect(() => setOrigin(window.location.origin), []);

  const rotate = async (link: TableQrLink) => {
    if (!accessToken) return;
    setRotating(link.tableId);
    const result = await apiSend(`/tables/${link.tableId}/qr/rotate`, accessToken, "POST", {});
    setRotating("");
    onToast(
      result.ok
        ? `Table ${link.tableNumber} has a new QR code. Reprint its card; the old one no longer works.`
        : result.message,
    );
    if (result.ok) setRefreshKey((current) => current + 1);
  };

  return (
    <section className="card table-qr-card" aria-labelledby="table-qr-title">
      <div className="orders-toolbar">
        <div>
          <div className="card-overline">DINE-IN ORDERING</div>
          <h2 id="table-qr-title">Table QR cards</h2>
        </div>
        <div className="reservation-actions">
          {open ? (
            <button className="table-action" type="button" onClick={() => window.print()}>
              Print cards
            </button>
          ) : null}
          <button
            className="table-action"
            type="button"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "Hide cards" : "Show QR cards"}
          </button>
        </div>
      </div>
      {open ? (
        links.status === "loading" && !links.data ? (
          <p className="panel-state">Loading table links…</p>
        ) : links.status === "restricted" ? (
          <p className="panel-state">Your role can&apos;t print table cards.</p>
        ) : !links.data || links.status === "unavailable" ? (
          <p className="panel-state panel-state-error">Table links could not be loaded.</p>
        ) : links.data.length === 0 ? (
          <p className="panel-state">Add tables to print their cards.</p>
        ) : (
          <ul className="qr-sheet">
            {links.data.map((link) => {
              const url = origin ? menuLinkFor(origin, link.token) : "";
              return (
                <li className="qr-print-card" key={link.tableId}>
                  <span className="qr-card-brand">DineSmart</span>
                  <strong className="qr-card-table">Table {link.tableNumber}</strong>
                  {url ? (
                    <QrCode label={`QR code for table ${link.tableNumber}`} value={url} />
                  ) : null}
                  <span className="qr-card-hint">
                    Scan to see the menu and order from your table
                  </span>
                  {canRotate ? (
                    <button
                      className="text-link qr-card-rotate"
                      disabled={rotating === link.tableId}
                      type="button"
                      onClick={() => void rotate(link)}
                    >
                      {rotating === link.tableId
                        ? "Replacing…"
                        : `Replace code for table ${link.tableNumber}`}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <p className="cell-subline">
          Print a card for each table. Guests scan it to order, and the kitchen sees the table
          number.
        </p>
      )}
    </section>
  );
}
