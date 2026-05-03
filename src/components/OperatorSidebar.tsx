import Link from "next/link";
import type { ReactNode } from "react";

export type OperatorNavActive = "dashboard" | "catalog" | "members" | "my-profile" | "library-settings";

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm no-underline ${
        active ? "bg-forest-800 font-semibold text-cream-50" : "text-forest-800/85"
      }`}
    >
      {children}
    </Link>
  );
}

export function OperatorSidebar({ active }: { active: OperatorNavActive }) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-cream-300/80 bg-cream-50/90 p-4 shadow-card">
      <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-forest-700/75">Operator</p>
      <nav className="flex flex-1 flex-col gap-1 text-sm">
        <NavLink href="/dashboard" active={active === "dashboard"}>
          Dashboard
        </NavLink>
        <NavLink href="/catalog" active={active === "catalog"}>
          Manage catalog
        </NavLink>
        <NavLink href="/members" active={active === "members"}>
          Members
        </NavLink>
        <NavLink href="/my-profile" active={active === "my-profile"}>
          My profile
        </NavLink>
        <NavLink href="/library-settings" active={active === "library-settings"}>
          Library settings
        </NavLink>
      </nav>
      <form action="/auth/signout" method="post" className="mt-4 border-t border-cream-300/60 pt-4">
        <button
          type="submit"
          className="w-full rounded-lg border border-cream-300/90 bg-cream-100/80 px-3 py-2 text-left text-sm font-medium text-forest-800 transition hover:bg-cream-200/90 hover:text-forest-900"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
