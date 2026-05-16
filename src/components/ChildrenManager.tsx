"use client";

import { useEffect, useState } from "react";

type Child = { id: string; age: number; name: string | null };

export function ChildrenManager() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [age, setAge] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/children");
      const j = (await res.json()) as { error?: string; children?: Child[] };
      if (!res.ok) throw new Error(j.error ?? "Failed to load");
      setChildren(j.children ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addChild() {
    const ageNum = Number(age);
    if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 17) {
      setError("Age must be between 0 and 17");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age: ageNum, name: name.trim() || null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to add");
      setAge("");
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function removeChild(id: string) {
    if (!confirm("Remove this child?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/children/${id}`, { method: "DELETE" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to delete");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-forest-900">Children</h1>
        <p className="mt-1 text-sm text-forest-800/85">
          Optional. Add children you borrow toys for (age only; minimal data for COPPA).
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <div className="grid gap-3 rounded-xl border border-cream-300/80 bg-cream-100/50 p-4 sm:grid-cols-[100px_1fr_auto]">
        <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
          Age
          <input className="input-cream" type="number" min={0} max={17} value={age} onChange={(e) => setAge(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
          Name (optional)
          <input className="input-cream" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="button" className="btn-primary self-end" disabled={saving} onClick={() => void addChild()}>
          Add
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-forest-700">Loading…</p>
      ) : children.length === 0 ? (
        <p className="text-sm text-forest-700/90">No children added yet.</p>
      ) : (
        <ul className="divide-y divide-cream-300/80 rounded-xl border border-cream-300/80">
          {children.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="font-medium text-forest-900">
                {c.name ?? "Child"} — age {c.age}
              </span>
              <button
                type="button"
                className="text-sm font-medium text-red-700 underline"
                onClick={() => void removeChild(c.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}