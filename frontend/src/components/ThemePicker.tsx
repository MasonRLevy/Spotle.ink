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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-spotle-navy/70 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-[2rem] border-4 border-spotle-navy bg-spotle-cream p-6 text-center"
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
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-4 border-spotle-navy bg-spotle-coral text-xl text-spotle-navy transition-transform active:scale-95"
        >
          ×
        </button>

        <h2 className="text-2xl text-spotle-navy">Themes</h2>

        <div className="mt-6 max-h-[45vh] overflow-y-auto rounded-[1.5rem] border-4 border-spotle-navy bg-spotle-navy/5 p-3 pb-6">
          <ul className="grid grid-cols-2 gap-3">
            {GAME_THEMES.map((theme) => {
              const isSelected = selected === theme.id;
              return (
                <li key={theme.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(isSelected ? null : theme.id)}
                    aria-pressed={isSelected}
                    className={`flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[1.25rem] border-4 p-2 transition-transform active:scale-95 ${
                      isSelected
                        ? 'border-green-500 bg-spotle-navy text-spotle-coral'
                        : 'border-spotle-navy bg-spotle-cream text-spotle-navy'
                    }`}
                  >
                    <span className="text-5xl leading-none" aria-hidden="true">
                      {theme.emoji}
                    </span>
                    <span className="text-base">{theme.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full border-4 border-spotle-cream bg-spotle-navy px-6 py-4 text-xl text-spotle-coral transition-transform active:scale-95"
        >
          Close
        </button>
      </div>
    </div>
  );
}
