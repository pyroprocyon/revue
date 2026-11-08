import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { DemoCard } from '../api/publicContent';
import { primaryButton } from '../components/buttonStyles';
import { CardSource } from '../components/CardSource';
import { RATINGS, RATINGS_IN_ORDER, RecallMeter, type Rating } from './ratings';

// A two-sided card, like a paper flashcard: the question on the front, the answer on the back.
// Checking the answer is deliberate; tapping the card surface never flips it. After reveal,
// explicit buttons let the student reread either side. Both sides share one grid cell.

type FlashCardProps = {
  card: DemoCard;
  publisherName: string;
  onRate: (rating: Rating) => void;
};

export function FlashCard({ card, publisherName, onRate }: FlashCardProps) {
  const [answerShown, setAnswerShown] = useState(false);
  const [showingBack, setShowingBack] = useState(false);
  const recallHintId = useId();
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);

  // The side facing the student takes focus, so a screen reader reads the question, then the answer.
  useEffect(() => {
    (showingBack ? answerRef : questionRef).current?.focus();
  }, [showingBack]);

  function revealAnswer() {
    setAnswerShown(true);
    setShowingBack(true);
  }

  // The front needs no turn when the card first appears, only after the answer has been shown.
  let turn = '';
  if (showingBack) {
    turn = 'rotate-y-180 animate-flip-to-back';
  } else if (answerShown) {
    turn = 'animate-flip-to-front';
  }

  return (
    <div className="flex flex-1 animate-fade-in flex-col perspective-[2000px] lg:min-h-[30rem]">
      <div className={`grid flex-1 transform-3d ${turn}`}>
        <CardSide
          label="Question"
          hidden={showingBack}
          footer={
            <div>
              {!answerShown && (
                <p id={recallHintId} className="mb-3 text-support text-muted">
                  Try answering in your head before you check.
                </p>
              )}
              <button
                type="button"
                onClick={revealAnswer}
                aria-describedby={answerShown ? undefined : recallHintId}
                className={`${primaryButton} w-full`}
              >
                {answerShown ? 'Back to answer' : 'Check answer'}
              </button>
            </div>
          }
        >
          <h2
            ref={questionRef}
            tabIndex={-1}
            aria-describedby={answerShown ? undefined : recallHintId}
            className="text-title font-bold tracking-tight text-balance outline-none"
          >
            {card.question}
          </h2>
        </CardSide>
        <CardSide
          label="Answer"
          hidden={!showingBack}
          back
          headerAction={
            <button
              type="button"
              onClick={() => setShowingBack(false)}
              className="pressable -mr-2 min-h-12 rounded-control px-2 text-label font-semibold text-accent"
            >
              Back to question
            </button>
          }
          footer={answerShown && <RatingButtons onRate={onRate} />}
        >
          {answerShown && (
            <>
              <h2 ref={answerRef} tabIndex={-1} className="text-title font-bold tracking-tight text-balance outline-none">
                {card.answer}
              </h2>
              {card.explanation !== null && <p className="mt-3 text-body text-muted text-balance">{card.explanation}</p>}
              {card.source !== null && <CardSource source={card.source} />}
              <p className="mt-2 text-support text-muted">Published by {publisherName}</p>
            </>
          )}
        </CardSide>
      </div>
    </div>
  );
}

type CardSideProps = {
  label: string;
  hidden: boolean;
  back?: boolean;
  headerAction?: ReactNode;
  /** The side's buttons, at the bottom of the card. */
  footer: ReactNode;
  children: ReactNode;
};

/**
 * One side of the card: its label, the text centered in the space left, and its buttons at the
 * bottom. The side facing away is inert, so it can't be read or focused.
 */
function CardSide({ label, hidden, back = false, headerAction, footer, children }: CardSideProps) {
  return (
    <section
      inert={hidden}
      aria-hidden={hidden}
      className={`col-start-1 row-start-1 flex min-w-0 flex-col wrap-anywhere rounded-card bg-surface p-4 text-center shadow-card backface-hidden sm:p-6 ${back ? 'rotate-y-180' : ''}`}
    >
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3">
        <p className={`text-left text-label font-semibold ${back ? 'text-accent' : 'text-muted'}`}>{label}</p>
        {headerAction}
      </div>
      <div className="flex flex-1 flex-col justify-center py-6">{children}</div>
      {footer}
    </section>
  );
}

function RatingButtons({ onRate }: { onRate: (rating: Rating) => void }) {
  const promptId = useId();
  return (
    <div role="group" aria-labelledby={promptId} className="@container text-left">
      <p id={promptId} className="text-label font-semibold">
        How well did you remember?
      </p>
      {/* Two columns once two 9rem buttons fit, so the four ratings always read as a 2 by 2 grid. */}
      <div className="mt-2 grid auto-rows-fr grid-cols-1 gap-2 @min-[18.5rem]:grid-cols-2">
        {RATINGS_IN_ORDER.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onRate(rating)}
            // A direct name, so screen readers don't run the label into the meaning.
            aria-label={`${RATINGS[rating].label}: ${RATINGS[rating].meaning}`}
            className={`pressable flex min-h-14 flex-col items-start justify-center rounded-control px-3 py-2 text-left shadow-control ${RATINGS[rating].tint}`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-body font-bold">{RATINGS[rating].label}</span>
              <RecallMeter rating={rating} />
            </span>
            <span className="text-[0.875rem] leading-tight text-muted">{RATINGS[rating].meaning}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
