import { TODAY_PATH } from '../../../shared/navigation/paths';
import { NavigationLink } from '../../../shared/ui/NavigationLink';

export function ReviewHeading({ title }: Readonly<{ title?: string }>) {
  return (
    <div className="study-session-heading flex flex-wrap items-center justify-between gap-x-3">
      <h1
        className={
          title
            ? 'min-w-0 flex-[1_1_8rem] text-lg leading-tight font-bold wrap-anywhere sm:text-section'
            : 'text-title font-extrabold tracking-tight'
        }
      >
        {title ?? 'Review'}
      </h1>
      <NavigationLink to={TODAY_PATH} back>
        Finish for now
      </NavigationLink>
    </div>
  );
}
