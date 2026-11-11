import { SupportLink } from '../../../shared/ui/SupportLink';
import { PolicyPageLayout, PolicySection } from './PolicyPageLayout';

export function TermsPage() {
  return (
    <PolicyPageLayout title="Terms">
      <PolicySection title="Using Revue">
        <p>Pilot accounts are available by invitation. Use your own account, keep your password and unused invitation link private, and respect other learners and credited sources.</p>
      </PolicySection>
      <PolicySection title="Learning limits">
        <p>Revue is in early development. Features may change, and cards may contain mistakes. Check the credited sources. Practice results do not guarantee exam or job outcomes.</p>
      </PolicySection>
      <PolicySection id="help-and-corrections" title="Help and corrections">
        <p>For card corrections, account help or removal, email:</p>
        <SupportLink className="inline-flex min-h-12 max-w-full items-center" />
      </PolicySection>
    </PolicyPageLayout>
  );
}
