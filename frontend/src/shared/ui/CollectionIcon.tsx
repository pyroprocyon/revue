import { BookOpen, CirclePause, Layers2 } from 'lucide-react';
import { FlashcardsIcon } from './FlashcardsIcon';

const icons = {
  saved: { Icon: BookOpen, color: 'saved-set-icon' },
  topic: { Icon: FlashcardsIcon, color: 'saved-set-icon' },
  personal: { Icon: Layers2, color: 'personal-deck-icon' },
  paused: { Icon: CirclePause, color: 'paused-deck-icon' },
};

export function CollectionIcon({ kind, className = '' }: Readonly<{ kind: keyof typeof icons; className?: string }>) {
  const { Icon, color } = icons[kind];
  return (
    <span aria-hidden="true" className={`collection-icon ${color} ${className}`}>
      <Icon size={20} />
    </span>
  );
}
