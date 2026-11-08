import { Link } from 'react-router';
import { secondaryButton } from '../../shared/ui/buttonStyles';
import { MessageScreen } from '../../shared/ui/MessageScreen';
import { ActionRow } from '../../shared/ui/Screen';
import { HOME_PATH } from '../../shared/navigation/paths';

export function NotFoundPage() {
  const homeButton = (
    <ActionRow>
      <Link to={HOME_PATH} className={secondaryButton}>
        Go to the home page
      </Link>
    </ActionRow>
  );
  return (
    <MessageScreen title="Page not found." action={homeButton}>
      <p>This page doesn't exist. Check the link, or start from the home page.</p>
    </MessageScreen>
  );
}
