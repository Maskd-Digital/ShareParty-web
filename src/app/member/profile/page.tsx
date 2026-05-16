import { redirect } from "next/navigation";
import { MemberPageShell } from "@/components/MemberSidebar";
import { MyProfileEditor, type MyProfile } from "@/components/MyProfileEditor";
import { createClient } from "@/lib/supabase/server";

export default async function MemberProfilePage() {
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
  if (role !== "member") redirect("/dashboard");

  const initial: MyProfile = {
    id: user.id,
    email: profileRow?.email ?? user.email ?? null,
    full_name: profileRow?.full_name ?? null,
    role: "member",
    phone_number: profileRow?.phone_number ?? null,
    date_of_birth: profileRow?.date_of_birth ?? null,
    marketing_opt_in: profileRow?.marketing_opt_in ?? false,
    notification_email: profileRow?.notification_email ?? true,
    notification_push: profileRow?.notification_push ?? true,
    terms_accepted_at: profileRow?.terms_accepted_at ?? null,
  };

  return (
    <MemberPageShell active="profile">
      <MyProfileEditor initial={initial} subtitle="Your contact details and notification preferences." />
    </MemberPageShell>
  );
}
