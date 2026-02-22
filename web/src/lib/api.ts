import { getToken } from "./auth";

export async function fetchMe(baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/me`;
  const token = getToken();
  if (!token) throw new Error("no_token");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`me_failed_${res.status}`);
  return res.json();
}
