import { redirect } from "next/navigation";
import { ChildrenManager } from "@/components/ChildrenManager";
import { MemberPageShell } from "@/components/MemberSidebar";
import { createClient } from "@/lib/supabase/server";

export default async function MemberChildrenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((profile?.role ?? "member") !== "member") redirect("/dashboard");

  return (
    <MemberPageShell active="children">
      <ChildrenManager />
    </MemberPageShell>
  );
}
