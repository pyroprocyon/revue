import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { PolicyLinks } from '../../../shared/ui/PolicyLinks';
import { SupportLink } from '../../../shared/ui/SupportLink';
import { Screen } from '../../../shared/ui/Screen';

export function PrivacyPage() {
  return <Screen top={<HomeLink />}>
    <article className="space-y-5 pt-6 text-body">
      <h1 className="text-title font-extrabold tracking-tight">Pilot privacy notice</h1>
      <p className="text-support text-muted">Updated 9 November 2026</p>
      <p>Revue is an invited learning pilot for adults aged 18 or older, run by its creator. For account help, a copy of your information, corrections or removal, email <SupportLink />.</p>
      <p>We store your username, a securely hashed password, your adult and privacy confirmations, account timestamps and session information to provide your account. Registration doesn’t ask for your email address or send verification emails. If you email support, we receive your email address and message so we can respond.</p>
      <p>Other learners cannot access your private account through an invitation or a shared set link. Public trial practice is not saved. Saving sets and personal review history are not available in this version.</p>
      <p>Cookies keep you signed in and protect account actions. Passwords stay out of browser storage and analytics. Render hosts the app and Neon stores account data. Hosting logs may include your IP address and request information. Google provides our Gmail support inbox. Google sign-in and automated verification emails are not used by this pilot.</p>
      <p>We keep account information while you participate. The operator handles removal requests personally; automatic account cleanup and self-service deletion are not available yet. When arranging removal, the operator will explain the timing and any remaining backup copies.</p>
      <p>Knowing a username or emailing support alone is not proof that an account belongs to you. Account recovery is handled personally with known invited testers.</p>
    </article>
    <PolicyLinks />
  </Screen>;
}
