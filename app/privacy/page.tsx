// app/privacy/page.tsx
//
// DRAFT — describes what the code actually collects. NOT reviewed by a
// lawyer. Review (Privacy Act 1988 / APPs) before real funeral homes sign up,
// then bump CURRENT_TERMS_VERSION in lib/legal.ts.

import type { Metadata } from 'next';
import { LegalPage, H2 } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy — Absolute Posterity' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what personal information Absolute Posterity collects, why, and who can see
        it. It covers Sites (funeral homes and similar providers), families, and visitors to memorial
        pages.
      </p>

      <H2>What we collect</H2>
      <p>
        <strong>Site staff:</strong> name, email and sign-in details (handled by our authentication
        provider), the organisation&rsquo;s details, and billing contact information.
      </p>
      <p>
        <strong>Memorials and cases:</strong> the name, dates, service details and photos of the person
        (or pet) being remembered, and family contact name, email and phone. Some fields may relate to
        cultural background; these are optional and used only to present the memorial appropriately.
      </p>
      <p>
        <strong>Visitors and contributors:</strong> anything they choose to submit (tributes, names,
        locations, photos). For abuse prevention we store a one-way hash of the visitor&rsquo;s IP address,
        not the address itself, and basic visit counts.
      </p>

      <H2>How we use it</H2>
      <p>
        To run the Service: displaying memorials, emailing handover and notification messages, producing
        QR codes, billing Sites, preventing abuse, and keeping an audit trail of changes. We do not sell
        personal information or use memorial content for advertising.
      </p>

      <H2>Who sees it</H2>
      <p>
        Published memorials are visible to anyone with the link or QR code (some may be protected by a
        passcode). Site staff see their own Site&rsquo;s data only. We use service providers to operate
        the Service &mdash; for example hosting, database, file storage, email delivery and
        authentication &mdash; who process data on our behalf.
      </p>

      <H2>Where it is stored</H2>
      <p>
        Data is stored with our infrastructure providers, which may process it outside Australia. We
        take reasonable steps to ensure it is protected.
      </p>

      <H2>Retention and deletion</H2>
      <p>
        Memorial content is kept while the memorial is active and for a period after it expires so it can
        be restored. A family or Site can ask us to delete a memorial or personal information by emailing
        us; we will act on verified requests promptly, subject to legal obligations.
      </p>

      <H2>Your rights</H2>
      <p>
        You may ask to access or correct personal information we hold about you, or make a privacy
        complaint, by emailing us. If you are not satisfied with our response you can contact the Office
        of the Australian Information Commissioner (oaic.gov.au).
      </p>
    </LegalPage>
  );
}
