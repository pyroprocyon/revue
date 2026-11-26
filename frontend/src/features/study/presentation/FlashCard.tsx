import { ArrowRight, Lightbulb, Repeat2 } from 'lucide-react';
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { CardDetails } from './ReviewDetail';

// A two-sided card, like a paper flashcard: the question on the front, the answer on the back.
// Checking the answer is deliberate; tapping the card surface never flips it. After reveal,
// explicit buttons let the student reread either side. Both sides share one grid cell.

type FlashCardProps = {
  card: {
    question: string;
    answer: string;
    source: string | null;
    explanation: string | null;
    memoryHook?: string | null;
  };
  publisherName: string | null;
  ratingControls: ReactNode;
  answerRecap?: ReactNode;
  questionDetails?: ReactNode;
  renderRevealActions?: (reveal: () => void) => ReactNode;
  showRecallHint?: boolean;
  savedReview?: boolean;
  position: { index: number; total: number };
};

const sideSwitch =
  'pressable -mr-2 min-h-12 rounded-control px-2 text-label font-semibold text-accent pointer-coarse:active:transform-none!';

const sideText =
  'mx-auto w-full max-w-lg text-title font-bold tracking-tight text-center text-balance whitespace-pre-wrap outline-none sm:text-[2rem] sm:leading-tight';

// Longer saved answers step down on short phones, so the ratings stay on screen for typical cards.
const LONG_ANSWER_LENGTH = 60;
const compactLongAnswer = `${sideText} short-phone:text-section short-phone:leading-tight`;
const DOCK_REVEAL_MS = 240;

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
  const content = heading.closest('.review-card-content');
  const scrollArea =
    content && content.scrollHeight > content.clientHeight && getComputedStyle(content).overflowY === 'auto'
      ? content
      : null;
  const scrollBounds = scrollArea?.getBoundingClientRect();
  const headerBottom =
    header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0;
  const visibleTop = scrollBounds?.top ?? headerBottom;
  const visibleBottom = scrollBounds?.bottom ?? window.visualViewport?.height ?? window.innerHeight;
  const frameTop = frame.getBoundingClientRect().top;
  const textTop = frameTop + heading.offsetTop;
  const textBottom = textTop + heading.offsetHeight;
  const visibleHeight = visibleBottom - visibleTop;
  const textFitsFromFrameTop = textBottom - frameTop <= visibleHeight;
  const textIsTallerThanViewport = heading.offsetHeight > visibleHeight;
  if (scrollArea && textIsTallerThanViewport) {
    const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
    if (heading.offsetTop + lineHeight <= visibleHeight) {
      scrollArea.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
  }
  const textInset = textIsTallerThanViewport ? 8 : Math.min(8, visibleHeight - heading.offsetHeight);
  const targetTop = textFitsFromFrameTop ? frameTop : textTop - textInset;
  if (targetTop < visibleTop || textBottom > visibleBottom) {
    (scrollArea ?? window).scrollBy({ top: targetTop - visibleTop, behavior: 'instant' });
  }
}

export function FlashCard({
  card,
  publisherName,
  ratingControls,
  answerRecap,
  questionDetails,
  renderRevealActions,
  showRecallHint = true,
  savedReview = false,
  position,
}: Readonly<FlashCardProps>) {
  const [answerShown, setAnswerShown] = useState(false);
  const [showingBack, setShowingBack] = useState(false);
  const recallHintId = useId();
  const questionRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const revealDockHeight = useRef<number | null>(null);
  const dockResize = useRef<Animation | null>(null);
  const recallHintDescription = showRecallHint && !answerShown ? recallHintId : undefined;
  const requestFocus = useContext(FocusRequestContext);
  const hasDetails = Boolean(card.source || (answerShown && (card.explanation || card.memoryHook)));
  const details = (
    <CardDetails
      source={card.source}
      explanation={answerShown ? card.explanation : null}
      tip={answerShown ? card.memoryHook : null}
    />
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

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const before = revealDockHeight.current;
    revealDockHeight.current = null;
    if (
      !answerShown ||
      !dock?.animate ||
      before === null ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;

    const after = dock.getBoundingClientRect().height;
    if (after === 0 || after === before) return;
    const animation = dock.animate(
      [
        { blockSize: `${before}px`, overflow: 'clip' },
        { blockSize: `${after}px`, overflow: 'clip' },
      ],
      { duration: DOCK_REVEAL_MS, easing: getComputedStyle(dock).getPropertyValue('--ease-standard').trim() },
    );
    dockResize.current = animation;
    animation.onfinish = () => {
      const focused = document.activeElement;
      if (focused === answerRef.current) {
        keepSideTextInView(answerRef.current);
      } else if (focused instanceof HTMLButtonElement && dock.contains(focused) && focused.matches(':focus-visible')) {
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    };
    return () => {
      animation.onfinish = null;
      animation.cancel();
      dockResize.current = null;
    };
  }, [answerShown]);

  function revealAnswer() {
    setAnswerShown(true);
    setShowingBack(true);
  }

  const revealActions = renderRevealActions?.(revealAnswer) ?? (
    <button
      type="button"
      onClick={revealAnswer}
      aria-describedby={recallHintDescription}
      className={`${primaryButton} w-full pointer-coarse:active:transform-none!`}
    >
      Show answer
      <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
    </button>
  );

  return (
    <div className={`active-review-card flex flex-1 flex-col ${savedReview ? 'saved-review-card' : ''}`}>
      <div className="review-card-content screen-enter">
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
                  {details}
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
              footer={hasDetails && <div className="review-credit">{details}</div>}
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
          {answerShown ? answerRecap : beforeReveal}
        </div>
      </div>
      <div
        ref={dockRef}
        onClickCapture={(event) => {
          if (!answerShown) revealDockHeight.current = event.currentTarget.getBoundingClientRect().height;
        }}
        onFocusCapture={() => dockResize.current?.finish()}
        className={`review-dock mt-2 empty:hidden ${answerShown && ratingControls != null ? 'review-dock-after-reveal' : ''}`}
      >
        {answerShown
          ? ratingControls != null && (
              <div className="group/reveal relative">
                <div
                  inert
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 animate-review-actions-out group-focus-within/reveal:hidden motion-reduce:hidden"
                >
                  {revealActions}
                </div>
                <div className="relative animate-review-actions-in focus-within:opacity-100!">{ratingControls}</div>
              </div>
            )
          : revealActions}
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
