'use client';
export function LogoutButton() {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/';
  }
  return <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>;
}
