import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pkg from '../package.json' with { type: 'json' };

describe('Native Compat', () => {
  it('should import json with attributes safely', () => {
    assert.ok(pkg.name === '@j0hanz/memdb');
  });

  it('should allow strip-types execution for bare TS files', () => {
    // This test is intended to be run with: node --experimental-strip-types
    const value: number = 100;
    assert.equal(value, 100);
  });
});
