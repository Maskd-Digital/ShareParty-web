import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { FIXED_INTAKE_SHOTS } from "@/lib/intakePhotoChecklist";
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

  if (body.session_type === "return") {
    if (!body.return_session_id) return NextResponse.json({ error: "return_session_id required" }, { status: 400 });

    const { data: s } = await supabase
      .from("return_inspection_sessions")
      .select("id,member_user_id,library_id,status")
      .eq("id", body.return_session_id)
      .maybeSingle();
    if (!s) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const memberShotKeys = new Set(FIXED_INTAKE_SHOTS.map((x) => x.shot_key));
    const isMember = s.member_user_id === user.id;
    const isMemberReturnShot = memberShotKeys.has(body.shot_key);

    if (isMember && isMemberReturnShot) {
      if (s.status !== "draft") {
        return NextResponse.json({ error: "session_not_editable" }, { status: 400 });
      }
      const { error } = await supabase.from("session_photos").insert({
        session_type: "return",
        return_session_id: body.return_session_id,
        shot_key: body.shot_key,
        url: body.url,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.shot_key === "operator_addendum") {
      try {
        await assertLibraryOperator(supabase, user.id, s.library_id);
      } catch {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (s.status !== "submitted") {
        return NextResponse.json({ error: "session_not_ready_for_operator_photo" }, { status: 400 });
      }
      await supabase
        .from("session_photos")
        .delete()
        .eq("session_type", "return")
        .eq("return_session_id", body.return_session_id)
        .eq("shot_key", "operator_addendum");
      const { error } = await supabase.from("session_photos").insert({
        session_type: "return",
        return_session_id: body.return_session_id,
        shot_key: body.shot_key,
        url: body.url,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ error: "invalid session_type" }, { status: 400 });
}

