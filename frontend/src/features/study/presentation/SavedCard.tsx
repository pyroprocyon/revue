import { useId, useState, type ReactNode } from 'react';
import type { RatingRequest, StudyCard } from '../application/reviews';
import { FlashCard } from './FlashCard';
import { ReviewDetail } from './ReviewDetail';
import { ArrowRight, BookOpenText, Columns2, Lightbulb } from 'lucide-react';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { CardSource } from '../../../shared/ui/CardSource';

type Props = {
  card: StudyCard;
  position: { index: number; total: number };
  renderControls: (mode: RatingRequest['attemptMode']) => ReactNode;
};

/** A saved attempt uses the same flip as the trial; rereading never changes its original mode or draft. */
export function SavedCard({ card, position, renderControls }: Readonly<Props>) {
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
        position={position}
        questionInput={
          showDraft && (
            <div className="mt-3 text-left">
              <label htmlFor={field} className="text-label font-semibold">
                Your answer
              </label>
              <textarea id={field} value={draft} readOnly rows={2} className="review-draft mt-2" />
            </div>
          )
        }
        renderRevealActions={(reveal) => (
          <div className="@container">
            <details className="mb-2 rounded-control border border-line bg-accent-soft px-3 text-left">
              <summary className="review-draft-toggle pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-label font-semibold text-accent">
                <span>
                  Write an answer <span className="font-normal">(optional)</span>
                </span>
                <span className="draft-icon" aria-hidden="true" />
              </summary>
              <textarea
                aria-label="Your answer (optional)"
                value={draft}
                maxLength={4000}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                className="review-draft mb-3"
              />
            </details>
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
            <div className="@container/review-details mb-2 flex flex-wrap gap-2">
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
