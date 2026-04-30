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

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const mode = url.searchParams.get("mode") ?? "intake";
  if (!category) {
    return NextResponse.json({ error: "category required" }, { status: 400 });
  }
  if (mode !== "intake" && mode !== "return") {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }

  const { data: recipe, error: recipeErr } = await supabase
    .from("photo_recipes")
    .select("id,mode,category,version,title,description")
    .eq("scope", "global")
    .eq("mode", mode)
    .eq("category", category)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recipeErr || !recipe) {
    return NextResponse.json({ error: "recipe_not_found" }, { status: 404 });
  }

  const { data: shots, error: shotsErr } = await supabase
    .from("photo_recipe_shots")
    .select("shot_key,label,instructions,framing,required,min_photos,max_photos,sort_order")
    .eq("recipe_id", recipe.id)
    .order("sort_order", { ascending: true });

  if (shotsErr) {
    return NextResponse.json({ error: shotsErr.message }, { status: 400 });
  }

  return NextResponse.json({ recipe, shots: shots ?? [] });
}

