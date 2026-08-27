/** Thin public API client — no HQ contracts. */
const API_BASE = (typeof window !== "undefined" && window.CALLMATE_API_BASE) || "";

export async function login(loginName, password) {
  if (!API_BASE) {
    // Local stub for UI wiring until API URL is configured.
    if (loginName === "admin" && password === "admin") {
      return { session: "stub-admin", role: "superadmin", company_id: null, company_locked: false };
    }
    if (loginName === "locked" && password) {
      return { session: "stub-locked", role: "company", company_id: "stub", company_locked: true };
    }
    if (loginName && password) {
      return { session: "stub-co", role: "company", company_id: "stub", company_locked: false };
    }
    const err = new Error("invalid_credentials");
    err.code = "invalid_credentials";
    throw err;
  }
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: loginName, password }),
  });
  if (!res.ok) {
    const err = new Error("invalid_credentials");
    err.code = "invalid_credentials";
    throw err;
  }
  return res.json();
}

export async function logout(session) {
  if (!API_BASE) return;
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
  });
}
