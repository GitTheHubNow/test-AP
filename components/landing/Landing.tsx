// Public landing page for funeral directors — what Absolute Posterity is, what
// it costs, and how to sign in or start. Server component: everything static is
// rendered on the server; only the interactive demos below are client components.
//
// Copy and layout are from the supplied design. All styles live in landing.css,
// scoped under `.lp` so they cannot affect the rest of the app.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import './landing.css';
import { jakarta } from './fonts';
import { LandingStateProvider } from './LandingState';
import { LandingEffects } from './LandingEffects';
import { Motes } from './Motes';
import { LiveDemo } from './LiveDemo';
import { Gallery } from './Gallery';
import { VisitorDemo } from './VisitorDemo';
import { MarginCalculator } from './MarginCalculator';
import { AdvisoryBox } from './AdvisoryBox';
import { RETAIL_DEFAULT, RETAIL_MAX, RETAIL_MIN, SUBSCRIPTION, WHOLESALE_FEE, formatUsd, marginPerMemorial } from '@/lib/landing/pricing';

const MARGIN = formatUsd(marginPerMemorial(RETAIL_DEFAULT));
const RETAIL = formatUsd(RETAIL_DEFAULT);
const WHOLESALE = formatUsd(WHOLESALE_FEE);
const alt: CSSProperties = { background: 'var(--bg2)', borderBlock: '1px solid var(--line)' };

