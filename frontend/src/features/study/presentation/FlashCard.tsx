import { ArrowRight, BookOpenText, Lightbulb, Repeat2 } from 'lucide-react';
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { CardSource } from '../../../shared/ui/CardSource';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { ReviewDetail } from './ReviewDetail';

// A two-sided card, like a paper flashcard: the question on the front, the answer on the back.
// Checking the answer is deliberate; tapping the card surface never flips it. After reveal,
// explicit buttons let the student reread either side. Both sides share one grid cell.

type FlashCardProps = {
  card: { question: string; answer: string; source: string | null };
  publisherName: string | null;
  ratingControls: ReactNode;
  answerRecap?: ReactNode;
  cardDetails?: ReactNode;
  questionDetails?: ReactNode;
  renderRevealActions?: (reveal: () => void) => ReactNode;
  showRecallHint?: boolean;
  position: { index: number; total: number };
};

const sideSwitch =
  'pressable -mr-2 min-h-12 rounded-control px-2 text-label font-semibold text-accent pointer-coarse:active:transform-none!';

const sideText =
  'mx-auto w-full max-w-lg text-title font-bold tracking-tight text-center text-balance whitespace-pre-wrap outline-none sm:text-[2rem] sm:leading-tight';

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

function keepSideTextInView(heading: HTMLElement | null) {
  if (!heading) return;
  const frame = heading.closest('.review-card-frame');
  if (!frame) return;
  const header = frame.closest('.study-layout')?.querySelector('.phone-page-header');
  const visibleTop =
    header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0;
  const visibleBottom = window.visualViewport?.height ?? window.innerHeight;
  const frameTop = frame.getBoundingClientRect().top;
  const textTop = frameTop + heading.offsetTop;
  const textBottom = textTop + heading.offsetHeight;
  const textFitsFromFrameTop = textBottom - frameTop <= visibleBottom - visibleTop;
  const targetTop = textFitsFromFrameTop ? frameTop : textTop - 8;
  if (targetTop < visibleTop || textBottom > visibleBottom) {
    window.scrollBy({ top: targetTop - visibleTop, behavior: 'instant' });
  }
}

export function FlashCard({
  card,
  publisherName,
  ratingControls,
  answerRecap,
  cardDetails,
  questionDetails,
  renderRevealActions,
  showRecallHint = true,
  position,
}: Readonly<FlashCardProps>) {
  const [answerShown, setAnswerShown] = useState(false);
  const [showingBack, setShowingBack] = useState(false);
  const recallHintId = useId();
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);
  const recallHintDescription = showRecallHint && !answerShown ? recallHintId : undefined;
  const requestFocus = useContext(FocusRequestContext);
  const source = card.source && (
    <ReviewDetail label="Source" icon={BookOpenText}>
      <CardSource source={card.source} />
    </ReviewDetail>
  );
  const beforeReveal = recallHintDescription ? (
    <p
      id={recallHintDescription}
      className="flex min-h-12 items-center gap-2 rounded-control border border-line bg-accent-soft px-3 py-2 text-label font-semibold text-accent"
    >
      <Lightbulb aria-hidden="true" className="size-7 shrink-0 rounded-inset bg-surface p-1.5" />
      Say the answer to yourself.
    </p>
  ) : (
    questionDetails
  );
  useEffect(() => {
    const heading = (showingBack ? answerRef : questionRef).current;
    requestFocus(heading);
    keepSideTextInView(heading);
  }, [showingBack, requestFocus]);

  function revealAnswer() {
    setAnswerShown(true);
    setShowingBack(true);
  }

  return (
    <div className="active-review-card flex flex-1 animate-fade-in flex-col">
      <div className="review-card-frame perspective-[2000px]">
        <div
          data-card-frame
          className={`grid flex-1 transform-3d transition-transform duration-(--card-flip) ease-[ease-in-out] ${showingBack ? 'rotate-y-180' : 'rotate-y-0'}`}
        >
          <CardSide
            label="Question"
            progress={`Card ${position.index + 1} of ${position.total}`}
            hidden={showingBack}
            headerAction={
              <button
                type="button"
                onClick={revealAnswer}
                className={`${sideSwitch}${answerShown ? '' : ' invisible'}`}
                aria-hidden={!answerShown}
                inert={!answerShown}
              >
                <Repeat2 aria-hidden="true" className="size-4 shrink-0" />
                Back to answer
              </button>
            }
            footer={
              <div className="review-credit">
                <p>{attributionText(publisherName)}</p>
                {source}
              </div>
            }
          >
            <h2
              ref={questionRef}
              tabIndex={-1}
              aria-describedby={recallHintDescription}
              className={sideTextStyle(card.question, false)}
            >
              {card.question}
            </h2>
          </CardSide>
          <CardSide
            label="Answer"
            hidden={!showingBack}
            back
            headerAction={
              <button type="button" onClick={() => setShowingBack(false)} className={sideSwitch}>
                <Repeat2 aria-hidden="true" className="size-4 shrink-0" />
                Back to question
              </button>
            }
            footer={source && <div className="review-credit">{source}</div>}
          >
            <h2 ref={answerRef} tabIndex={-1} className={sideTextStyle(card.answer, true)}>
              {card.answer}
            </h2>
          </CardSide>
        </div>
      </div>
      <div
        className={`review-card-controls mt-3 flex flex-col gap-2 empty:hidden short-phone:mt-2 sm:mt-4 ${answerShown ? 'animate-card-side-actions focus-within:opacity-100!' : ''}`}
      >
        {answerShown ? (
          <>
            {answerRecap}
            {cardDetails}
          </>
        ) : (
          beforeReveal
        )}
      </div>
      <div className="review-dock mt-2 empty:hidden">
        {answerShown
          ? ratingControls != null && (
              <div className="animate-card-side-actions focus-within:opacity-100!">{ratingControls}</div>
            )
          : (renderRevealActions?.(revealAnswer) ?? (
              <button
                type="button"
                onClick={revealAnswer}
                aria-describedby={recallHintDescription}
                className={`${primaryButton} w-full pointer-coarse:active:transform-none!`}
              >
                Show answer
                <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
              </button>
            ))}
      </div>
    </div>
  );
}

const attributionText = (publisherName: string | null) =>
  publisherName === null ? 'Personal card' : `Published by ${publisherName}`;

type CardSideProps = {
  label: string;
  hidden: boolean;
  progress?: string;
  back?: boolean;
  headerAction: ReactNode;
  footer: ReactNode;
  children: ReactNode;
};

function CardSide({ label, hidden, progress, back = false, headerAction, footer, children }: Readonly<CardSideProps>) {
  return (
    <section
      inert={hidden}
      aria-hidden={hidden}
      className={`review-face ${back ? 'review-back rotate-y-180' : 'review-front'}`}
    >
      <div className="review-strip">
        <p className="review-side-label">{progress ?? label}</p>
        {headerAction}
      </div>
      <section className="review-reading" aria-label={label}>
        <div className="review-copy">{children}</div>
      </section>
      {footer}
    </section>
  );
}
