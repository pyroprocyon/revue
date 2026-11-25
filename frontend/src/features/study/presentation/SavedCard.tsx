import { useRef, useState, type ReactNode } from 'react';
import type { RatingRequest, StudyCard } from '../application/reviews';
import { FlashCard } from './FlashCard';
import { DetailSection, ReviewDetail } from './ReviewDetail';
import { Columns2 } from 'lucide-react';
import { neutralOutlineButton, primaryButton } from '../../../shared/ui/buttonStyles';

type Props = {
  card: StudyCard;
  position: { index: number; total: number };
  renderControls: (mode: RatingRequest['attemptMode']) => ReactNode;
};

type Attempt = { mode: 'ANSWERED'; answer: string } | { mode: 'SHOWN' };

const compactRevealButton = 'min-w-0 grow basis-30 px-2.5! text-label! leading-tight!';

/** A saved attempt uses the same flip as the trial; rereading never changes its original mode or draft. */
export function SavedCard({ card, position, renderControls }: Readonly<Props>) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const draft = useRef<HTMLTextAreaElement>(null);
  const answerRecap = attempt?.mode === 'ANSWERED' && attempt.answer.length > 0 && (
    <AnswerRecap answer={attempt.answer} referenceAnswer={card.answer} />
  );
  return (
    <FlashCard
      card={card}
      publisherName={card.publisherName}
      showRecallHint={false}
      savedReview
      position={position}
      answerRecap={answerRecap}
      questionDetails={
        <details className="tonal-control-gradient rounded-control border border-line bg-accent-soft px-3 text-left">
          <summary className="review-draft-toggle pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-label font-semibold text-accent">
            <span>
              Write an answer <span className="font-normal">(optional)</span>
            </span>
            <span className="draft-icon" aria-hidden="true" />
          </summary>
          <textarea
            ref={draft}
            aria-label="Your answer (optional)"
            maxLength={4000}
            rows={2}
            className="review-draft mb-3"
          />
        </details>
      }
      renderRevealActions={(reveal) => (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAttempt({ mode: 'ANSWERED', answer: draft.current?.value.trim() ?? '' });
              reveal();
            }}
            className={`${primaryButton} ${compactRevealButton}`}
          >
            Show answer
          </button>
          <button
            type="button"
            onClick={() => {
              setAttempt({ mode: 'SHOWN' });
              reveal();
            }}
            className={`${neutralOutlineButton} ${compactRevealButton}`}
          >
            I don’t know
          </button>
        </div>
      )}
      ratingControls={attempt === null ? null : renderControls(attempt.mode)}
    />
  );
}

function AnswerRecap({ answer, referenceAnswer }: Readonly<{ answer: string; referenceAnswer: string }>) {
  if (answer.length > 180 || answer.split('\n').length > 3) {
    return (
      <ReviewDetail label="Compare with your answer" icon={Columns2}>
        <DetailSection title="Reference answer">{referenceAnswer}</DetailSection>
        <DetailSection title="Your answer">{answer}</DetailSection>
      </ReviewDetail>
    );
  }
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-left">
      <p className="text-support font-semibold text-saved-set">Your answer</p>
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-body">{answer}</p>
    </div>
  );
}
