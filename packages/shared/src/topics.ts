import type { Topic } from "./index";

/** A topic id as it is written: lowercase, a hyphen where there was a space. */
function slugOf(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * The topic id for what someone typed in a topic box.
 *
 * The suggestions show each topic's name beside its id, so people type either.
 * A name that belongs to a known topic is that topic - "Functions and Graphs"
 * is `functions` - rather than a second, near-identical topic that students
 * would then see beside the first. Only something not known becomes a new id.
 */
export function topicIdFor(typed: string, knownTopics: readonly Topic[]): string {
  const slug = slugOf(typed);
  const known = knownTopics.find((topic) => topic.id === slug || slugOf(topic.name) === slug);
  return known ? known.id : slug;
}
