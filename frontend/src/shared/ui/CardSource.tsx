import { textLink, textLinkTarget } from './buttonStyles';

const WEB_ADDRESS = /https:\/\/\S+/;

/**
 * A card's optional source, such as a teacher's "Grade 6 Araling Panlipunan book, page 45" or a
 * name followed by a web address. The address becomes a link on the name, so a long address
 * never stretches the card. The link opens a new tab, so the student keeps their place.
 */
export function CardSource({ source, citation = false }: Readonly<{ source: string; citation?: boolean }>) {
  const address = WEB_ADDRESS.exec(source)?.[0];
  const name = address === undefined ? source : source.replace(address, '').trim().replace(/:$/, '');
  const value =
    address === undefined ? (
      name
    ) : (
      <a
        href={address}
        target="_blank"
        rel="noreferrer"
        className={`${textLink} ${textLinkTarget} ${citation ? 'px-0!' : ''}`}
      >
        {name || address}
      </a>
    );
  if (citation) {
    return (
      <section className="border-t border-line pt-3">
        <h3 className="text-support font-semibold text-muted">Source</h3>
        <p className="text-support text-muted">{value}</p>
      </section>
    );
  }
  return <p className="mt-3 text-support text-muted">Source: {value}</p>;
}
