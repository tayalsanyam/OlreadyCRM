export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(r.status === 401 ? "Unauthorized" : r.status === 404 ? "Not found" : `Request failed: ${r.status}`);
    return r.json();
  });
