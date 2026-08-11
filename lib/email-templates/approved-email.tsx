/**
 * Email template: Memory Approved
 * 
 * Sent to memorial owner when they approve a memory (optional)
 * 
 * Phase 2B: Email Notifications
 */

interface ApprovedEmailProps {
  memorialTitle: string;
  memorialId: string;
  authorName: string | null;
  messageExcerpt: string;
  publicUrl: string;
}

/**
 * Generate approval email HTML
 */
export function renderApprovedEmail(props: ApprovedEmailProps): string {
  const displayName = props.authorName || 'Anonymous';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memory Approved</title>
</head>
<body style="background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #10b981; padding: 24px 48px;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0;">Memory Approved</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px 48px;">
              <p style="font-size: 16px; line-height: 26px; color: #333333; margin: 0 0 24px 0;">
                A memory for <strong>${props.memorialTitle}</strong> has been approved and is now visible on the public page.
              </p>
              
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="font-size: 14px; color: #666666; margin: 0 0 8px 0;">
                  <strong>From:</strong> ${displayName}
                </p>
                <p style="font-size: 15px; color: #333333; line-height: 24px; font-style: italic; margin: 0;">
                  ${props.messageExcerpt}${props.messageExcerpt.length >= 200 ? '...' : ''}
                </p>
              </div>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${props.publicUrl}" style="background-color: #10b981; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; display: inline-block;">
                      View on Public Page
                    </a>
                  </td>
                </tr>
              </table>
              
              <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 32px 0;">
              
              <p style="color: #8898aa; font-size: 12px; line-height: 16px; text-align: center; margin: 0;">
                This is a confirmation that you approved this memory.<br>
                You can manage memories from your dashboard.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
