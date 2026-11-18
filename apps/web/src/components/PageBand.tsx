import type { ReactNode } from "react";
import { Ascent } from "./Ascent";

/**
 * The navy band that opens the privacy, terms and 404 pages: the page's own
 * title and intro line on the left, the ridge from the landing page and the
 * sign-in panel on the right (under the words on a phone). On the 404 the
 * climb stops short of the flag (`short`).
 *
 * Only the page's existing words go in; `children` is for an action that
 * belongs with them, such as the 404's way home.
 */
export function PageBand({
  title,
  intro,
  short = false,
  children
}: {
  title: string;
  intro: string;
  short?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="page-band">
      <div className="page-band-text">
        <h1>{title}</h1>
        <p className="page-band-intro">{intro}</p>
        {children}
      </div>

      <div className="page-band-art">
        <Ascent variant="band" short={short} />
      </div>
    </header>
  );
}
