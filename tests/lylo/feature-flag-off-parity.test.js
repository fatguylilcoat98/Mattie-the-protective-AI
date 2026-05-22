'use strict';
/*
 * Baseline CI scaffold -- feature-flag-off parity.
 *
 * Path pinned by docs/lylo/empty-companion-shell.md §8.
 *
 * Contract to implement at Shell-4: with LYLO_SHELL_MODE unset or
 * false, the application must behave byte-identically to pre-shell
 * master -- new routes 404, chat uses MATTIE_SOUL, no shell tables
 * read or written.
 *
 * SCAFFOLD ONLY. Every test is skipped. The bodies throw so that
 * un-skipping a test without a real implementation fails loudly
 * (no fake passing logic).
 */

const { test } = require('node:test');

const PENDING = 'scaffold -- implement at Shell-4 (feature flag + companion-profile loader)';

test('new shell routes return 404 when LYLO_SHELL_MODE is off', { skip: PENDING }, () => {
  // TODO(Shell-4): boot the app with LYLO_SHELL_MODE unset; assert each
  // shell route responds 404.
  throw new Error('not implemented');
});

test('chat uses MATTIE_SOUL when LYLO_SHELL_MODE is off', { skip: PENDING }, () => {
  // TODO(Shell-4): assert the chat path loads MATTIE_SOUL and not a
  // DB-backed companion profile.
  throw new Error('not implemented');
});

test('no shell tables are read or written when LYLO_SHELL_MODE is off', { skip: PENDING }, () => {
  // TODO(Shell-4): assert zero queries against shell-era tables.
  throw new Error('not implemented');
});
