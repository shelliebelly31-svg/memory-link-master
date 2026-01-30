/**
 * Quiz utilities for shuffling options with deterministic seeding
 */

export interface ShuffledOption {
  id: string;
  text: string;
  originalIndex: number;
}

export interface ShuffledQuestion {
  questionId: string;
  options: ShuffledOption[];
  correctOptionId: string;
}

/**
 * Seeded random number generator for deterministic shuffling
 * Uses a simple LCG (Linear Congruential Generator)
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with a seed for deterministic results
 */
export function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const random = seededRandom(seed);
  
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}

/**
 * Shuffle quiz options and return them with IDs for correctness checking
 */
export function shuffleQuizOptions(
  options: string[],
  correctAnswerIndex: number,
  shuffleSeed: number
): { shuffledOptions: ShuffledOption[]; correctOptionId: string } {
  // Create options with IDs
  const optionsWithIds: ShuffledOption[] = options.map((text, index) => ({
    id: `opt-${index}`,
    text,
    originalIndex: index,
  }));
  
  // Shuffle using the seed
  const shuffledOptions = shuffleWithSeed(optionsWithIds, shuffleSeed);
  
  // Find the correct option ID
  const correctOptionId = `opt-${correctAnswerIndex}`;
  
  return { shuffledOptions, correctOptionId };
}

/**
 * Debug utility to track position distribution (only in development)
 */
const positionCounts = [0, 0, 0, 0];
let totalTracked = 0;

export function trackCorrectAnswerPosition(position: number): void {
  if (import.meta.env.DEV && position >= 0 && position < 4) {
    positionCounts[position]++;
    totalTracked++;
    
    // Log every 10 questions in dev
    if (totalTracked % 10 === 0) {
      console.log('[Quiz Position Distribution]', {
        total: totalTracked,
        positions: positionCounts.map((count, i) => ({
          position: i + 1,
          count,
          percentage: Math.round((count / totalTracked) * 100) + '%',
        })),
      });
    }
  }
}

export function getPositionStats(): { total: number; positions: number[] } {
  return { total: totalTracked, positions: [...positionCounts] };
}

export function resetPositionStats(): void {
  positionCounts.fill(0);
  totalTracked = 0;
}
