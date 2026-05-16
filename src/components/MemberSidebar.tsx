import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

export type MemberNavActive =
  | "dashboard"
  | "catalog"
  | "requests"
  | "returns"
  | "profile"
  | "children"
  | "onboarding";

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

export function MemberSidebar({ active }: { active: MemberNavActive }) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-cream-300/80 bg-cream-50/90 p-4 shadow-card">
      <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-forest-700/75">Member</p>
      <nav className="flex flex-1 flex-col gap-1 text-sm">
        <NavLink href="/dashboard" active={active === "dashboard"}>
          Dashboard
        </NavLink>
        <NavLink href="/member/catalog" active={active === "catalog"}>
          Browse catalog
        </NavLink>
        <NavLink href="/member/requests" active={active === "requests"}>
          My requests
        </NavLink>
        <NavLink href="/returns" active={active === "returns"}>
          My borrows
        </NavLink>
        <NavLink href="/member/profile" active={active === "profile"}>
          Profile
        </NavLink>
        <NavLink href="/member/children" active={active === "children"}>
          Children
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

export function MemberLayout({
  active,
  children,
}: {
  active: MemberNavActive;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-stretch">
      <MemberSidebar active={active} />
      <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">{children}</main>
    </div>
  );
}

/** Standard member app chrome: shell padding + sidebar on every authenticated member screen. */
export function MemberPageShell({
  active,
  children,
}: {
  active: MemberNavActive;
  children: ReactNode;
}) {
  return (
    <AppShell variant="dashboard">
      <MemberLayout active={active}>{children}</MemberLayout>
    </AppShell>
  );
}
