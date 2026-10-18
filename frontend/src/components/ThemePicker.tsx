import { GAME_THEMES, type ThemeType } from '@shared/game';

/**
 * Theme picker popup.
 *
 * Scrollable grid of themes - icon with its name underneath. Picking one
 * tells the server, which then only draws round targets from items carrying
 * that theme. Closes on the X, the Close button, the backdrop, or Escape.
 */
interface ThemePickerProps {
  selected: ThemeType | null;
  onSelect: (theme: ThemeType | null) => void;
  onClose: () => void;
}

export function ThemePicker({ selected, onSelect, onClose }: ThemePickerProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-spotle-navy/70 p-4 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative max-h-[calc(100dvh-2rem)] w-[min(88vw,24rem)] overflow-y-auto rounded-[1.5rem] border-4 border-spotle-navy bg-spotle-cream p-4 text-center sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:max-w-md sm:rounded-[2rem] sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a theme"
        // Clicks inside must not reach the backdrop handler.
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close themes"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-4 border-spotle-navy bg-spotle-coral text-xl text-spotle-navy transition-transform active:scale-95 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
        >
          ×
        </button>

        <h2 className="pr-10 text-xl text-spotle-navy sm:pr-0 sm:text-2xl">Themes</h2>

        <div className="mt-4 rounded-[1.25rem] border-4 border-spotle-navy bg-spotle-navy/5 p-3 sm:mt-6 sm:rounded-[1.5rem] sm:p-4">
          <ul className="grid grid-cols-2 gap-2 sm:gap-3">
            {GAME_THEMES.map((theme) => {
              const isSelected = selected === theme.id;
              return (
                <li key={theme.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(isSelected ? null : theme.id)}
                    aria-pressed={isSelected}
                    className={`flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[1rem] border-4 p-1.5 transition-transform active:scale-95 sm:rounded-[1.25rem] sm:p-2 ${
                      isSelected
                        ? 'border-green-500 bg-spotle-navy text-spotle-coral'
                        : 'border-spotle-navy bg-spotle-cream text-spotle-navy'
                    }`}
                  >
                    <span className="text-4xl leading-none sm:text-5xl" aria-hidden="true">
                      {theme.emoji}
                    </span>
                    <span className="text-sm sm:text-base">{theme.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border-4 border-spotle-cream bg-spotle-navy px-5 py-3 text-lg text-spotle-coral transition-transform active:scale-95 sm:mt-6 sm:px-6 sm:py-4 sm:text-xl"
        >
          Close
        </button>
      </div>
    </div>
  );
}
