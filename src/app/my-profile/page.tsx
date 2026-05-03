import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OperatorSidebar } from "@/components/OperatorSidebar";
import { createClient } from "@/lib/supabase/server";
import { MyProfileEditor, type MyProfile } from "@/components/MyProfileEditor";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "id,email,full_name,role,phone_number,date_of_birth,marketing_opt_in,notification_email,notification_push,terms_accepted_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  const role = profileRow?.role ?? "member";
  if (role !== "operator") redirect("/dashboard");

  const initial: MyProfile = {
    id: user.id,
    email: profileRow?.email ?? user.email ?? null,
    full_name: profileRow?.full_name ?? null,
    role: "operator",
    phone_number: profileRow?.phone_number ?? null,
    date_of_birth: profileRow?.date_of_birth ?? null,
    marketing_opt_in: profileRow?.marketing_opt_in ?? false,
    notification_email: profileRow?.notification_email ?? true,
    notification_push: profileRow?.notification_push ?? true,
    terms_accepted_at: profileRow?.terms_accepted_at ?? null,
  };

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-stretch">
        <OperatorSidebar active="my-profile" />

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <MyProfileEditor initial={initial} />
        </main>
      </div>
    </AppShell>
  );
}

