import { NextResponse } from "next/server";
import { FIXED_INTAKE_SHOTS } from "@/lib/intakePhotoChecklist";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "operator") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { category: string };
  if (!body.category?.trim()) return NextResponse.json({ error: "category required" }, { status: 400 });

  const { data: lib } = await supabase
    .from("libraries")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!lib?.id) return NextResponse.json({ error: "no_library" }, { status: 400 });

  const { data: session, error: sessionErr } = await supabase
    .from("catalog_intake_sessions")
    .insert({
      library_id: lib.id,
      operator_user_id: user.id,
      toy_category: body.category.trim(),
      status: "draft",
    })
    .select("id")
    .single();

  if (sessionErr || !session?.id) {
    return NextResponse.json({ error: sessionErr?.message ?? "Failed to create session" }, { status: 400 });
  }

  return NextResponse.json({
    sessionId: session.id,
    libraryId: lib.id,
    toyCategory: body.category.trim(),
    shots: FIXED_INTAKE_SHOTS,
  });
}

