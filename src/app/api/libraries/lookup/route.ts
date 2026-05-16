import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const libraryId = new URL(request.url).searchParams.get("library_id")?.trim();
  if (!libraryId) return NextResponse.json({ error: "library_id required" }, { status: 400 });

  const { data, error } = await supabase.rpc("get_library_join_card", { p_library_id: libraryId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: "Library not found" }, { status: 404 });

  return NextResponse.json({ library: row });
}
