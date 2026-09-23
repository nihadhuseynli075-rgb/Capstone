import { useEffect, useState } from "react";

/** One or two letters for someone with no photo: "Nihad Huseynli" is "NH", "Nihad" is "NI". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
