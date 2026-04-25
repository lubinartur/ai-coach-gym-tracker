import { db } from "@/db/database";

/**
 * Removes every row in the `workoutSessions` Dexie table only.
 * Does not touch exercises (including favorites), settings, or other stores.
 *
 * For a one-time local wipe of test data, you can temporarily add to Progress
 * (`HistoryView`):
 *
 *   useEffect(() => {
 *     void (async () => {
 *       await clearWorkoutHistory();
 *       // then refetch: listWorkoutSessions() + getGymProgressData()
 *     })();
 *   }, []);
 *
 * Remove that effect after you confirm the screen shows zeros. Prefer the
 * Settings → Danger zone → “Clear workout history” control for normal use.
 */
export async function clearWorkoutHistory(): Promise<void> {
  await db.workoutSessions.clear();
}
