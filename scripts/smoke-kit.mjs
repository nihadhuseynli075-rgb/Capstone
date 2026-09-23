/**
 * What the smoke tests share: counted checks, section headings, and a JSON
 * request helper, so a change to how a failure is reported is made once.
 */

/** A fresh pass/fail count, with the check and section helpers that feed it. */
export function createChecks() {
  const counts = { passed: 0, failed: 0 };

  function check(label, condition, detail) {
    if (condition) {
      counts.passed += 1;
      console.log(`  PASS  ${label}`);
    } else {
      counts.failed += 1;
      console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
    }
  }

  function section(title) {
    console.log(`\n${title}`);
  }

  return { check, section, counts };
}

/** Calls the API and returns the status with the parsed body (or the raw text). */
export async function request(baseUrl, route, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return { status: response.status, body: payload };
}
