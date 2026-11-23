"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTemplate } from "@/actions/templates";
import { SHEET_SCROLL_CLASS, scrollFocusedIntoView } from "@/lib/sheet-helpers";

export function CreateTemplateButton({ categories = [] }: { categories?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const t = await createTemplate(name, category || null);
      setOpen(false);
      setName("");
      setCategory("");
      router.push(`/templates/${t.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="w-full h-12 font-semibold"
      >
        + New Template
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className={SHEET_SCROLL_CLASS}>
          <SheetHeader>
            <SheetTitle>New Template</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="templateName">Template Name</Label>
              <Input
                id="templateName"
                placeholder="e.g., Push Day"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={scrollFocusedIntoView}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="templateCat">
                Category <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                id="templateCat"
                placeholder="e.g., Strength, Conditioning, Mobility"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onFocus={scrollFocusedIntoView}
                list="cats"
              />
              <datalist id="cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground mt-1">
                Group templates by category. Type to add a new one or pick an existing.
              </p>
            </div>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || isPending}
              className="w-full h-12"
            >
              {isPending ? "Creating..." : "Create Template"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
