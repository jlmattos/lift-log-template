import { listExercises } from "@/actions/exercises";
import { listEquipment } from "@/actions/equipment";
import { ExercisesList } from "@/components/exercises-list";
import { EquipmentManager } from "@/components/equipment-manager";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const [exercises, equipment] = await Promise.all([
    listExercises(),
    listEquipment(),
  ]);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Exercises</h1>
      <p className="text-muted-foreground text-sm mt-1">
        {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} created
      </p>

      <EquipmentManager equipment={equipment} />

      <ExercisesList exercises={exercises} />
    </div>
  );
}
