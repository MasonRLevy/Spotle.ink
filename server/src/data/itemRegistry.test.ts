import assert from 'node:assert/strict';
import test from 'node:test';

import {
  itemsForTheme,
  MASTER_ITEM_DATABASE,
  pickRoundTarget,
  prepareUsedObjectsForNextRound,
  unusedCount,
} from './itemRegistry.js';
import { createRoom, resetForNewGame } from '../rooms.js';

test('active target registry combines the expanded pool with unique IDs and theme tags', () => {
  assert.ok(MASTER_ITEM_DATABASE.length > 140);
  assert.equal(
    new Set(MASTER_ITEM_DATABASE.map((item) => item.id)).size,
    MASTER_ITEM_DATABASE.length,
  );
  assert.ok(MASTER_ITEM_DATABASE.every((item) => item.themes.length > 0));

  for (const theme of ['GENERAL', 'UF_SWAMP', 'HACKATHON', 'OUTDOORS'] as const) {
    const themeItems = itemsForTheme(theme);
    assert.ok(themeItems.length > 0, `${theme} has target items`);
    assert.ok(themeItems.every((item) => item.themes.includes(theme)));
  }
});

test('round selection exhausts each pool before cycling and avoids immediate repeats', () => {
  let usedIds: string[] = [];
  let previousId: string | undefined;

  for (let cycle = 0; cycle < 2; cycle += 1) {
    usedIds = prepareUsedObjectsForNextRound(null, usedIds);
    const cycleIds = new Set(usedIds);
    const picksInCycle = MASTER_ITEM_DATABASE.length - cycleIds.size;

    for (let index = 0; index < picksInCycle; index += 1) {
      const selected = pickRoundTarget(usedIds);
      assert.ok(!usedIds.includes(selected.id), `did not pick used item ${selected.id}`);
      assert.notEqual(selected.id, previousId, 'does not repeat on the cycle boundary');
      cycleIds.add(selected.id);
      usedIds.push(selected.id);
      previousId = selected.id;
    }

    assert.equal(cycleIds.size, MASTER_ITEM_DATABASE.length);
    assert.equal(unusedCount(null, usedIds), 0);
  }
});

test('themed selection stays within its theme until that theme is exhausted', () => {
  for (const theme of ['GENERAL', 'UF_SWAMP', 'HACKATHON', 'OUTDOORS'] as const) {
    const themeItems = itemsForTheme(theme);
    let usedIds: string[] = [];
    const selectedIds = new Set<string>();

    for (let index = 0; index < themeItems.length; index += 1) {
      const selected = pickRoundTarget(usedIds, theme);
      assert.ok(selected.themes.includes(theme));
      assert.ok(!usedIds.includes(selected.id));
      selectedIds.add(selected.id);
      usedIds.push(selected.id);
    }

    assert.equal(selectedIds.size, themeItems.length);
    assert.equal(unusedCount(theme, usedIds), 0);
    const previousTarget = usedIds.at(-1);
    const nextCycleUsedIds = prepareUsedObjectsForNextRound(theme, usedIds);
    const nextTarget = pickRoundTarget(nextCycleUsedIds, theme);
    assert.notEqual(nextTarget.id, previousTarget);
    assert.ok(nextTarget.themes.includes(theme));
  }
});

test('starting a new match clears the room item history', () => {
  const room = createRoom('host-id', 'Host');
  room.usedObjects = MASTER_ITEM_DATABASE.slice(0, 10).map((item) => item.id);

  resetForNewGame(room);

  assert.deepEqual(room.usedObjects, []);
});
