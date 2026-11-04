/** Port: short-lived, single-use tickets that open the live WebSocket, so the session token never goes in a URL. */
export abstract class LiveTickets {
  /** Stores the caller's session token under a new random ticket and returns the ticket. */
  abstract issue(token: string): Promise<string>;
  /** Returns the stored token and deletes the ticket; null when it is unknown, used or expired. */
  abstract consume(ticket: string): Promise<string | null>;
}
