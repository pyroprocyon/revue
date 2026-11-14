import { Link } from 'react-router';
import { textLink } from '../../../shared/ui/buttonStyles';
import { PolicyPageLayout } from './PolicyPageLayout';

export function PrivacyPage() {
  return (
    <PolicyPageLayout title="Privacy notice">
      <div className="space-y-4">
        <p>We keep your username and a protected version of your password to run your account. Cookies help keep you signed in securely.</p>
        <p>We keep the sets you save, your ratings, study dates and review schedules. Typed answers stay in your browser. Public trial attempts aren’t saved, and sharing a set doesn’t share your account.</p>
        <p>Removing a set from your Library keeps your progress so you can resume if you save it again.</p>
        <p>You can request a copy of your data, corrections, or removal. We handle these requests directly.</p>
        <Link to="/terms#help-and-corrections" className={`${textLink} inline-flex min-h-12 items-center`}>Contact us</Link>
      </div>
      <details className="border-t border-line pt-2">
        <summary className="min-h-12 cursor-pointer rounded-sm py-3 text-support font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          More privacy details
        </summary>
        <div className="mt-3 space-y-4 text-support text-muted">
          <p>Revue is run by its creator. We also keep account dates, such as when you signed up. Signup doesn’t ask for an email address. If you joined an earlier pilot, we may still have your signup confirmations.</p>
          <p>Render runs the app, Neon stores account and Library data, and Google provides the support inbox. Hosting records may include your IP address and requests to the app.</p>
          <p>If you email us, we receive your email address and message so we can reply.</p>
          <p>We keep account information and saved sets while you participate. There’s no automatic deletion. If you request removal, we’ll explain the timing and any copies remaining in backups.</p>
        </div>
      </details>
    </PolicyPageLayout>
  );
}
