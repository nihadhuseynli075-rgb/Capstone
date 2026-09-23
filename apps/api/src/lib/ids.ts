const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a string can be a uuid.
 *
 * Postgres does not treat a malformed value in a uuid filter as "no match": it
 * rejects the whole query as invalid input. Anything that arrives from a URL or
 * a request body is checked here first, so an id that cannot exist is a 404 or
 * a guest key rather than a database error.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
