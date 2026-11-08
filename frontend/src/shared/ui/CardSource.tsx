import { textLink } from './buttonStyles';

const WEB_ADDRESS = /https:\/\/\S+/;

/**
 * A card's optional source, such as a teacher's "Grade 6 Araling Panlipunan book, page 45" or a
 * name followed by a web address. The address becomes a link on the name, so a long address
 * never stretches the card. The link opens a new tab, so the student keeps their place.
 */
export function CardSource({ source }: { source: string }) {
  const address = WEB_ADDRESS.exec(source)?.[0];
  const name = address === undefined ? source : source.replace(address, '').trim().replace(/:$/, '');
  return (
    <p className="mt-3 text-support text-muted">
      Source:{' '}
      {address === undefined ? (
        name
      ) : (
        <a href={address} target="_blank" rel="noreferrer" className={textLink}>
          {name || address}
        </a>
      )}
    </p>
  );
}
