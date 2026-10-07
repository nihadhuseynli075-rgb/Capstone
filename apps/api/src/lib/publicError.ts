/**
 * A server failure whose message is written for the person using the app.
 *
 * Every other error that reaches the error handler is answered with a generic
 * sentence, because its message is whatever the database, the auth server or a
 * library put there: Postgres and PostgREST wording, column and table names,
 * filter syntax. That belongs in the API's log, not in a stranger's browser.
 *
 * `publicMessage` is what the response says. The full message, which may carry
 * the raw detail after it, is only ever logged.
 */
export class PublicError extends Error {
  readonly publicMessage: string;

  constructor(publicMessage: string, detail?: string) {
    super(detail ? `${publicMessage} (${detail})` : publicMessage);
    this.name = "PublicError";
    this.publicMessage = publicMessage;
  }
}
