/**
 * One bilingual entry per line.
 *
 * ```ts
 * export const home = defineMessages({
 *   'home.title': ['Home', 'الرئيسية'],
 * });
 * ```
 *
 * Storing both languages as a tuple rather than two parallel objects is what
 * makes a *complete* Arabic translation a compile error instead of a string
 * that silently falls back to English at runtime: `ar` is derived from `en`'s
 * keys below, and adding a key without its translation fails `tsc`.
 *
 * `const` generics keep the literal key and value types, so `MessageKey` is a
 * real union of every key in the app and `t()` rejects typos the same way.
 */
export function defineMessages<const T extends Record<string, readonly [string, string]>>(entries: T): T {
  return entries;
}

export type MessageEntry = readonly [string, string];
export type MessageTable = Record<string, MessageEntry>;

/** English wins a merge conflict — the English table is the key authority. */
export function mergeMessages(...tables: MessageTable[]): Record<string, MessageEntry> {
  return Object.assign({}, ...tables) as Record<string, MessageEntry>;
}
