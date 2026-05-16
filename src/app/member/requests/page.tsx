import { redirect } from "next/navigation";
import { MemberPageShell } from "@/components/MemberSidebar";
import { MemberRequestsClient } from "@/components/MemberRequestsClient";
import { loadMemberContext } from "@/lib/memberContext";
import { createClient } from "@/lib/supabase/server";

export default async function MemberRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await loadMemberContext();
  if (ctx?.role === "operator") redirect("/dashboard");

  const libraryId = ctx?.activeLibrary?.libraryId ?? ctx?.memberships[0]?.libraryId ?? null;

  return (
    <MemberPageShell active="requests">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-forest-900">My requests</h1>
        <MemberRequestsClient libraryId={libraryId} />
      </div>
    </MemberPageShell>
  );
}
