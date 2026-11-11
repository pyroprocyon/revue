/** Short facts on one line, such as "Published by Revue · Not yet checked". */
export function FactLine({ facts, className }: Readonly<{ facts: string[]; className: string }>) {
  return (
    <p className={className}>
      {facts.map((fact, index) => (
        <span key={fact}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <span>{fact}</span>
        </span>
      ))}
    </p>
  );
}
