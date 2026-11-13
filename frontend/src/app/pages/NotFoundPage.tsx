import { Link } from 'react-router';
import { secondaryButton } from '../../shared/ui/buttonStyles';
import { MessageScreen } from '../../shared/ui/MessageScreen';
import { ActionRow } from '../../shared/ui/LayoutParts';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { ACCOUNT_PATH, HOME_PATH } from '../../shared/navigation/paths';

export function NotFoundPage() {
  const signedIn = usePublicSession() === 'signed-in';
  const homeButton = (
    <ActionRow>
      <Link to={signedIn ? ACCOUNT_PATH : HOME_PATH} className={secondaryButton}>
        {signedIn ? 'Go to Account' : 'Go to the home page'}
      </Link>
    </ActionRow>
  );
  return (
    <MessageScreen title="Page not found." action={homeButton}>
      <p>Check the link for typos.</p>
    </MessageScreen>
  );
}