const FEATURES: { h: string; p: string }[] = [
  { h: 'Collection workspace', p: 'Staff and family upload photos, videos, stories and documents. Nothing is published until you approve it.' },
  { h: 'Photo sorting', p: 'Mark each photo for the tribute video or the memorial page, set a hero image, reject the rest, and filter by uploader.' },
  { h: 'Service-date unlocks', p: 'Photos, tribute video and guest book unlock when you set a service date, or you can unlock them early.' },
  { h: 'Family upload link', p: 'Share a link or QR code so anyone can add photos. No account needed.' },
  { h: 'Cultural advisories', p: 'Aboriginal, Torres Strait Islander, South Sea Islander and Māori notices, shown before visitors see the memorial.' },
  { h: 'Choose what visitors see', p: 'Show or hide the memories tab, gallery, guest book and memory count. Rename the guest book and its prompt.' },
  { h: 'Plaques, cards and keepsakes', p: 'Raise product requests per memorial and follow them in an organisation-wide fulfilment queue.' },
  { h: 'Analytics', p: 'Track visits to each memorial from its own analytics page.' },
  { h: 'Handover and archive', p: 'Hand over manually, on a date or immediately. Archived memorials leave public view and support can restore them.' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Do we keep access after handover?', a: 'No. Once the family accepts, they have full ownership and your funeral home no longer manages the memorial. The public memorial link stays the same for visitors.' },
  { q: 'Who handles support after handover?', a: `Absolute Posterity handles all end-user support once the ${WHOLESALE} fee is paid. Password resets, uploads and edits never reach your staff.` },
  { q: 'How is 25-year hosting guaranteed?', a: `Part of every ${WHOLESALE} fee goes into a dedicated digital preservation fund that backs redundant cloud storage for at least 25 years.` },
  { q: 'Can we change the retail price?', a: `Yes. ${RETAIL} is our suggestion. Charge ${formatUsd(RETAIL_MIN)}, ${formatUsd(RETAIL_MAX)} or bundle it into a package. Your wholesale cost stays ${WHOLESALE}.` },
  { q: 'What if a family exceeds 5 GB?', a: '5 GB holds thousands of photos and hours of video. If a family needs more, they upgrade from their own dashboard without involving you.' },
];

export function Landing({ year }: { year: number }) {
  return (
    <div className={`lp ${jakarta.variable}`}>
      <LandingStateProvider>
        <LandingEffects />

        <nav aria-label="Primary">
          <div className="w">
            <a className="logo" href="#">Absolute Posterity</a>
            <div className="links">
              <a href="#demo">Live demo</a><a href="#inside">Dashboard</a><a href="#features">Features</a>
              <a href="#visitor">Visitor view</a><a href="#margin">Margin</a><a href="#phases">How it works</a>
              <a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
            </div>
            <div className="nav-cta">
              <Link className="btn" href="/sign-in">Sign in</Link>
              <Link className="btn p" href="/sign-up"><span className="long">Start your free month</span><span className="short">Start free</span></Link>
            </div>
          </div>
        </nav>

        <header className="hero">
          <Motes />
          <div className="w">
            <div className="flame" /><div className="stem" />
            <h1>A memorial that lasts 25 years, and <em>{MARGIN} profit</em> on every service.</h1>
            <p className="lead">You create and curate the tribute during the service. When it ends, ownership passes to the family and our team handles every support call after that.</p>
            <div className="cta">
              <a className="btn p" href="#demo">Build a memorial in 60 seconds</a>
              <a className="btn" href="#margin">See your margin</a>
            </div>
            <p style={{ marginTop: 18, color: 'var(--gold)', fontSize: 15 }}>First month free. No ${SUBSCRIPTION} subscription fee while you get started.</p>
            <div className="facts">
              <div><b>{MARGIN}</b>margin per case at {RETAIL} retail</div>
              <div><b>25 years</b>guaranteed hosting</div>
              <div><b>0 hours</b>of post-service support</div>
              <div><b>5 GB</b>per memorial</div>
            </div>
          </div>
        </header>

        <section id="demo"><div className="w">
          <h2 className="rv">Try the real flow.</h2>
          <p className="lead rv">This mirrors the live platform: create the memorial, collect and approve content, then hand it to the family.</p>
          <LiveDemo />
        </div></section>

        <section id="inside" style={alt}><div className="w">
          <h2 className="rv">Every case at a glance.</h2>
          <p className="lead rv">Your dashboard shows what needs you: reviews waiting, missing service dates, handovers waiting on the family.</p>
          {/* Decorative illustration of the dashboard, not a working UI */}
          <div className="app rv" aria-hidden="true">
            <aside>
              <b>Absolute Posterity</b><small>Memorial platform</small>
              <span className="ni">Dashboard</span><span className="ni on">All memorials</span><span className="ni">New memorial</span>
              <span className="ni">Cases</span><span className="ni">Products</span><span className="ni">Org settings</span>
              <span className="ni">Billing</span><span className="ni">Contact support</span>
            </aside>
            <main>
              <h3>Memorials</h3>
              <div className="mc">
                <div className="r1"><i>EH</i><div><b>Eleanor Hawthorne</b><small>Created 15 Oct 2026</small></div><em>Active</em><span className="ab">Manage</span><span className="ab">Get link</span></div>
                <div className="r2"><span className="cp">⚠ No service date set</span><span className="cp go">🔒 Unlock photos, video and guest book early</span></div>
              </div>
              <div className="mc">
                <div className="r1"><i>AP</i><div><b>Arthur Pendleton</b><small>Created 30 Sep 2026</small></div><em>Active</em><span className="ab">Manage</span><span className="ab">View ↗</span></div>
                <div className="r2"><span className="cp">⚠ 1 to review</span><span className="cp">⚠ No service date set</span><span className="cp">⚠ Handover awaiting family</span></div>
              </div>
            </main>
          </div>
        </div></section>

        <section id="features"><div className="w">
          <h2 className="rv">See what is behind every memorial.</h2>
          <p className="lead rv">These are real screens from the platform your team will use.</p>
          <Gallery />
          <div className="grid rv">
            {FEATURES.map((f) => (<div className="tile" key={f.h}><h3>{f.h}</h3><p>{f.p}</p></div>))}
          </div>
        </div></section>

        <section id="visitor" style={alt}><div className="w">
          <h2 className="rv">What families and guests see.</h2>
          <p className="lead rv">A calm page that works on any phone, with no login. Guests share memories, sign the guest book and pass the link on. Change the look and the page responds.</p>
          <VisitorDemo />
        </div></section>

        <section id="margin" style={alt}><div className="w">
          <h2 className="rv">Set your price. Watch the margin move.</h2>
          <p className="lead rv">Your wholesale cost stays at {WHOLESALE} per memorial. Retail is up to you, with {RETAIL} as our suggested price.</p>
          <MarginCalculator />
          <div className="grid rv" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
            <div className="tile"><h3>Retail line item</h3><p>List it on the arrangements checklist at {RETAIL} and keep {MARGIN}.</p></div>
            <div className="tile"><h3>Package bundling</h3><p>Fold it into premium packages and justify the higher tier.</p></div>
            <div className="tile"><h3>Plaque upsell</h3><p>Pair it with bronze or granite QR plaques for gravesites and urns.</p></div>
          </div>
        </div></section>

        <section id="phases"><div className="w">
          <h2 className="rv">You run the service. They own the memory.</h2>
          <p className="lead rv">Most software makes funeral homes unpaid tech support for life. This one has two phases so you never are.</p>
          <div className="ph rv">
            <div>
              <h3>While the service runs</h3>
              <div className="sub">Covered by your ${SUBSCRIPTION} monthly subscription</div>
              <ul>
                <li><b>Five short steps.</b> Name, service, family and cultural details.</li>
                <li><b>Your branding</b> on every page.</li>
                <li><b>Tribute moderation</b> for notes, flowers and media.</li>
                <li><b>Print-ready QR codes</b> for booklets and memory tables.</li>
              </ul>
            </div>
            <div className="ar"><div>→</div>{WHOLESALE} triggers handover</div>
            <div>
              <h3>After the handover</h3>
              <div className="sub">{WHOLESALE} one-off wholesale fee</div>
              <ul>
                <li><b>Transfer by email link</b> to the family: manual, scheduled or immediate.</li>
                <li><b>Family takes full control</b> once they accept. Your access ends and the public link stays the same.</li>
                <li><b>25-year cloud vault</b> with 5 GB included.</li>
                <li><b>Support by us.</b> Resets, uploads and edits never reach you.</li>
              </ul>
            </div>
          </div>
        </div></section>

        <section style={alt}><div className="w cul">
          <div>
            <h2 className="rv">Built to respect every tradition.</h2>
            <p className="lead rv">Families come from many cultures. The platform lets you honour their protocols without custom work.</p>
            <ul className="rv">
              <li><b>Cultural advisories</b>Aboriginal, Torres Strait Islander, South Sea Islander and Māori notices, shown before visitors view the memorial.</li>
              <li><b>Protected workspaces</b>Private family links and pre-moderation before anything is public.</li>
              <li><b>Physical QR integration</b>Link plaques, urns and stationery to the online space.</li>
            </ul>
          </div>
          <AdvisoryBox />
        </div></section>

        <section id="pricing"><div className="w">
          <h2 className="rv">One monthly fee. One flat fee per family.</h2>
          <div className="pr rv">
            <div className="pc">
              <div>Funeral home subscription</div>
              <div className="pn">${SUBSCRIPTION}<small> / month</small></div>
              <div style={{ color: 'var(--gold)', fontSize: 14, marginTop: -6 }}>Your first month is free. No subscription fee.</div>
              <ul><li>Unlimited active cases</li><li>Custom branding and domain</li><li>Staff seats and moderation</li><li>QR code generation</li></ul>
              <Link className="btn" href="/sign-up">Start your free month</Link>
            </div>
            <div className="pc hl">
              <div>Per-memorial handover</div>
              <div className="pn">{WHOLESALE}<small> / memorial</small></div>
              <ul>
                <li>25-year guaranteed hosting</li><li>5 GB media storage</li><li>Full ownership to the family</li>
                <li>All end-user support by us</li><li>Suggested retail {RETAIL}, you keep {MARGIN}</li>
              </ul>
              <Link className="btn p" href="/sign-up">Onboard your home</Link>
            </div>
          </div>
        </div></section>

        <section id="faq" style={{ paddingTop: 0 }}><div className="w">
          <h2 className="rv">Questions directors ask</h2>
          <div className="rv">
            {FAQ.map((f) => (<details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>))}
          </div>
        </div></section>

        <section className="end"><div className="w">
          <div className="flame s" style={{ margin: '0 auto 24px' }} />
          <h2 className="rv">Offer families something that outlasts the service.</h2>
          <p className="lead rv">Your first month is free. Stage your next memorial today.</p>
          <Link className="btn p" href="/sign-up">Start your free month</Link>
        </div></section>

        <div className="legal">
          © {year} Absolute Posterity Ltd. · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <a href="mailto:support@memoriam.com">Director support</a>
        </div>
      </LandingStateProvider>
    </div>
  );
}
