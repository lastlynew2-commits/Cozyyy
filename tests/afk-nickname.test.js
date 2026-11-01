import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAfkConfirmation,
  createAfkNoticeContainer,
  createWelcomeBackContainer,
  formatAfkNickname,
  stripAfkPrefix
} from '../src/commands/afk.js';

test('AFK nicknames are prefixed once', () => {
  assert.equal(formatAfkNickname('Alice'), '[AFK] Alice');
  assert.equal(formatAfkNickname('[AFK] Alice'), '[AFK] Alice');
  assert.equal(stripAfkPrefix('[AFK] Alice'), 'Alice');
});

test('AFK responses use Components V2 containers', () => {
  const user = { username: 'Alice', globalName: 'Alice A.' };
  const status = { reason: 'At lunch', since: 0 };
  const containers = [
    createAfkConfirmation(user, status),
    createAfkNoticeContainer([{ user, status }]),
    createWelcomeBackContainer('5 minutes')
  ];

  for (const container of containers) {
    const data = container.toJSON();
    assert.equal(data.type, 17);
    assert.equal(data.components[0].type, 10);
  }

  assert.match(containers[0].toJSON().components[0].content, /At lunch/);
  assert.match(containers[1].toJSON().components[0].content, /has been AFK/);
  assert.match(containers[2].toJSON().components[0].content, /Welcome back/);
});
