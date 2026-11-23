"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BODY_PART_OPTIONS, bodyPartLabel } from "@/lib/body-parts";
import {
  createInjuryArea,
  updateInjuryArea,
  deleteInjuryArea,
  type InjuryArea,
  type InjuryStatus,
} from "@/actions/symptoms";
import { updateUserContext, type UserContext } from "@/actions/user-context";

const STATUS_OPTIONS: { value: InjuryStatus; label: string; color: string }[] = [
  { value: "active",    label: "Active",    color: "bg-red-400/15 text-red-300" },
  { value: "rehabbing", label: "Rehabbing", color: "bg-orange-400/15 text-orange-300" },
  { value: "managing",  label: "Managing",  color: "bg-yellow-400/15 text-yellow-300" },
  { value: "resolved",  label: "Resolved",  color: "bg-emerald-400/15 text-emerald-300" },
];

const STATUS_STYLE = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.color]));

export function ProfileEditor({
  injuries,
  context,
}: {
  injuries: InjuryArea[];
  context: UserContext | null;
}) {
  return (
    <>
      <ContextSection context={context} />
      <InjuriesSection injuries={injuries} />
    </>
  );
}

// ─── Context (goals / training style / notes) ────────────────────────────

function ContextSection({ context }: { context: UserContext | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<"goals" | "training_style" | "notes" | null>(null);
  const [draft, setDraft] = useState("");

  function open(field: "goals" | "training_style" | "notes") {
    setEditing(field);
    setDraft(((context as Record<string, string | null> | null)?.[field] ?? "") || "");
  }

  function save() {
    if (!editing) return;
    const value = draft;
    startTransition(async () => {
      await updateUserContext({ [editing]: value });
      setEditing(null);
      router.refresh();
    });
  }

  const fields = [
    { key: "goals" as const,          title: "Goals",          icon: "🎯", placeholder: "What you're working toward right now." },
    { key: "training_style" as const, title: "Training style", icon: "🏋️", placeholder: "How you train: split, RPE/RIR philosophy, deload cadence, anything Claude should adapt to." },
    { key: "notes" as const,          title: "Notes",          icon: "📝", placeholder: "Anything else: preferences, equipment access, schedule, life context." },
  ];

  return (
    <>
      {fields.map((f) => {
        const value = (context as Record<string, string | null> | null)?.[f.key] ?? null;
        return (
          <Card key={f.key} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {f.icon} {f.title}
              </h2>
              <button
                onClick={() => open(f.key)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </button>
            </div>
            {value ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{value}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">{f.placeholder}</p>
            )}
          </Card>
        );
      })}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>
              Edit {editing === "goals" ? "Goals" : editing === "training_style" ? "Training Style" : "Notes"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full min-h-[200px] p-3 bg-background border border-border rounded-md text-sm"
              autoFocus
              placeholder={fields.find((f) => f.key === editing)?.placeholder}
            />
            <Button onClick={save} disabled={isPending} className="w-full h-12">
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Injuries (with status + training modifications) ────────────────────

function InjuriesSection({ injuries }: { injuries: InjuryArea[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<InjuryArea | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<InjuryStatus>("rehabbing");
  const [trainingMods, setTrainingMods] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [bodyParts, setBodyParts] = useState<string[]>([]);

  function openCreate() {
    setEditing(null);
    setName(""); setDescription(""); setStatus("rehabbing"); setTrainingMods("");
    setStartedOn(""); setBodyParts([]);
    setSheetOpen(true);
  }

  function openEdit(area: InjuryArea) {
    setEditing(area);
    setName(area.name);
    setDescription(area.description ?? "");
    setStatus(area.status);
    setTrainingMods(area.training_modifications ?? "");
    setStartedOn(area.started_on ?? "");
    setBodyParts(area.related_body_parts ?? []);
    setSheetOpen(true);
  }

  function togglePart(value: string) {
    setBodyParts((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function save() {
    if (!name.trim()) return;
    startTransition(async () => {
      if (editing) {
        await updateInjuryArea(editing.id, {
          name, description, relatedBodyParts: bodyParts, status,
          trainingModifications: trainingMods, startedOn,
        });
      } else {
        await createInjuryArea(name, description, bodyParts, status, trainingMods, startedOn);
      }
      setSheetOpen(false);
      router.refresh();
    });
  }

  function del(id: string) {
    startTransition(async () => {
      await deleteInjuryArea(id);
      setConfirmDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            🩹 Injuries & limitations
          </h2>
          <button
            onClick={openCreate}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add
          </button>
        </div>

        {injuries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No injuries tracked. Add anything Claude should consider when advising you.
          </p>
        ) : (
          <div className="space-y-3">
            {injuries.map((area) => (
              <div key={area.id} className="border-l-2 border-border pl-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="font-semibold text-sm">{area.name}</p>
                    {area.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{area.description}</p>
                    )}
                  </div>
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 ${STATUS_STYLE[area.status]}`}>
                    {area.status}
                  </span>
                </div>
                {area.training_modifications && (
                  <p className="text-xs mt-1.5 text-muted-foreground">
                    <span className="font-medium text-foreground">Modifications:</span> {area.training_modifications}
                  </p>
                )}
                {area.related_body_parts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {area.related_body_parts.map((bp) => (
                      <span key={bp} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-300">
                        {bodyPartLabel(bp)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => openEdit(area)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  {confirmDelete !== area.id ? (
                    <button
                      onClick={() => setConfirmDelete(area.id)}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Delete
                    </button>
                  ) : (
                    <>
                      <button onClick={() => del(area.id)} disabled={isPending} className="text-[11px] text-destructive font-semibold">Confirm</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-[11px] text-muted-foreground">Cancel</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit injury" : "Add injury"}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="i-name">Name</Label>
              <Input id="i-name" placeholder="e.g., Right shoulder" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="i-desc">Description</Label>
              <Input id="i-desc" placeholder="e.g., Rotator cuff strain from heavy pressing" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <div className="flex gap-1.5 mt-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`flex-1 text-xs py-2 rounded border transition-colors ${
                      status === opt.value
                        ? "bg-blue-400 text-background border-blue-400 font-medium"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="i-mods">Training modifications</Label>
              <textarea
                id="i-mods"
                placeholder="What you do differently because of this. e.g., RPE 4-5 on shoulder work, avoid overhead pressing >50lb, prefer cable variants."
                value={trainingMods}
                onChange={(e) => setTrainingMods(e.target.value)}
                className="w-full mt-1 p-2 bg-background border border-border rounded-md text-sm min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="i-started">Started (optional)</Label>
              <Input id="i-started" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </div>
            <div>
              <Label>Related body parts</Label>
              <p className="text-xs text-muted-foreground mb-2">Used for the wellness correlation chart.</p>
              <div className="flex flex-wrap gap-1.5">
                {BODY_PART_OPTIONS.filter((o) => !["push", "pull", "legs", "other"].includes(o.value)).map((o) => {
                  const active = bodyParts.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => togglePart(o.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active
                          ? "bg-blue-400 text-background border-blue-400 font-medium"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {bodyPartLabel(o.value)}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button onClick={save} disabled={!name.trim() || isPending} className="w-full h-12">
              {isPending ? "Saving..." : editing ? "Save Changes" : "Add Injury"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
