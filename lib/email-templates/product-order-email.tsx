/**
 * Email template: New Product Order
 *
 * Sent to the fulfillment/production address (PRODUCT_ORDER_EMAIL env var)
 * whenever staff create a new product request — plaque, card, print, etc.
 * This is the "tell the supplier to make this item" email.
 *
 * Not sent to the family — they never see this. Staff create the request
 * internally on the family's behalf (see app/api/memorials/[id]/products/route.ts).
 *
 * ✅ No external dependencies (plain HTML only)
 * ✅ Works without @react-email/components
 * ✅ Compatible with Resend and any email provider
 */

interface ProductOrderEmailProps {
  caseRef:        string | null;   // funeral home's own reference, if linked to a case
  deceasedName:   string;
  organisationName: string;
  productType:    string;
  quantity:       number;
  specifications: Record<string, unknown> | null;
  requestNotes:   string | null;
  serviceDate:    string | null;   // already formatted for display, or null
  publicUrl:      string;          // the memorial's public URL — this is what
                                    // gets engraved/printed as the QR code
  requestUrl:     string;          // deep link back to the dashboard product queue
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  plaque:   'Plaque',
  card:     'Memorial Card',
  print:    'Photo Print',
  keepsake: 'Keepsake',
  other:    'Other',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSpecRows(specs: Record<string, unknown> | null): string {
  if (!specs || Object.keys(specs).length === 0) return '';

  const rows = Object.entries(specs)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      return `
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 140px; vertical-align: top;">${escapeHtml(label)}</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(String(value))}</td>
        </tr>`;
    })
    .join('');

  if (!rows) return '';

  return `
    <tr>
      <td style="padding: 16px 48px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #e5e7eb; padding-top: 12px;">
          ${rows}
        </table>
      </td>
    </tr>`;
}

export function renderProductOrderEmail(props: ProductOrderEmailProps): string {
  const productLabel = PRODUCT_TYPE_LABELS[props.productType] ?? props.productType;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Product Order</title>
</head>
<body style="background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px;">

          <!-- Header -->
          <tr>
            <td style="background-color: #4f5d75; padding: 24px 48px;">
              <h1 style="color: #ffffff; font-size: 22px; font-weight: bold; margin: 0;">
                New Order: ${escapeHtml(productLabel)}
              </h1>
              <p style="color: #cdba93; font-size: 13px; margin: 4px 0 0;">
                ${escapeHtml(props.organisationName)}${props.caseRef ? ` · Ref ${escapeHtml(props.caseRef)}` : ''}
              </p>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="padding: 32px 48px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 140px; vertical-align: top;">For</td>
                  <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${escapeHtml(props.deceasedName)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Item</td>
                  <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(productLabel)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Quantity</td>
                  <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${props.quantity}</td>
                </tr>
                ${props.serviceDate ? `
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Service date</td>
                  <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(props.serviceDate)}</td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          ${renderSpecRows(props.specifications)}

          ${props.requestNotes ? `
          <tr>
            <td style="padding: 20px 48px 0;">
              <div style="background-color: #f9fafb; border-radius: 6px; padding: 14px 16px;">
                <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;">Notes</p>
                <p style="margin: 0; color: #111827; font-size: 14px; line-height: 1.5;">${escapeHtml(props.requestNotes)}</p>
              </div>
            </td>
          </tr>` : ''}

          <!-- QR / engraving URL — plain text, easy to copy exactly as-is -->
          <tr>
            <td style="padding: 20px 48px 0;">
              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 14px 16px;">
                <p style="margin: 0 0 6px; color: #92400e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;">
                  Website / QR code URL
                </p>
                <p style="margin: 0; color: #111827; font-size: 15px; font-family: 'SF Mono', Consolas, monospace; word-break: break-all;">
                  ${escapeHtml(props.publicUrl)}
                </p>
                <p style="margin: 6px 0 0; color: #92400e; font-size: 12px;">
                  Use this exact address for the engraved/printed QR code — do not shorten or edit it.
                </p>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 32px 48px 40px;">
              <a href="${props.requestUrl}" style="display: inline-block; background-color: #4f5d75; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
                View in dashboard
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 48px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This is an automated order notification. Reply to this thread or contact ${escapeHtml(props.organisationName)} directly with any questions.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
