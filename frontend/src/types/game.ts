/**
 * Re-export of the locked shared contract.
 *
 * The real definitions live in `shared/game.ts` at the repo root so the
 * server and the frontend compile against the exact same file. Import from
 * either '@shared/game' or './types/game' - they are the same types.
 */
export * from '@shared/game';
