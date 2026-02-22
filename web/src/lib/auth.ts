export function setToken(token: string) {
  try {
    localStorage.setItem("cb_token", token);
  } catch {}
}

export function getToken(): string | null {
  try {
    return localStorage.getItem("cb_token");
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem("cb_token");
  } catch {}
}
