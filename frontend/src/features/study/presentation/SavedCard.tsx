import { useId, useState, type ReactNode } from 'react';
import type { RatingRequest, StudyCard } from '../application/reviews';
import { FlashCard } from './FlashCard';
import { ArrowRight } from 'lucide-react';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';

type Props = { card: StudyCard; renderControls: (mode: RatingRequest['attemptMode']) => ReactNode };

/** A saved attempt uses the same flip as the trial; rereading never changes its original mode or draft. */
export function SavedCard({ card, renderControls }: Readonly<Props>) {
  const [mode, setMode] = useState<RatingRequest['attemptMode'] | null>(null);
  const [draft, setDraft] = useState('');
  const field = useId();
  return (
    <div className="flex flex-col">
      <FlashCard
        card={card}
        publisherName={card.publisherName}
        showRecallHint={false}
        questionInput={
          mode !== 'SHOWN' && (
            <div className="mt-3 text-left sm:mt-6">
              <label htmlFor={field} className="block text-label font-semibold">
                Your answer (optional)
              </label>
              <textarea
                id={field}
                value={draft}
                readOnly={mode !== null}
                maxLength={4000}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                className="mt-2 block w-full resize-y rounded-control border border-field-edge bg-field px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:py-3"
              />
            </div>
          )
        }
        renderRevealActions={(reveal) => (
          <div className="@container">
            <div className="grid gap-2 sm:gap-3 @min-[26rem]:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setMode('ANSWERED');
                  reveal();
                }}
                className={primaryButton}
              >
                Show answer
                <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('SHOWN');
                  reveal();
                }}
                className={`${secondaryButton} border border-line shadow-none`}
              >
                I don’t know yet
              </button>
            </div>
          </div>
        )}
        answerDetails={
          <div className="text-left">
            {mode === 'ANSWERED' && draft && (
              <div className="mt-5 rounded-control bg-subtle p-4">
                <p className="text-support font-semibold">Your answer</p>
                <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-body">{draft}</p>
              </div>
            )}
            {card.keyIdeas.length > 0 && (
              <div className="mt-5">
                <p className="text-label font-semibold">Key ideas</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-muted">
                  {[...new Set(card.keyIdeas)].map((idea) => (
                    <li key={idea} className="wrap-anywhere">
                      {idea}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {card.memoryHook && <p className="mt-5 rounded-control bg-highlight-soft/60 p-4 text-body text-muted">{card.memoryHook}</p>}
          </div>
        }
        ratingControls={mode === null ? null : renderControls(mode)}
      />
    </div>
  );
}
