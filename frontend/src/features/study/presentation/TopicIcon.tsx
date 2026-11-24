import { CollectionIcon } from '../../../shared/ui/CollectionIcon';

export function TopicIcon({ topic }: Readonly<{ topic: string }>) {
  return <CollectionIcon kind={topic.startsWith('deck-') ? 'personal' : 'saved'} />;
}
