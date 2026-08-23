import Image from 'next/image';
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f1ea',
        padding: '3rem 1.5rem',
        fontFamily: "'Lora', Georgia, serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          display: 'flex',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(79,93,117,0.18)',
          background: '#fdfcfa',
        }}
      >
        {/* Brand panel */}
        <div
          style={{
            flex: '0 0 42%',
            background: '#4f5d75',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2.5rem 2rem',
          }}
          className="hidden md:flex"
        >
          <div
            style={{
              width: '100%',
              maxWidth: 260,
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            }}
          >
            <Image
              src="/logo-absolute-posterity.jpeg"
              alt="Absolute Posterity"
              width={520}
              height={650}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              priority
            />
          </div>
          <p
            style={{
              marginTop: '1.75rem',
              color: '#f4f1ea',
              fontSize: '0.85rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textAlign: 'center',
              opacity: 0.85,
            }}
          >
            Preserving what matters, always
          </p>
        </div>

        {/* Form panel */}
        <div
          style={{
            flex: 1,
            padding: '3rem 2.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 500,
                fontSize: '2rem',
                color: '#4f5d75',
                margin: 0,
              }}
            >
              Absolute Posterity
            </h2>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#7c8aa0' }}>
              Create your account
            </p>
          </div>

          <SignUp
            fallbackRedirectUrl="/onboarding"
            forceRedirectUrl="/onboarding"
            appearance={{
              variables: {
                colorPrimary: '#4f5d75',
                colorForeground: '#4f5d75',
                colorBackground: '#fdfcfa',
                colorInput: '#f4f1ea',
                colorInputForeground: '#4f5d75',
                fontFamily: "'Lora', Georgia, serif",
                borderRadius: '8px',
              },
              elements: {
                rootBox: 'mx-auto w-full',
                card: 'shadow-none w-full',
                formButtonPrimary: 'bg-[#4f5d75] hover:bg-[#3f4c61] text-sm normal-case',
                footerActionLink: 'text-[#cdba93] hover:text-[#b8a37c]',
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
