import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isPublicAddress } from "./publicAddress";

describe("isPublicAddress", () => {
  test("ordinary internet addresses are public", () => {
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "104.18.12.33",
      // Just outside the private and shared blocks.
      "9.255.255.255",
      "11.0.0.0",
      "100.63.255.255",
      "100.128.0.0",
      "172.15.255.255",
      "172.32.0.0",
      "192.167.255.255",
      "192.169.0.0",
      "223.255.255.255",
      "2606:4700:4700::1111",
      "2a00:1450:4001:80b::200e",
      "2001:4860:4860::8888",
      "2001:200::1",
      "3ffe::1"
    ]) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  test("the machine itself, private networks and link-local are not", () => {
    for (const address of [
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "192.168.255.255",
      "169.254.169.254",
      "169.254.0.1",
      "::1",
      "fe80::1",
      "fe80::1%eth0",
      "febf::1",
      "fc00::1",
      "fd12:3456:789a::1"
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  test("carrier-grade NAT, multicast, unspecified and reserved blocks are not", () => {
    for (const address of [
      "100.64.0.1",
      "100.127.255.255",
      "0.0.0.0",
      "0.1.2.3",
      "224.0.0.1",
      "239.255.255.250",
      "240.0.0.1",
      "255.255.255.255",
      "192.0.0.8",
      "192.0.2.10",
      "198.51.100.7",
      "203.0.113.9",
      "198.18.0.1",
      "198.19.255.255",
      "192.88.99.1",
      "::",
      "ff02::1",
      "ff0e::1",
      "2001:db8::1",
      "2001::1",
      "2001:2::1",
      "2002:7f00:1::1",
      "3fff::1",
      "100::1",
      "64:ff9b:1::1",
      "5f00::1"
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  test("an IPv4 address written as IPv6 is judged as the IPv4 address", () => {
    assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
    // How the URL parser writes it: new URL("https://[::ffff:127.0.0.1]/").hostname.
    assert.equal(isPublicAddress("[::ffff:7f00:1]"), false);
    assert.equal(isPublicAddress("::ffff:169.254.169.254"), false);
    assert.equal(isPublicAddress("::ffff:10.0.0.5"), false);
    assert.equal(isPublicAddress("::FFFF:C0A8:0101"), false);
    assert.equal(isPublicAddress("::ffff:8.8.8.8"), true);
    // NAT64: the IPv4 address an IPv6-only network reaches through it.
    assert.equal(isPublicAddress("64:ff9b::7f00:1"), false);
    assert.equal(isPublicAddress("64:ff9b::808:808"), true);
    // The retired IPv4-compatible form is not global unicast at all.
    assert.equal(isPublicAddress("::127.0.0.1"), false);
    assert.equal(isPublicAddress("::8.8.8.8"), false);
  });

  test("anything that is not an IP address is not public", () => {
    for (const address of ["", "localhost", "example.com", "1.2.3", "256.1.1.1", "1.2.3.4.5", "::ffff:999.1.1.1", "12345::", "gggg::1"]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });
});
