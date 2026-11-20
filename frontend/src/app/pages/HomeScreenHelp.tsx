import { ChevronDown, Download, Share } from 'lucide-react';
import { useState } from 'react';
import { installRevue, useInstallOffer } from '../homeScreenInstall';

type Phone = 'iPhone' | 'Android';

function phoneFromAgent(agent: string): Phone | undefined {
  if (/iPhone|iPod/.test(agent)) return 'iPhone';
  if (/Android/.test(agent)) return 'Android';
}

const steps = 'max-w-[51ch] list-decimal space-y-2 ps-6 marker:font-semibold marker:text-accent';

function PhoneInstructions({ phone }: Readonly<{ phone: Phone }>) {
  if (phone === 'iPhone') {
    return (
      <>
        <ol className={steps}>
          <li>
            Open Revue in Safari. Tap <Share aria-hidden="true" className="inline size-4 align-text-bottom" />{' '}
            <strong>Share</strong> in the toolbar or page menu.
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>.
          </li>
          <li>
            If you see <strong>Open as Web App</strong>, leave it on. Tap <strong>Add</strong>.
          </li>
        </ol>
        <p className="text-muted">If Revue asks you to sign in when you open it, you’ll return to Today afterward.</p>
      </>
    );
  }
  return (
    <>
      <ol className={steps}>
        <li>
          Open Revue in Chrome. Tap the <strong>More</strong> (⋮) menu.
        </li>
        <li>
          Choose <strong>Install and create shortcut</strong> or <strong>Add to Home screen</strong>, then{' '}
          <strong>Install</strong> if offered.
        </li>
      </ol>
      <p className="text-muted">A shortcut may open in Chrome.</p>
    </>
  );
}

export function HomeScreenHelp() {
  const offer = useInstallOffer();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const detectedPhone = phoneFromAgent(navigator.userAgent);
  const [selectedPhone, setSelectedPhone] = useState<Phone>();
  const phone = detectedPhone ?? selectedPhone;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (offer === 'installed' || standalone) return null;

  async function openSetup() {
    if (!offer) {
      setOpen(!open);
      return;
    }
    setOpen(false);
    setError(false);
    try {
      await installRevue();
    } catch {
      setError(true);
      setOpen(true);
    }
  }

  return (
    <div className="text-accent-strong">
      <button
        type="button"
        onClick={() => void openSetup()}
        aria-expanded={offer ? undefined : open}
        aria-disabled={offer === 'prompting'}
        className="help-directory-row pressable bg-accent-soft px-3.5 @max-[16rem]/help:px-2 lg:px-[1.375rem]"
      >
        <img
          src="/icons/apple-touch-icon.png"
          width="36"
          height="36"
          alt=""
          className="@max-[16rem]/help:hidden size-9 shrink-0 rounded-xl border border-line"
        />
        <span className="flex-1">Install Revue</span>
        {offer ? (
          <Download aria-hidden="true" className="size-5 shrink-0" />
        ) : (
          <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && !offer && (
        <div className="mx-3.5 @max-[16rem]/help:mx-2 space-y-3 border-b border-line pt-3 pb-4 text-support text-ink lg:mx-[1.375rem]">
          {error && (
            <output className="block">The installer couldn’t open. You can use the browser menu instead.</output>
          )}
          {!detectedPhone && (
            <>
              <p>Choose your phone for setup instructions.</p>
              <fieldset className="flex flex-wrap gap-2" aria-label="Phone instructions">
                {(['iPhone', 'Android'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={option === phone}
                    onClick={() => setSelectedPhone(option)}
                    className="pressable min-h-12 rounded-control border border-line px-4 font-semibold aria-pressed:bg-accent-soft aria-pressed:text-accent-strong"
                  >
                    {option}
                  </button>
                ))}
              </fieldset>
            </>
          )}
          {phone && <PhoneInstructions phone={phone} />}
        </div>
      )}
    </div>
  );
}
