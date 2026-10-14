import { isIPv4, isIPv6 } from "node:net";

/**
 * Whether an IP address is one on the public internet.
 *
 * The API fetches a question's picture when a student hands in a written
 * answer on it, and the link is whatever the question was saved with. A link
 * to an address inside the server's own network (the machine itself, the
 * host's private network, a cloud metadata service on 169.254.169.254) would
 * have the server fetch something nobody outside should reach. So every
 * address a picture's host resolves to must be public: not loopback, private,
 * link-local, carrier-grade NAT, multicast, unspecified, documentation,
 * benchmarking or otherwise reserved.
 *
 * IPv6 is taken from the global unicast block (2000::/3) only, less its
 * special parts, so a range invented later is refused rather than trusted.
 * An IPv4 address written as IPv6 (::ffff:127.0.0.1, or through NAT64's
 * 64:ff9b::/96) is judged as the IPv4 address it is. Anything that is not an
 * IP address at all is not public.
 */
export function isPublicAddress(address: string): boolean {
  // A zone ("fe80::1%eth0") only says which interface: the address is what counts.
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0];
  if (isIPv4(bare)) return isPublicIPv4(ipv4Number(bare));
  if (isIPv6(bare)) return isPublicIPv6(ipv6Groups(bare));
  return false;
}

/**
 * The IPv4 blocks that are not public, as [first address, prefix length]:
 * the IANA special-purpose registry, less the few blocks it marks as
 * reachable from anywhere.
 */
const NOT_PUBLIC_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network", and the unspecified address 0.0.0.0
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT, shared between a provider's customers
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, where cloud metadata services answer
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relays, retired
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4] // reserved, and the broadcast address 255.255.255.255
];

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function isPublicIPv4(value: number): boolean {
  return !NOT_PUBLIC_IPV4.some(([first, prefix]) => {
    const size = 2 ** (32 - prefix);
    const start = ipv4Number(first);
    return value >= start && value < start + size;
  });
}

/** An IPv6 address as its eight 16-bit groups, with "::" filled in and a dotted IPv4 tail read as two groups. */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase();
  let tail: number[] = [];

  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const value = ipv4Number(dotted[2]);
    tail = [Math.floor(value / 65536), value % 65536];
    // "::ffff:" loses its last colon; "::" keeps both, as the gap it marks.
    text = dotted[1].endsWith("::") ? dotted[1] : dotted[1].slice(0, -1);
  }

  const parse = (part: string) => (part.length === 0 ? [] : part.split(":").map((group) => parseInt(group, 16)));
  const [head, rest] = text.split("::");

  if (rest === undefined) return [...parse(head), ...tail];

  const before = parse(head);
  const after = [...parse(rest), ...tail];
  return [...before, ...new Array<number>(8 - before.length - after.length).fill(0), ...after];
}

function isPublicIPv6(groups: number[]): boolean {
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = groups;

  // An IPv4 address in IPv6 dress: ::ffff:a.b.c.d, or NAT64's 64:ff9b::a.b.c.d.
  const zeroesFromThird = third === 0 && fourth === 0 && fifth === 0;
  const mapped = first === 0 && second === 0 && zeroesFromThird && sixth === 0xffff;
  const nat64 = first === 0x64 && second === 0xff9b && zeroesFromThird && sixth === 0;
  if (mapped || nat64) return isPublicIPv4(seventh * 65536 + eighth);

  // Everything outside 2000::/3 (loopback, unspecified, unique local,
  // link-local, multicast, the rest) is not global unicast.
  if ((first & 0xe000) !== 0x2000) return false;

  if (first === 0x2001 && second < 0x0200) return false; // IETF protocol assignments, Teredo among them
  if (first === 0x2001 && second === 0x0db8) return false; // documentation
  if (first === 0x2002) return false; // 6to4, retired, and it carries any IPv4 address
  if (first === 0x3fff && second < 0x1000) return false; // documentation (3fff::/20)

  return true;
}
