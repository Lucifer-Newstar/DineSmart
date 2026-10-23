"use client";

import { useState } from "react";
import { formatMinorCurrency } from "../currency";
import type { Order } from "./types";
import { Icon } from "./ui";
import { apiSend, isRecord } from "./use-api";

export interface Bill {
  id: string;
  orderId: string;
  lineItems: Array<{ name: string; quantity: number; unitPriceMinor: number }>;
  subtotalMinor: number;
  taxMinor: number;
  adjustmentsMinor: number;
  totalMinor: number;
  currency: string;
  status: string;
}

const BILLABLE = new Set(["Ready", "Served", "Completed"]);

export function parseBill(value: unknown): Bill | null {
  const raw = isRecord(value) && isRecord(value.bill) ? value.bill : null;
  if (!raw || typeof raw.id !== "string" || typeof raw.orderId !== "string") return null;
  if (!Array.isArray(raw.lineItems) || typeof raw.totalMinor !== "number") return null;
  const number = (field: unknown) => (typeof field === "number" ? field : 0);
  return {
    id: raw.id,
    orderId: raw.orderId,
    lineItems: raw.lineItems.flatMap((item) =>
      isRecord(item) && typeof item.name === "string"
        ? [
            {
              name: item.name,
              quantity: number(item.quantity),
              unitPriceMinor: number(item.unitPriceMinor),
            },
          ]
        : [],
    ),
    subtotalMinor: number(raw.subtotalMinor),
    taxMinor: number(raw.taxMinor),
    adjustmentsMinor: number(raw.adjustmentsMinor),
    totalMinor: raw.totalMinor,
    currency: typeof raw.currency === "string" ? raw.currency : "INR",
    status: typeof raw.status === "string" ? raw.status : "issued",
  };
}

interface BillingPanelProps {
  accessToken: string | null;
  orders: readonly Order[];
  onToast: (message: string) => void;
}

/** S2-14: generate (idempotently) and show the bill for a ready or served order. */
export function BillingPanel({ accessToken, orders, onToast }: BillingPanelProps) {
  const [bills, setBills] = useState<Record<string, Bill>>({});
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const billable = orders.filter((order) => BILLABLE.has(order.status));

  const showBill = async (order: Order) => {
    if (bills[order.id]) {
      setOpenOrderId(openOrderId === order.id ? null : order.id);
      return;
    }
    if (!accessToken) return;
    setBusyId(order.id);
    const result = await apiSend<unknown>("/bills", accessToken, "POST", { orderId: order.id });
    setBusyId(null);
    const bill = result.ok ? parseBill(result.data) : null;
    if (!bill) {
      onToast(result.message || "The bill could not be generated.");
      return;
    }
    setBills((current) => ({ ...current, [order.id]: bill }));
    setOpenOrderId(order.id);
    onToast(result.status === 201 ? "Bill generated." : "Showing the existing bill.");
  };

  return (
    <article className="card billing-card">
      <div className="orders-toolbar">
        <div>
          <div className="card-overline">BILLING</div>
          <h2>Bills for ready orders</h2>
        </div>
      </div>
      {billable.length === 0 ? (
        <p className="panel-state">Orders show up here once they are ready or served.</p>
      ) : (
        <ul className="billing-list">
          {billable.map((order) => {
            const bill = bills[order.id];
            const open = openOrderId === order.id && bill;
            return (
              <li key={order.id}>
                <div className="billing-row">
                  <div>
                    <span className="cell-strong">
                      {order.guest} · {order.table}
                    </span>
                    <span className="cell-subline">
                      {order.items} · {order.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="select-button"
                    disabled={busyId === order.id}
                    aria-expanded={Boolean(open)}
                    onClick={() => void showBill(order)}
                  >
                    <Icon name="receipt" size={15} />
                    <span>
                      {busyId === order.id
                        ? "Preparing…"
                        : bill
                          ? open
                            ? "Hide"
                            : "View bill"
                          : "Bill"}
                    </span>
                  </button>
                </div>
                {open ? (
                  <div className="bill-sheet">
                    <table className="bill-lines">
                      <tbody>
                        {bill.lineItems.map((item) => (
                          <tr key={`${item.name}-${item.quantity}-${item.unitPriceMinor}`}>
                            <td>
                              {item.quantity} × {item.name}
                            </td>
                            <td>
                              {formatMinorCurrency(
                                item.quantity * item.unitPriceMinor,
                                bill.currency,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Subtotal</td>
                          <td>{formatMinorCurrency(bill.subtotalMinor, bill.currency)}</td>
                        </tr>
                        <tr>
                          <td>Tax</td>
                          <td>{formatMinorCurrency(bill.taxMinor, bill.currency)}</td>
                        </tr>
                        {bill.adjustmentsMinor ? (
                          <tr>
                            <td>Adjustments</td>
                            <td>{formatMinorCurrency(bill.adjustmentsMinor, bill.currency)}</td>
                          </tr>
                        ) : null}
                        <tr className="bill-total">
                          <td>Total</td>
                          <td>{formatMinorCurrency(bill.totalMinor, bill.currency)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
