import { useEffect, useState } from "react";

/** Letters and digits, in any script, matched whole rather than as UTF-16 halves. */
const LETTERS = /[\p{L}\p{N}]/gu;

/** The first character a reader would see, an emoji or a flag included. */
function firstGrapheme(text: string): string {
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    return segment;
  }
  return "";
}

/**
 * One or two letters for someone with no photo: "Nihad Huseynli" is "NH",
 * "Nihad" is "NI".
 *
 * Built from each word's letters, never from string positions: indexing a
 * name that starts with an emoji or a flag took half of the emoji and drew a
 * broken-character box. A word with no letters in it ("😀", "🇦🇿") is passed
 * over, so "😀 Ali" is "AL"; a name with no letters at all shows its first
 * emoji whole.
 */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.match(LETTERS) ?? [])
    .filter((letters) => letters.length > 0);

  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).join("").toUpperCase();

  return firstGrapheme(name.trim()) || "?";
}

/**
 * A round profile picture: the photo when there is one and it loads, the
 * initials otherwise.
 *
 * A photo can fail to load for reasons nothing here controls. A Google photo's
 * address, for one, stops working when its owner changes their Google
 * picture. Initials are a better fallback than a broken-image icon.
 *
 * `alt` is left empty where the name is printed right beside the picture,
 * which is everywhere but the profile page's own large one.
 */
export function Avatar({
  name,
  photoUrl,
  size = 30,
  alt = ""
}: {
  name: string;
  photoUrl: string | null | undefined;
  size?: number;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (photoUrl && !failed) {
    return (
      <img
        className="avatar avatar-photo"
        src={photoUrl}
        alt={alt}
        width={size}
        height={size}
        style={style}
        // Google's photo servers turn away some requests that say which page asked.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className="avatar"
      style={style}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {initialsOf(name)}
    </span>
  );
}
