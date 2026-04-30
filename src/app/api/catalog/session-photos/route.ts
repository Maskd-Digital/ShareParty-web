import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    session_type: "intake" | "return";
    intake_session_id?: string;
    return_session_id?: string;
    shot_key: string;
    url: string;
  };

  if (!body.session_type || !body.shot_key || !body.url) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  if (body.session_type === "intake") {
    if (!body.intake_session_id) return NextResponse.json({ error: "intake_session_id required" }, { status: 400 });
    const { data: s } = await supabase
      .from("catalog_intake_sessions")
      .select("id")
      .eq("id", body.intake_session_id)
      .eq("operator_user_id", user.id)
      .maybeSingle();
    if (!s) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabase.from("session_photos").insert({
      session_type: "intake",
      intake_session_id: body.intake_session_id,
      shot_key: body.shot_key,
      url: body.url,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // return (not wired yet)
  return NextResponse.json({ error: "not_implemented" }, { status: 400 });
}

