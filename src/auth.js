export const DEFAULT_USERS = [
  { id: "u1", name: "Owner", username: "TMWORKS", password: "tmworks@123", role: "superadmin", active: true },
  { id: "u2", name: "Manager Ana", username: "admin", password: "admin123", role: "admin", active: true },
  { id: "u3", name: "Staff Carlo", username: "staff", password: "staff123", role: "staff", active: true },
];

function normalizeValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function findMatchingUser(users, username, password) {
  const normalizedUsername = normalizeValue(username);
  const normalizedPassword = String(password ?? "").trim();

  return (Array.isArray(users) ? users : []).find((user) => {
    if (!user?.active) return false;
    return normalizeValue(user.username) === normalizedUsername && String(user.password ?? "").trim() === normalizedPassword;
  });
}
