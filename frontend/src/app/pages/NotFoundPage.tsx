import { Link } from 'react-router';
import { secondaryButton } from '../../shared/ui/buttonStyles';
import { MessageScreen } from '../../shared/ui/MessageScreen';
import { ActionRow } from '../../shared/ui/LayoutParts';
import { usePublicSession } from '../../shared/navigation/publicSession';
import { TODAY_PATH, HOME_PATH } from '../../shared/navigation/paths';

export function NotFoundPage() {
  const session = usePublicSession();
  const signedIn = session === 'signed-in';
  const homeButton = session !== 'checking' && (
    <ActionRow>
      <Link to={signedIn ? TODAY_PATH : HOME_PATH} className={secondaryButton}>
        {signedIn ? 'Go to Today' : 'Go to the home page'}
      </Link>
    </ActionRow>
  );
  return (
    <MessageScreen title="Page not found." action={homeButton}>
      <p>Check the link for typos.</p>
    </MessageScreen>
  );
}
