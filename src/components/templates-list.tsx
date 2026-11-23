"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CreateTemplateButton } from "@/components/create-template-button";

type Template = {
  id: string;
  name: string;
  category: string | null;
  exerciseCount: number;
};

export function TemplatesList({ templates }: { templates: Template[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Unique category list for filter dropdown
  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const t of templates) {
      if (t.category) s.add(t.category);
    }
    return Array.from(s).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (search.trim() && !t.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (categoryFilter === "_uncategorized" && t.category) return false;
      if (categoryFilter !== "all" && categoryFilter !== "_uncategorized" && t.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [templates, search, categoryFilter]);

  // Group filtered by category for visual organization
  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of filtered) {
      const key = t.category || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Uncategorized") return 1;
      if (b[0] === "Uncategorized") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  return (
    <div className="mt-4 space-y-3">
      <CreateTemplateButton categories={categories} />

      <Input
        type="search"
        placeholder="Search templates..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {categories.length > 0 && (
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full h-10 text-sm px-3 rounded-md border border-input bg-background"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="_uncategorized">Uncategorized</option>
        </select>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {templates.length}
      </p>

      <div className="space-y-4">
        {templates.length === 0 && (
          <p className="text-muted-foreground text-center py-8 text-sm">
            No templates yet. Tap &ldquo;+ New Template&rdquo; above.
          </p>
        )}
        {grouped.map(([catName, items]) => (
          <div key={catName}>
            {(categories.length > 0 || catName !== "Uncategorized") && (
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
                {catName}
              </h2>
            )}
            <div className="space-y-2">
              {items.map((t) => (
                <Link key={t.id} href={`/templates/${t.id}`}>
                  <Card className="p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{t.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {t.exerciseCount} exercise{t.exerciseCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
