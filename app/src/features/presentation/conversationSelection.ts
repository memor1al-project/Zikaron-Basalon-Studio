/**
 * The host's chosen discussion questions.
 *
 * Kept out of ConversationPage so that file exports only a component — a module mixing
 * components with plain functions breaks fast refresh for everything importing it.
 *
 * Stored per browser rather than with the story: the questions belong to an evening, not
 * to the person whose testimony is being told, and a host may run several evenings from
 * the same gathered story.
 */

const STORAGE_KEY = "zb.conversation.selected";

export function readChosenPrompts(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? (stored as string[]) : [];
  } catch {
    return [];
  }
}

export function writeChosenPrompts(prompts: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch {
    // A host with site data blocked simply doesn't get their choices remembered.
  }
}
