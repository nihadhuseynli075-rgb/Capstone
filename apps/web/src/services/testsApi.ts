import type { MockTest, TestSettings } from "@grade9/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export async function generateMockTest(settings: TestSettings): Promise<MockTest> {
  const response = await fetch(`${API_BASE_URL}/api/tests/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(settings)
  });

  if (!response.ok) {
    throw new Error("Unable to generate mock test");
  }

  return response.json();
}
