import { Link } from 'react-router';
import { SETS_PATH, SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { accountLink, primaryButton } from '../../../shared/ui/buttonStyles';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { FormLayout } from '../../../shared/ui/FormLayout';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';

export function JoinPage() {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <FormLayout top={<div className="mx-auto"><HomeLink /></div>}>
      <h1 ref={headingRef} tabIndex={-1} className="text-title font-extrabold tracking-tight outline-none">
        You’ll need an invitation
      </h1>
      <p className="mt-4 text-body text-muted">
        Signups are invite-only for now. Open the link you received to get started.
      </p>
      <p className="mt-3 text-body text-muted">
        You can try the practice sets without an account.
      </p>
      <Link to={SETS_PATH} className={`${primaryButton} mt-6 w-full`}>Browse sets</Link>
      <div className="mt-5 text-center">
        <p className="text-support text-muted">Already have an account?</p>
        <Link to={SIGN_IN_PATH} className={accountLink}>Sign in</Link>
      </div>
    </FormLayout>
  );
}
