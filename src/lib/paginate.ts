/**
 * Fetch every row from a Supabase query, transparently paging past the
 * server's 1000-row cap. The caller supplies a `fetchPage` callback that
 * applies `.range(from, to)` to its query and returns the result.
 *
 * Errors are surfaced, not swallowed: if any page returns a Postgrest error
 * the whole call throws, matching the `throw new Error(error.message)`
 * convention used by the mutation actions. (Previously an errored page looked
 * identical to "no more rows" and silently produced partial/empty results.)
 */
export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}
