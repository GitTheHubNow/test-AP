# apply-update.ps1 — run from the project root AFTER the zip has been extracted.
$ErrorActionPreference = 'Continue'
Write-Host "1/5 Removing old Stripe files..." -ForegroundColor Cyan
$stale = @(
  'app\api\billing\checkout','app\api\billing\portal','app\api\billing\webhook',
  'app\api\cron\reset-usage','app\onboarding\payment',
  'components\onboarding\OnboardingSteps.tsx','lib\stripe.ts',
  'lib\billing\format.ts','lib\billing\__tests__\format.test.ts'
)
foreach ($p in $stale) { if (Test-Path $p) { Remove-Item -Recurse -Force $p; Write-Host "   removed $p" } }

Write-Host "2/5 Clearing build cache..." -ForegroundColor Cyan
if (Test-Path .next) { Remove-Item -Recurse -Force .next }

Write-Host "3/5 Installing packages (drops stripe)..." -ForegroundColor Cyan
npm install --no-audit --no-fund

Write-Host "4/5 Regenerating Prisma client..." -ForegroundColor Cyan
npx prisma generate

Write-Host "5/5 Type-checking..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -eq 0) {
  Write-Host "`nAll good: 0 type errors." -ForegroundColor Green
  Write-Host "Next: set BILLING_PAYMENT_INSTRUCTIONS in Vercel (lowercase true/false for BILLING_AUTO_SEND), then: npx prisma migrate deploy ; git add -A ; git commit -m 'Manual billing' ; git push" -ForegroundColor Yellow
} else { Write-Host "`nType errors above - paste them to me." -ForegroundColor Red }
