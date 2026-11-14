import { createContext } from 'react';

/** A session boundary can defer focus while its content is inert. Public pages focus immediately. */
export const FocusRequestContext = createContext((target: HTMLElement | null) => target?.focus());
