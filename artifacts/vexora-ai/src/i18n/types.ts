import type { en } from './locales/en';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
/** Shape every locale must match. */
export type Dict = Widen<typeof en>;

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
/** All valid translation keys, e.g. "nav.explore". */
export type TKey = Paths<Dict>;

export type Vars = Record<string, string | number>;
