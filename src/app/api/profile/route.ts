import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    // Keep this list aligned with your pasted `public.profiles` schema.
    role?: "operator" | "member";
    full_name?: string | null;
    date_of_birth?: string | null;
    phone_number?: string | null;
    marketing_opt_in?: boolean;
    notification_email?: boolean;
    notification_push?: boolean;
    terms_accepted_at?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.full_name !== undefined) patch.full_name = body.full_name;
  if (body.date_of_birth !== undefined) patch.date_of_birth = body.date_of_birth;
  if (body.phone_number !== undefined) patch.phone_number = body.phone_number;
  if (body.marketing_opt_in !== undefined) patch.marketing_opt_in = body.marketing_opt_in;
  if (body.notification_email !== undefined) patch.notification_email = body.notification_email;
  if (body.notification_push !== undefined) patch.notification_push = body.notification_push;
  if (body.terms_accepted_at !== undefined) patch.terms_accepted_at = body.terms_accepted_at;

  // Use upsert so the profile row can be created even if the signup trigger isn't present.
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...patch }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
