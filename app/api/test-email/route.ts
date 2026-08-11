import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sendEmail } from '@/lib/email';
import { isPlatformAdmin } from '@/lib/auth/platformAdmin';

/**
 * POST /api/test-email
 *
 * Test endpoint to verify email sending works.
 * Platform-admin only — this was previously fully unauthenticated (the
 * auth check existed but was commented out), meaning anyone who found
 * this URL could send arbitrary emails through this app's email
 * provider to any address. Fixed as part of the pre-launch audit.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!isPlatformAdmin(userId)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden — platform admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { to } = body;

    if (!to || typeof to !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email address required' },
        { status: 400 }
      );
    }

    // Send test email
    const result = await sendEmail({
      to,
      subject: 'Test Email from Funeral Memorial SaaS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Test Email</title>
        </head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1 style="color: #3b82f6;">Email Setup Successful! 🎉</h1>
          <p>If you're seeing this, your email integration is working correctly.</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            This is a test email from your Funeral Memorial SaaS application.
          </p>
        </body>
        </html>
      `,
      text: 'Email setup successful! If you\'re seeing this, your email integration is working.',
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Test email sent successfully',
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to send email',
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[POST /api/test-email]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send test email' },
      { status: 500 }
    );
  }
}
