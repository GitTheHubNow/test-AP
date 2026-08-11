/**
 * Email template: New Memory Submitted
 * 
 * Sent to memorial owner when someone submits a new memory.
 * 
 * ✅ No external dependencies (plain HTML only)
 * ✅ Works without @react-email/components
 * ✅ Compatible with Resend and any email provider
 */

interface NewMemoryEmailProps {
  memorialTitle: string;
  memorialId: string;
  authorName: string | null;
  messageExcerpt: string;
  moderationUrl: string;
}

/**
 * Generate the email HTML for a new memory notification.
 * Uses plain HTML table layout for maximum email client compatibility.
 */
export function renderNewMemoryEmail(props: NewMemoryEmailProps): string {
  const displayName = props.authorName || 'Anonymous';
  const excerpt = props.messageExcerpt.length >= 200
    ? props.messageExcerpt.substring(0, 200) + '...'
    : props.messageExcerpt;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Memory Submitted</title>
</head>
<body style="background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px;">

          <!-- Header -->
          <tr>
            <td style="background-color: #3b82f6; padding: 24px 48px;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0;">
                New Memory Submitted
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 48px;">

              <!-- Intro -->
              <p style="font-size: 16px; line-height: 26px; color: #333333; margin: 0 0 24px 0;">
                A new memory has been submitted for <strong>${props.memorialTitle}</strong>.
              </p>

              <!-- Memory Preview Box -->
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
                <p style="font-size: 14px; color: #666666; margin: 0 0 8px 0;">
                  <strong>From:</strong> ${displayName}
                </p>
                <p style="font-size: 15px; color: #333333; line-height: 24px; font-style: italic; margin: 0;">
                  ${excerpt}
                </p>
              </div>

              <!-- Call to action -->
              <p style="font-size: 16px; line-height: 26px; color: #333333; margin: 0 0 24px 0;">
                Please review and approve or reject this memory from your moderation dashboard.
              </p>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 32px 0;">
                    <a href="${props.moderationUrl}"
                       style="background-color: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; display: inline-block;">
                      Review Memory
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 0 0 24px 0;">

              <!-- Footer -->
              <p style="color: #8898aa; font-size: 12px; line-height: 18px; text-align: center; margin: 0;">
                This notification was sent because you own this memorial.<br>
                You can manage all your memorials from your dashboard.
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
