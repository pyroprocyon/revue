import { useId, useState, type ReactNode } from 'react';
import type { RatingRequest, StudyCard } from '../application/reviews';
import { FlashCard } from './FlashCard';
import { ReviewDetail } from './ReviewDetail';
import { ArrowRight, BookOpenText, Columns2, Lightbulb } from 'lucide-react';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { CardSource } from '../../../shared/ui/CardSource';

type Props = { card: StudyCard; renderControls: (mode: RatingRequest['attemptMode']) => ReactNode };

/** A saved attempt uses the same flip as the trial; rereading never changes its original mode or draft. */
export function SavedCard({ card, renderControls }: Readonly<Props>) {
  const [mode, setMode] = useState<RatingRequest['attemptMode'] | null>(null);
  const [draft, setDraft] = useState('');
  const field = useId();
  const typedAnswer = draft.trim();
  const showDraft = mode === 'ANSWERED' && typedAnswer.length > 0;
  const longDraft = showDraft && (typedAnswer.length > 180 || typedAnswer.split('\n').length > 3);
  const hasDetails = Boolean(card.explanation || card.source);
  return (
    <div className="flex flex-col">
      <FlashCard
        card={card}
        publisherName={card.publisherName}
        showRecallHint={false}
        appearance="review"
        questionInput={
          (mode === null || showDraft) && (
            <div className="mt-3 text-left sm:mt-6">
              <label htmlFor={field} className="block text-label font-semibold">
                {showDraft ? 'Your answer' : 'Your answer (optional)'}
              </label>
              {/* A new field for the read-only copy starts at the first line, not where typing ended. */}
              <textarea
                key={mode === null ? 'typing' : 'read-only'}
                id={field}
                value={draft}
                readOnly={mode !== null}
                maxLength={4000}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                className="mt-2 block w-full resize-y rounded-control border border-field-edge bg-field px-3 py-2 text-body read-only:border-line read-only:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:py-3"
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
          showDraft &&
          !longDraft && (
            <div className="mt-4 rounded-control bg-subtle px-3 py-2 text-left">
              <p className="text-support font-semibold">Your answer</p>
              <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-body">{typedAnswer}</p>
            </div>
          )
        }
        answerExtras={
          (card.memoryHook || longDraft || hasDetails) && (
            <div className="mb-2 flex flex-wrap gap-2">
              {card.memoryHook && (
                <ReviewDetail label="Tip to remember" icon={Lightbulb}>
                  <p className="whitespace-pre-wrap">{card.memoryHook}</p>
                </ReviewDetail>
              )}
              {longDraft && (
                <ReviewDetail label="Compare with your answer" icon={Columns2}>
                  <DetailSection title="Reference answer">{card.answer}</DetailSection>
                  <DetailSection title="Your answer">{typedAnswer}</DetailSection>
                </ReviewDetail>
              )}
              {hasDetails && (
                <ReviewDetail label={card.explanation ? 'Explanation' : 'Source'} icon={BookOpenText}>
                  {card.explanation && <p className="whitespace-pre-wrap">{card.explanation}</p>}
                  {card.source && <CardSource source={card.source} />}
                </ReviewDetail>
              )}
            </div>
          )
        }
        ratingControls={mode === null ? null : renderControls(mode)}
      />
    </div>
  );
}

function DetailSection({ title, children }: Readonly<{ title: string; children: string }>) {
  return (
    <section>
      <h3 className="text-label font-semibold">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap">{children}</p>
    </section>
  );
}
