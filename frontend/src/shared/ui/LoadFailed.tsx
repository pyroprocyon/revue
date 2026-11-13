import type { ReactNode } from 'react';
import { primaryButton } from './buttonStyles';
import { MessageScreen } from './MessageScreen';
import { ActionRow } from './LayoutParts';

type LoadFailedProps = {
  onRetry: () => void;
  retrying: boolean;
  recoveryAction?: ReactNode;
};

export function LoadFailed({ onRetry, retrying, recoveryAction }: Readonly<LoadFailedProps>) {
  const retryButton = (
    <ActionRow>
      <button type="button" onClick={onRetry} disabled={retrying} className={primaryButton}>
        {retrying ? 'Retrying…' : 'Try again'}
      </button>
      {recoveryAction}
    </ActionRow>
  );
  return (
    <MessageScreen title="We couldn't load this page." action={retryButton}>
      <p>Check your connection.</p>
    </MessageScreen>
  );
}
