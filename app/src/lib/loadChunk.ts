/**
 * Loads a lazily-imported library, turning the one failure mode that isn't the code's fault
 * into an explanation a person can act on.
 *
 * Deploying removes the previous build's chunks. A tab opened before a deploy still asks for
 * those filenames, and Firebase Hosting's catch-all rewrite answers with index.html rather
 * than a 404 — so the browser reports "Failed to fetch dynamically imported module", which
 * reads like a broken feature rather than a stale page.
 *
 * Reloading is deliberately left to the person: this app holds unsaved work in open panels,
 * and silently reloading underneath them would be a worse bug than the one being reported.
 */
export async function loadChunk<T>(load: () => Promise<T>, what: string): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    const isStaleChunk =
      /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);

    if (isStaleChunk) {
      throw new Error(
        `${what} couldn't load because the app was updated in the background. ` +
          `Reload the page (Cmd+Shift+R) and try again — your saved work isn't affected.`
      );
    }
    throw error;
  }
}
