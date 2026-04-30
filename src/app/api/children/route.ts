import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Your pasted schema for `public.member_children` does not include `library_id`,
  // so we currently return only the authenticated user's rows.

  const { data, error } = await supabase
    .from("member_children")
    .select("id,birth_year,first_name")
    .eq("member_user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const currentYear = new Date().getFullYear();
  const children = (data ?? []).map((row) => ({
    id: row.id,
    age: currentYear - row.birth_year,
    name: row.first_name ?? null,
  }));

  return NextResponse.json({ children });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { libraryId?: string; age: number; name?: string | null };
  if (typeof body.age !== "number") {
    return NextResponse.json({ error: "age required" }, { status: 400 });
  }

  const currentYear = new Date().getFullYear();
  const birth_year = currentYear - body.age;

  // `public.member_children.first_name` is NOT NULL in the pasted schema.
  const first_name = body.name?.trim() ? body.name.trim() : "Child";

  const { data, error } = await supabase
    .from("member_children")
    .insert({
      member_user_id: user.id,
      first_name,
      birth_year,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}
