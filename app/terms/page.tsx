// app/terms/page.tsx
//
// DRAFT — written to match how the product actually behaves (invoice billing,
// funeral-home sites, family handover). It has NOT been reviewed by a lawyer.
// Have it reviewed before real funeral homes sign up, then bump
// CURRENT_TERMS_VERSION in lib/legal.ts so existing sites are re-asked.

import type { Metadata } from 'next';
import { LegalPage, H2 } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Terms of Service — Absolute Posterity' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern use of Absolute Posterity (&ldquo;the Service&rdquo;) by funeral homes,
        pet-aftercare providers and their staff (&ldquo;Sites&rdquo;), and by families and visitors who
        use the memorial pages those Sites create. By creating an account you agree to them on behalf of
        your organisation.
      </p>

      <H2>1. The Service</H2>
      <p>
        The Service lets a Site create online memorials, collect photos, stories and tributes from
        families, and hand a memorial over to the family. We may change or improve features over time.
      </p>

      <H2>2. Your responsibilities</H2>
      <p>
        You must have the authority of the family (or the pet&rsquo;s owner) to create a memorial, and you
        must only upload content you have the right to use. You must not create memorials for people who
        are living, to impersonate or harass anyone, or to publish unlawful, defamatory or abusive
        content. You are responsible for your staff&rsquo;s use of your account and for keeping sign-in
        details secure.
      </p>

      <H2>3. Content and moderation</H2>
      <p>
        You and the family own the content on a memorial. You give us a licence to store, process and
        display it as needed to run the Service. Visitor submissions (tributes, guest-book entries,
        photos) may be held for approval; the memorial owner is responsible for what they approve. We may
        remove content or suspend a memorial that breaches these terms or that we are legally required to
        remove. To report a memorial, email support@memoriam.com.
      </p>

      <H2>4. Fees and billing</H2>
      <p>
        Fees are charged by invoice in Australian dollars: a monthly platform fee plus a fee for each
        memorial created, at the rates agreed with your Site (or our published defaults). A free trial may
        apply to new Sites; during the trial no charges accrue and trial limits may apply. Statements are
        emailed monthly and are payable by the due date shown. We may suspend the ability to create new
        memorials on an overdue account; existing memorials stay accessible.
      </p>

      <H2>5. Handover to families</H2>
      <p>
        A Site may hand a memorial over to the family. After handover the family controls the memorial and
        the Site&rsquo;s staff access ends, as described in the product at the time of handover.
      </p>

      <H2>6. Availability and liability</H2>
      <p>
        We aim to keep the Service available and to protect stored content, but we do not guarantee
        uninterrupted service. To the extent the law allows, our liability is limited to the fees you paid
        in the preceding three months, and we are not liable for indirect or consequential loss. Nothing
        in these terms excludes rights you have under the Australian Consumer Law that cannot be excluded.
      </p>

      <H2>7. Ending the agreement</H2>
      <p>
        You may stop using the Service at any time. We may suspend or end access for breach of these
        terms. Content is retained as described in our Privacy Policy.
      </p>

      <H2>8. Governing law</H2>
      <p>These terms are governed by the laws of Queensland, Australia.</p>
    </LegalPage>
  );
}
