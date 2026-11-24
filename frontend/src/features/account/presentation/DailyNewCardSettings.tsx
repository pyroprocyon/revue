import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { deckKeys, libraryKeys, reviewKeys } from '../../../shared/cache/queryKeys';
import { DAILY_NEW_CARD_LIMITS, type DailyNewCardLimit } from '../../../shared/product/studyRules';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { useFirstLoadNotice } from '../../../shared/ui/useFirstLoadNotice';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { useAccountGateway } from './AccountProvider';

const saveBar =
  'inline-flex min-h-12 min-w-0 items-center justify-center rounded-[0.875rem] px-4 py-2 text-center text-label font-semibold wrap-anywhere';

export function DailyNewCardSettings({ username }: Readonly<{ username: string }>) {
  const gateway = useAccountGateway();
  const client = useQueryClient();
  const queryKey = ['study-settings', username] as const;
  const settings = useQuery({
    queryKey,
    queryFn: ({ signal }) => gateway.studySettings(signal),
    retry: false,
  });
  const [draft, setDraft] = useState<DailyNewCardLimit>();
  const confirmedLimit = settings.data?.dailyNewCardLimit;
  const limit = draft ?? confirmedLimit;
  const loading = limit === undefined && settings.isPending;
  const showLoading = useFirstLoadNotice(loading);
  const saveButton = useRef<HTMLButtonElement>(null);
  const selectedOption = useRef<HTMLInputElement>(null);
  const restoreOptionFocus = useRef(false);
  const requestFocus = useContext(FocusRequestContext);
  const save = useMutation({
    mutationFn: (dailyNewCardLimit: DailyNewCardLimit) => gateway.saveStudySettings({ dailyNewCardLimit }),
    onSuccess: async (confirmed) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, confirmed);
      setDraft(undefined);
      void client.invalidateQueries({ queryKey: reviewKeys.all });
      void client.invalidateQueries({ queryKey: deckKeys.allCardPages(username) });
      void client.invalidateQueries({ queryKey: libraryKeys.cardPagesOf(username) });
    },
  });
  const canSave = limit !== undefined && (limit !== confirmedLimit || save.isError);

  useEffect(() => {
    if (!save.isSuccess || !restoreOptionFocus.current) return;
    restoreOptionFocus.current = false;
    if (document.activeElement === document.body) requestFocus(selectedOption.current);
  }, [requestFocus, save.isSuccess]);

  const limitSlot = 'mt-3.5 min-w-0 @min-[36rem]:mt-0';
  let loadFeedback;
  if (loading || showLoading) {
    loadFeedback = (
      <div className={`${limitSlot} grid min-h-14 items-center`}>
        {showLoading && <LoadingStatus>Loading your daily limit…</LoadingStatus>}
      </div>
    );
  } else if (settings.isError) {
    loadFeedback = (
      <button type="button" className={`${secondaryButton} mt-3`} onClick={() => void settings.refetch()}>
        Try loading the limit again
      </button>
    );
  }

  return (
    <section
      className="border-t border-line p-4 sm:p-5 @min-[36rem]:grid @min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @min-[36rem]:items-center @min-[36rem]:gap-5"
      aria-labelledby="daily-new-cards-label"
    >
      <div>
        <h2 id="daily-new-cards-label" className="text-lg/6 font-bold">
          Daily new cards
        </h2>
        <p id="daily-new-cards-scope" className="mt-1 text-support text-muted">
          Shared across your decks and saved reviewers.
        </p>
      </div>
      {limit !== undefined && !showLoading ? (
        <form
          className={limitSlot}
          aria-busy={save.isPending}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave || save.isPending) return;
            restoreOptionFocus.current = saveButton.current === document.activeElement;
            save.mutate(limit);
          }}
        >
          <div className="grid gap-2">
            <fieldset
              aria-labelledby="daily-new-cards-label"
              aria-describedby="daily-new-cards-scope"
              className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,6.75rem),1fr))] gap-1 rounded-control bg-subtle p-1"
              disabled={save.isPending}
            >
              {DAILY_NEW_CARD_LIMITS.map((option) => (
                <label
                  key={option}
                  className="daily-new-card-option relative flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[0.875rem] px-2 py-1.5 text-center text-label font-semibold has-checked:bg-surface has-checked:text-accent-strong has-checked:shadow-control has-disabled:cursor-wait"
                >
                  <input
                    ref={limit === option ? selectedOption : undefined}
                    type="radio"
                    name="daily-new-card-limit"
                    value={option}
                    className="sr-only"
                    checked={limit === option}
                    onChange={() => {
                      setDraft(option === confirmedLimit && !save.isError ? undefined : option);
                      if (save.isSuccess) save.reset();
                    }}
                  />
                  {limit === option && <Check aria-hidden="true" className="size-4 shrink-0" />}
                  <span className="min-w-0 wrap-anywhere">{option} per day</span>
                </label>
              ))}
            </fieldset>
            {(canSave || save.isPending) && (
              <button
                ref={saveButton}
                type="submit"
                aria-disabled={save.isPending}
                className={`${saveBar} pressable bg-accent-soft text-accent-strong aria-disabled:bg-subtle aria-disabled:text-muted`}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            )}
            <div
              aria-live="polite"
              aria-atomic="true"
              className={save.isSuccess ? `${saveBar} bg-success-soft text-success` : 'sr-only'}
            >
              {save.isSuccess && 'Daily limit saved.'}
            </div>
          </div>
          {save.isError && (
            <p role="alert" className="mt-2 text-support text-muted">
              Couldn’t confirm your daily limit. Try saving again.
            </p>
          )}
        </form>
      ) : (
        loadFeedback
      )}
    </section>
  );
}
