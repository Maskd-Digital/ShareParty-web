import { NextResponse } from "next/server";
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

  const { data: recipe } = await supabase
    .from("photo_recipes")
    .select("id,mode,category,version,title,description")
    .eq("scope", "global")
    .eq("mode", "intake")
    .eq("category", body.category)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recipe) return NextResponse.json({ error: "recipe_not_found" }, { status: 404 });

  const { data: shots, error: shotsErr } = await supabase
    .from("photo_recipe_shots")
    .select("shot_key,label,instructions,framing,required,min_photos,max_photos,sort_order")
    .eq("recipe_id", recipe.id)
    .order("sort_order", { ascending: true });
  if (shotsErr) return NextResponse.json({ error: shotsErr.message }, { status: 400 });

  const { data: session, error: sessionErr } = await supabase
    .from("catalog_intake_sessions")
    .insert({
      library_id: lib.id,
      operator_user_id: user.id,
      recipe_id: recipe.id,
      status: "draft",
    })
    .select("id")
    .single();

  if (sessionErr || !session?.id) {
    return NextResponse.json({ error: sessionErr?.message ?? "Failed to create session" }, { status: 400 });
  }

  return NextResponse.json({ sessionId: session.id, libraryId: lib.id, recipe, shots: shots ?? [] });
}

