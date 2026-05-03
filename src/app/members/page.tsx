import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OperatorSidebar } from "@/components/OperatorSidebar";
import { createClient } from "@/lib/supabase/server";
import { MembersManager } from "@/components/MembersManager";

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profileRow?.role ?? "member";
  if (role !== "operator") redirect("/dashboard");

  const { data: libs } = await supabase.from("libraries").select("id,library_name").eq("owner_user_id", user.id).limit(1);
  const active = libs?.[0] ?? null;
  if (!active) redirect("/dashboard");

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-stretch">
        <OperatorSidebar active="members" />

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <MembersManager libraryId={active.id} libraryName={active.library_name} />
        </main>
      </div>
    </AppShell>
  );
}

