/** Parse JSON from a fetch Response without throwing on empty or invalid bodies. */
export async function readApiJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function apiErrorMessage(res: Response, fallback = "Request failed"): Promise<string> {
  const json = await readApiJson<{ error?: string | null }>(res);
  if (json?.error) return json.error;
  return `${fallback} (${res.status})`;
}
