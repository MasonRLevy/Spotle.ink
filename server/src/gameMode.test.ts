import assert from 'node:assert/strict';
import test from 'node:test';

import type { Player } from '../../shared/game.js';
import { assignTargets } from './gameEngine.js';
import { pickThemeTarget } from './data/itemRegistry.js';

test('assignTargets gives each player a distinct opponent', () => {
  const players: Player[] = [
    { id: 'p1', peerId: 'a', name: 'A', score: 0, status: 'READY', isHost: true },
    { id: 'p2', peerId: 'b', name: 'B', score: 0, status: 'READY', isHost: false },
    { id: 'p3', peerId: 'c', name: 'C', score: 0, status: 'READY', isHost: false },
  ];

  const targets = assignTargets(players);

  const assignedTargets = [...targets.values()].map((player) => player.id);
  assert.equal(targets.size, players.length);
  assert.deepEqual([...assignedTargets].sort(), players.map((player) => player.id).sort());
  for (const player of players) {
    assert.notEqual(targets.get(player.id)?.id, player.id);
  }
});

test('pickThemeTarget filters by theme and avoids repeats', () => {
  const item = pickThemeTarget('UF_SWAMP', ['uf-century-tower']);
  assert.equal(item.themes.includes('UF_SWAMP'), true);
  assert.notEqual(item.id, 'uf-century-tower');
});
