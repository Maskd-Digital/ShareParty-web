import { redirect } from "next/navigation";
import { MemberOnboardingWizard } from "@/components/MemberOnboardingWizard";
import { MemberPageShell } from "@/components/MemberSidebar";
import { createClient } from "@/lib/supabase/server";
import { loadMemberContext } from "@/lib/memberContext";

export default async function MemberOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await loadMemberContext();
  if (ctx?.role === "operator") redirect("/dashboard");
  if (ctx?.activeLibrary) redirect("/member/catalog");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,phone_number,date_of_birth")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <MemberPageShell active="dashboard">
      <MemberOnboardingWizard
        initialFullName={profile?.full_name ?? null}
        initialPhone={profile?.phone_number ?? null}
        initialDob={profile?.date_of_birth ?? null}
      />
    </MemberPageShell>
  );
}
