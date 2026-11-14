import { Lightbulb } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { CardSource } from '../../../shared/ui/CardSource';

// A two-sided card, like a paper flashcard: the question on the front, the answer on the back.
// Checking the answer is deliberate; tapping the card surface never flips it. After reveal,
// explicit buttons let the student reread either side. Both sides share one grid cell.

type FlashCardProps = {
  card: { question: string; answer: string; explanation: string | null; source: string | null };
  publisherName: string;
  ratingControls: ReactNode;
  questionInput?: ReactNode;
  answerDetails?: ReactNode;
  renderRevealActions?: (reveal: () => void) => ReactNode;
  showRecallHint?: boolean;
};

export function FlashCard({
  card,
  publisherName,
  ratingControls,
  questionInput,
  answerDetails,
  renderRevealActions,
  showRecallHint = true,
}: Readonly<FlashCardProps>) {
  const [answerShown, setAnswerShown] = useState(false);
  const [showingBack, setShowingBack] = useState(false);
  const recallHintId = useId();
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);
  const hintVisible = showRecallHint && !answerShown;

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
    <div className="flex flex-1 animate-fade-in flex-col perspective-[2000px] sm:min-h-[30rem]">
      <div className={`grid flex-1 transform-3d ${turn}`}>
        <CardSide
          label="Question"
          hidden={showingBack}
          footer={
            <div>
              {hintVisible && (
                <div
                  id={recallHintId}
                  className="mb-3 flex items-start gap-3 rounded-control bg-highlight-soft/60 p-3 text-left sm:p-4"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-inset bg-surface/80 text-accent"
                  >
                    <Lightbulb className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-label font-semibold">Try to remember</p>
                    <p className="mt-0.5 text-support text-pretty text-muted">Even a few words are a good start.</p>
                  </div>
                </div>
              )}
              {!answerShown && renderRevealActions ? (
                renderRevealActions(revealAnswer)
              ) : (
                <button
                  type="button"
                  onClick={revealAnswer}
                  aria-describedby={hintVisible ? recallHintId : undefined}
                  className={`${primaryButton} w-full`}
                >
                  {answerShown ? 'Back to answer' : 'Check answer'}
                </button>
              )}
            </div>
          }
        >
          <h2
            ref={questionRef}
            tabIndex={-1}
            aria-describedby={hintVisible ? recallHintId : undefined}
            className="mx-auto w-full max-w-lg text-title font-bold tracking-tight text-balance outline-none sm:text-[2rem] sm:leading-tight"
          >
            {card.question}
          </h2>
          {questionInput}
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
          footer={answerShown && ratingControls}
        >
          {answerShown && (
            <>
              <h2
                ref={answerRef}
                tabIndex={-1}
                className="mx-auto w-full max-w-lg text-title font-bold tracking-tight text-balance outline-none sm:text-[2rem] sm:leading-tight"
              >
                {card.answer}
              </h2>
              {card.explanation && <p className="mt-4 text-body text-muted text-pretty">{card.explanation}</p>}
              {answerDetails}
              {card.source && <CardSource source={card.source} />}
              <p className="mt-2 text-support text-muted">Published by {publisherName} · Not yet checked</p>
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
function CardSide({ label, hidden, back = false, headerAction, footer, children }: Readonly<CardSideProps>) {
  return (
    <section
      inert={hidden}
      aria-hidden={hidden}
      className={`col-start-1 row-start-1 flex min-w-0 flex-col wrap-anywhere rounded-card bg-surface px-compact-gutter py-4 text-center shadow-card backface-hidden sm:p-6 ${back ? 'rotate-y-180' : ''}`}
    >
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3">
        <p className={`rounded-full px-3 py-1 text-left text-label font-semibold ${back ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>{label}</p>
        {headerAction}
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-6">{children}</div>
      <div className="border-t border-line pt-4">{footer}</div>
    </section>
  );
}
