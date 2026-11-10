import { SupportLink } from '../../../shared/ui/SupportLink';
import { PolicyPageLayout } from './PolicyPageLayout';

export function PrivacyPage() {
  return (
    <PolicyPageLayout title="Privacy notice" updated="9 November 2026">
      <div className="space-y-4">
        <p>We keep your username, hashed password, age and privacy confirmations, and sign-in details to run your account. Cookies keep you signed in and protect account actions.</p>
        <p>Public practice isn’t saved. Shared links don’t give others access to your account.</p>
        <p>For account help, a copy, correction or removal of your data, email us. Requests are handled personally.</p>
        <SupportLink className="inline-flex min-h-12 max-w-full items-center" />
      </div>
      <details className="border-t border-line pt-2">
        <summary className="min-h-12 cursor-pointer rounded-sm py-3 text-support font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          More privacy details
        </summary>
        <div className="mt-3 space-y-4 text-support text-muted">
          <p>Revue is run by its creator for invited adults (18+). We also keep account timestamps. Signup does not collect email or send verification messages. Support receives your email address and message so we can respond.</p>
          <p>Render hosts Revue, Neon stores account data, and Google provides the support inbox. Hosting logs may include your IP address and request details. Google sign-in is not used. Passwords stay out of browser storage and analytics.</p>
          <p>Saved sets and personal review history are not available yet.</p>
          <p>Account data is kept while you participate. There’s no automatic cleanup or self-service deletion. We’ll explain removal timing and any remaining backup copies.</p>
          <p>Recovery is handled personally with known invitees. A username or email alone is not proof of account ownership.</p>
        </div>
      </details>
    </PolicyPageLayout>
  );
}
