import type { ReactNode } from "react";

type AppShellVariant = "auth" | "default" | "dashboard";

export function AppShell({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: AppShellVariant;
}) {
  if (variant === "auth") {
    return (
      <div className="bg-app-shell min-h-screen px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </div>
    );
  }
  if (variant === "dashboard") {
    return (
      <div className="bg-app-shell min-h-screen px-4 py-8 sm:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    );
  }
  return (
    <div className="bg-app-shell min-h-screen px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-8 shadow-card backdrop-blur-sm sm:p-10">
      {children}
    </div>
  );
}
