import { useState } from 'react';

interface EmojiDisplayProps {
  emoji?: string;
  name: string;
  className?: string;
}

export function EmojiDisplay({
  emoji,
  name,
  className = 'h-20 w-20 sm:h-24 sm:w-24',
}: EmojiDisplayProps) {
  const [hasError, setHasError] = useState(false);
  const targetEmoji = emoji?.trim() || '🔍';
  const cdnUrl = `https://emojicdn.elk.sh/${encodeURIComponent(targetEmoji)}?style=fluent`;

  if (hasError) {
    return (
      <span
        className="select-none text-6xl leading-none drop-shadow-md sm:text-7xl"
        role="img"
        aria-label={name}
      >
        {targetEmoji}
      </span>
    );
  }

  return (
    <img
      src={cdnUrl}
      alt={name}
      loading="eager"
      onError={() => setHasError(true)}
      className={`${className} pointer-events-none select-none object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-transform duration-200`}
    />
  );
}