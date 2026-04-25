import type { ExerciseLibraryItem } from "../exerciseLibraryTypes";
import { ABS_CORE_EXERCISES } from "./absAndCore";
import { BACK_EXERCISES } from "./back";
import { BICEPS_EXERCISES } from "./biceps";
import { CARDIO_EXERCISES, FULL_BODY_EXERCISES } from "./fullBodyAndCardio";
import { CHEST_EXERCISES } from "./chest";
import { LOWER_EXERCISES } from "./lowerBody";
import { SHOULDER_EXERCISES } from "./shoulders";
import { TRICEPS_EXERCISES } from "./triceps";

/** Unordered catalog; `exerciseLibrary` deduplicates and indexes. */
export const EXERCISE_LIBRARY_RAW: ExerciseLibraryItem[] = [
  ...CHEST_EXERCISES,
  ...BACK_EXERCISES,
  ...SHOULDER_EXERCISES,
  ...BICEPS_EXERCISES,
  ...TRICEPS_EXERCISES,
  ...LOWER_EXERCISES,
  ...ABS_CORE_EXERCISES,
  ...FULL_BODY_EXERCISES,
  ...CARDIO_EXERCISES,
];
