// Plus Jakarta Sans — the landing page's body face. Self-hosted by next/font at
// build time, so it adds no third-party request and needs no CSP changes.
// (Cormorant Garamond, the headline face, is already loaded by app/globals.css.)
import { Plus_Jakarta_Sans } from 'next/font/google';

export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-jakarta',
});
