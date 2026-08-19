export const CONDITION_SHORTCUTS = ['A', 'B', 'C', 'D'] as const;

export function getIncludedShortcut(index: number): string | null {
  if (index < 9) return String(index + 1);
  if (index === 9) return '0';
  return null;
}

export function getIncludedShortcuts(questionCount: number): string[] {
  return Array.from({ length: Math.min(questionCount, 10) }, (_, index) => {
    return getIncludedShortcut(index);
  }).filter((shortcut): shortcut is string => shortcut !== null);
}

export const FIXED_SHORTCUTS = [
  { keys: ['Enter'], label: 'Save & Next' },
  { keys: ['F2'], label: 'Needs Review' },
  { keys: ['F1', '?'], label: 'Shortcut Help' },
  { keys: ['Esc'], label: 'Close help' },
] as const;