import { secondaryButton } from './buttonStyles';
import { MessageScreen } from './MessageScreen';
import { ActionRow } from './Screen';

type LoadFailedProps = {
  onRetry: () => void;
  retrying: boolean;
};

export function LoadFailed({ onRetry, retrying }: LoadFailedProps) {
  const retryButton = (
    <ActionRow>
      <button type="button" onClick={onRetry} disabled={retrying} className={secondaryButton}>
        Try again
      </button>
    </ActionRow>
  );
  return (
    <MessageScreen title="We couldn't load this page." action={retryButton}>
      <p>Check your connection.</p>
    </MessageScreen>
  );
}
