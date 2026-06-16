// Pure shelf logic — no Dexie imports so this module is fully testable in Node.

export const SHELF_COLORS = [
  '#c9913a', // gold
  '#5f8f6a', // sage
  '#4a7aad', // slate
  '#b05c3e', // terra
  '#7a5fa0', // plum
  '#9a6b3a', // umber
  '#4a8a8a', // teal
]

export function nextShelfColor(currentCount: number): string {
  return SHELF_COLORS[currentCount % SHELF_COLORS.length]
}

export interface MembershipLike {
  shelfId: string
  bookId: string
}

/** Idempotent add: if [shelfId+bookId] already exists, returns the same array. */
export function addMembership<T extends MembershipLike>(
  memberships: T[],
  candidate: T,
): T[] {
  const exists = memberships.some(
    m => m.shelfId === candidate.shelfId && m.bookId === candidate.bookId,
  )
  return exists ? memberships : [...memberships, candidate]
}

/** Remove the single [shelfId+bookId] membership. Other memberships untouched. */
export function removeMembership<T extends MembershipLike>(
  memberships: T[],
  bookId: string,
  shelfId: string,
): T[] {
  return memberships.filter(m => !(m.shelfId === shelfId && m.bookId === bookId))
}

/** Delete-shelf cascade: removes every membership for the given shelf. Books untouched. */
export function removeShelfMemberships<T extends MembershipLike>(
  memberships: T[],
  shelfId: string,
): T[] {
  return memberships.filter(m => m.shelfId !== shelfId)
}

/** Delete-book cascade: removes every membership for the given book. Shelves untouched. */
export function removeBookMemberships<T extends MembershipLike>(
  memberships: T[],
  bookId: string,
): T[] {
  return memberships.filter(m => m.bookId !== bookId)
}

/** Returns the subset of books that have a membership on the given shelf. */
export function booksOnShelf<B extends { id: string }>(
  books: B[],
  memberships: MembershipLike[],
  shelfId: string,
): B[] {
  const ids = new Set(memberships.filter(m => m.shelfId === shelfId).map(m => m.bookId))
  return books.filter(b => ids.has(b.id))
}

/** Book count for a shelf — used for the shelf rail badge. */
export function shelfBookCount(memberships: MembershipLike[], shelfId: string): number {
  return memberships.filter(m => m.shelfId === shelfId).length
}

/** All shelf IDs a given book belongs to. */
export function shelvesForBook(memberships: MembershipLike[], bookId: string): string[] {
  return memberships.filter(m => m.bookId === bookId).map(m => m.shelfId)
}
