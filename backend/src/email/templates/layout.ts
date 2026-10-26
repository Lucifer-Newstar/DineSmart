import type { EmailAttachment, EmailMessage } from "../email-transport.js";

/**
 * Shared email layout (S5-04). Every message is built from the same blocks so
 * the plain-text part and the HTML part always say the same thing. Plain text
 * is the source of truth; the HTML adds the brand header and simple styling.
 */

export type EmailBlock = string | { label: string; value: string };

export interface EmailContent {
  to: string;
  subject: string;
  blocks: EmailBlock[];
  attachments?: EmailAttachment[];
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

export function emailText(blocks: EmailBlock[]): string {
  return blocks
    .map((block) => (typeof block === "string" ? block : `${block.label}: ${block.value}`))
    .join("\n\n");
}

export function emailHtml(subject: string, blocks: EmailBlock[]): string {
  const body = blocks
    .map((block) =>
      typeof block === "string"
        ? `<p style="margin:0 0 14px">${escapeHtml(block)}</p>`
        : `<p style="margin:0 0 14px"><strong>${escapeHtml(block.label)}:</strong> ${escapeHtml(block.value)}</p>`,
    )
    .join("\n");
  return [
    "<!doctype html>",
    '<html lang="en">',
    `<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;padding:24px;background:#f6f3ea;font-family:Arial,Helvetica,sans-serif;color:#1f2a22;font-size:15px;line-height:1.5">',
    '<div style="max-width:560px;margin:0 auto;padding:24px;background:#fffdf8;border:1px solid #e3dfd2;border-radius:12px">',
    '<p style="margin:0 0 18px;font-weight:bold;color:#2f5d3a">DineSmart</p>',
    body,
    "</div>",
    "</body>",
    "</html>",
  ].join("\n");
}

/** Builds a message with matching text and HTML parts. */
export function composeEmail(content: EmailContent): EmailMessage {
  return {
    to: content.to,
    subject: content.subject,
    text: emailText(content.blocks),
    html: emailHtml(content.subject, content.blocks),
    ...(content.attachments?.length ? { attachments: content.attachments } : {}),
  };
}
