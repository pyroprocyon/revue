import { BookOpen, Layers2 } from 'lucide-react';

export function TopicIcon({ topic }: Readonly<{ topic: string }>) {
  const Icon = topic.startsWith('deck-') ? Layers2 : BookOpen;
  return (
    <span className="hidden size-[40px] shrink-0 place-items-center rounded-inset bg-accent-soft text-accent @min-[14rem]:grid">
      <Icon aria-hidden="true" className="size-[20px]" />
    </span>
  );
}
