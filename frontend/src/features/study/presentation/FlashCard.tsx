import { Lightbulb } from 'lucide-react';
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { chip, primaryButton } from '../../../shared/ui/buttonStyles';
import { CardSource } from '../../../shared/ui/CardSource';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';

// A two-sided card, like a paper flashcard: the question on the front, the answer on the back.
// Checking the answer is deliberate; tapping the card surface never flips it. After reveal,
// explicit buttons let the student reread either side. Both sides share one grid cell.

type FlashCardProps = {
  card: { question: string; answer: string; explanation: string | null; source: string | null };
  publisherName: string | null;
  ratingControls: ReactNode;
  questionInput?: ReactNode;
  answerDetails?: ReactNode;
  answerExtras?: ReactNode;
  renderRevealActions?: (reveal: () => void) => ReactNode;
  showRecallHint?: boolean;
  appearance?: 'trial' | 'review';
};

const sideSwitch =
  'pressable -mr-2 min-h-12 rounded-control px-2 text-label font-semibold text-accent pointer-coarse:active:transform-none!';

const sideText =
  'mx-auto w-full max-w-lg text-title font-bold tracking-tight text-balance whitespace-pre-wrap outline-none sm:text-[2rem] sm:leading-tight';

// Longer saved answers step down on short phones, so the ratings stay on screen for typical cards.
const LONG_ANSWER_LENGTH = 60;
const compactLongAnswer = `${sideText} short-phone:text-section short-phone:leading-tight`;

// Paragraph-length text reads better left-aligned at reading size than as a centered heading.
const PARAGRAPH_LENGTH = 200;
const paragraphText =
  'mx-auto w-full max-w-xl text-left text-lg/normal font-medium text-pretty whitespace-pre-wrap outline-none sm:text-section sm:leading-normal';

const isParagraph = (text: string) => text.trim().length > PARAGRAPH_LENGTH;

function sideTextStyle(text: string, compactOnShortPhones: boolean) {
  if (isParagraph(text)) return paragraphText;
  return compactOnShortPhones && text.trim().length > LONG_ANSWER_LENGTH ? compactLongAnswer : sideText;
}

/** Focusing a tall side can leave the screen partway down it, so bring the side's start into view. */
function showSideStart(heading: HTMLElement | null) {
  const top = heading?.getBoundingClientRect().top ?? 0;
  if (top < 0 || top > window.innerHeight) heading?.closest('section')?.scrollIntoView({ block: 'start' });
}

export function FlashCard({
  card,
  publisherName,
  ratingControls,
  questionInput,
  answerDetails,
  answerExtras,
  renderRevealActions,
  showRecallHint = true,
  appearance = 'trial',
}: Readonly<FlashCardProps>) {
  const [answerShown, setAnswerShown] = useState(false);
  const [showingBack, setShowingBack] = useState(false);
  const recallHintId = useId();
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);
  const hintVisible = showRecallHint && !answerShown;
  const recallHintDescription = hintVisible ? recallHintId : undefined;
  const requestFocus = useContext(FocusRequestContext);
  const savedReview = appearance === 'review';
  const rereadingQuestion = savedReview && answerShown;

  // The side facing the student takes focus, so a screen reader reads the question, then the answer.
  useEffect(() => {
    const heading = (showingBack ? answerRef : questionRef).current;
    requestFocus(heading);
    showSideStart(heading);
  }, [showingBack, requestFocus]);

  function revealAnswer() {
    setAnswerShown(true);
    setShowingBack(true);
  }

  const questionActions = rereadingQuestion ? null : (
    <QuestionActions
      hintId={recallHintDescription}
      revealed={answerShown}
      renderRevealActions={renderRevealActions}
      onReveal={revealAnswer}
    />
  );
  const reviewActions = showingBack ? ratingControls : questionActions;
  const attribution = (
    <p className={`text-support text-muted ${savedReview ? '' : 'mt-2'}`}>{attributionText(publisherName)}</p>
  );
  const reviewAnswerFooter = answerShown ? (
    <div className="text-left">
      {answerExtras}
      {attribution}
    </div>
  ) : null;

  return (
    <div className={`flex flex-1 animate-fade-in flex-col ${savedReview ? '' : 'sm:min-h-[30rem]'}`}>
      <div className="flex flex-1 flex-col perspective-[2000px]">
        <div
          data-card-frame
          className={`grid flex-1 transform-3d transition-transform duration-(--card-flip) ease-[ease-in-out] ${savedReview ? 'min-h-[256px]' : ''} ${showingBack ? 'rotate-y-180' : 'rotate-y-0'}`}
        >
          <CardSide
            label="Question"
            hidden={showingBack}
            longText={isParagraph(card.question)}
            appearance={appearance}
            headerAction={
              rereadingQuestion && (
                <button type="button" onClick={revealAnswer} className={sideSwitch}>
                  Back to answer
                </button>
              )
            }
            footer={savedReview ? null : questionActions}
          >
            <h2
              ref={questionRef}
              tabIndex={-1}
              aria-describedby={recallHintDescription}
              className={sideTextStyle(card.question, false)}
            >
              {card.question}
            </h2>
            {questionInput}
          </CardSide>
          <CardSide
            label="Answer"
            hidden={!showingBack}
            longText={isParagraph(card.answer)}
            appearance={appearance}
            back
            headerAction={
              <button type="button" onClick={() => setShowingBack(false)} className={sideSwitch}>
                Back to question
              </button>
            }
            footer={savedReview ? reviewAnswerFooter : answerShown && ratingControls}
          >
            {answerShown && (
              <>
                <h2 ref={answerRef} tabIndex={-1} className={sideTextStyle(card.answer, savedReview)}>
                  {card.answer}
                </h2>
                {!savedReview && card.explanation && (
                  <p className="mt-4 text-body text-muted text-pretty whitespace-pre-wrap">{card.explanation}</p>
                )}
                {answerDetails}
                {!savedReview && card.source && <CardSource source={card.source} />}
                {!savedReview && attribution}
              </>
            )}
          </CardSide>
        </div>
      </div>
      {savedReview && reviewActions && (
        <div
          key={showingBack ? 'answer' : 'question'}
          className={`mt-3 short-phone:mt-2 sm:mt-4 ${answerShown ? 'animate-card-side-actions' : ''}`}
        >
          {reviewActions}
        </div>
      )}
    </div>
  );
}

