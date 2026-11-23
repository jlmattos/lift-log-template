// Muscle group options (used in exercise create/edit and filtering)
export const BODY_PART_OPTIONS = [
  // Push
  { value: "chest", label: "Chest", category: "push" },
  { value: "shoulders", label: "Shoulders", category: "push" },
  { value: "triceps", label: "Triceps", category: "push" },
  // Pull
  { value: "back", label: "Back", category: "pull" },
  { value: "biceps", label: "Biceps", category: "pull" },
  { value: "forearms", label: "Forearms", category: "pull" },
  // Legs
  { value: "quads", label: "Quads", category: "legs" },
  { value: "hamstrings", label: "Hamstrings", category: "legs" },
  { value: "glutes", label: "Glutes", category: "legs" },
  { value: "calves", label: "Calves", category: "legs" },
  // Core / other
  { value: "core", label: "Core", category: "core" },
  { value: "full_body", label: "Full body", category: "other" },
  // Legacy values (kept for backwards compat with existing data)
  { value: "push", label: "Push (generic)", category: "push" },
  { value: "pull", label: "Pull (generic)", category: "pull" },
  { value: "legs", label: "Legs (generic)", category: "legs" },
  { value: "other", label: "Other", category: "other" },
] as const;

export type BodyPartCategory = "push" | "pull" | "legs" | "core" | "other";

// Lookup: muscle group → broad category (for the volume chart)
export const BODY_PART_CATEGORY: Record<string, BodyPartCategory> = Object.fromEntries(
  BODY_PART_OPTIONS.map((o) => [o.value, o.category as BodyPartCategory])
);

export function bodyPartLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const found = BODY_PART_OPTIONS.find((o) => o.value === value);
  return found?.label ?? value;
}

export function bodyPartCategory(value: string | null | undefined): BodyPartCategory {
  if (!value) return "other";
  return BODY_PART_CATEGORY[value] ?? "other";
}

// Grouped options for nicer UI
export const BODY_PART_GROUPS = [
  {
    label: "Upper Push",
    options: ["chest", "shoulders", "triceps"],
  },
  {
    label: "Upper Pull",
    options: ["back", "biceps", "forearms"],
  },
  {
    label: "Lower Body",
    options: ["quads", "hamstrings", "glutes", "calves"],
  },
  {
    label: "Other",
    options: ["core", "full_body", "other"],
  },
];
