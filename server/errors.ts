/** The message of a caught value (`catch (err)` gives `unknown`). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