const attributionText = (publisherName: string | null) =>
  publisherName === null ? 'Personal card' : `Published by ${publisherName} · Not yet checked`;

type QuestionActionsProps = {
  hintId: string | undefined;
  revealed: boolean;
  renderRevealActions?: (reveal: () => void) => ReactNode;
  onReveal: () => void;
};

function QuestionActions({ hintId, revealed, renderRevealActions, onReveal }: Readonly<QuestionActionsProps>) {
  return (
    <div>
      {hintId && (
        <div
          id={hintId}
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
      {!revealed && renderRevealActions ? (
        renderRevealActions(onReveal)
      ) : (
        <button
          type="button"
          onClick={onReveal}
          aria-describedby={hintId}
          className={`${primaryButton} w-full pointer-coarse:active:transform-none!`}
        >
          {revealed ? 'Back to answer' : 'Check answer'}
        </button>
      )}
    </div>
  );
}

type CardSideProps = {
  label: string;
  hidden: boolean;
  longText: boolean;
  appearance: 'trial' | 'review';
  back?: boolean;
  headerAction?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
};

/**
 * One side of the card: its label, the text centered in the space left, and its buttons at the
 * bottom. The side facing away is inert, so it can't be read or focused.
 */
function CardSide({
  label,
  hidden,
  longText,
  appearance,
  back = false,
  headerAction,
  footer,
  children,
}: Readonly<CardSideProps>) {
  const review = appearance === 'review';
  // A long side facing away may not stretch a saved card past about one screen, so the ratings stay near.
  const capHiddenSide = hidden && longText ? 'max-h-(--hidden-side-max) self-start overflow-hidden' : '';
  const surface = review ? `shadow-control short-phone:py-3 ${capHiddenSide}` : 'shadow-card';
  const labelColor = back ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted';
  const labelStyle = review && back ? chip : `rounded-full px-3 py-1 text-left text-label font-semibold ${labelColor}`;
  const bodyLayout = review ? 'py-3 short-phone:py-2 sm:py-6' : 'mx-auto max-w-xl py-6';
  return (
    <section
      inert={hidden}
      aria-hidden={hidden}
      className={`col-start-1 row-start-1 flex min-w-0 flex-col wrap-anywhere rounded-card bg-surface px-compact-gutter py-4 text-center backface-hidden sm:p-6 ${surface} ${back ? 'rotate-y-180' : ''}`}
    >
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3">
        <p className={labelStyle}>{label}</p>
        {headerAction}
      </div>
      <div className={`flex w-full flex-1 flex-col justify-center ${bodyLayout}`}>{children}</div>
      {footer !== null && <div className={`border-t border-line ${review ? 'pt-3' : 'pt-4'}`}>{footer}</div>}
    </section>
  );
}
