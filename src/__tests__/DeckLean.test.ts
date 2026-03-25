import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { DeckLean, MAX_LEAN_ANGLE } from '../adapters/DeckLean.js';

describe('DeckLean', () => {
  let deck: DeckLean;

  beforeEach(() => {
    deck = new DeckLean();
  });

  it('exposes a THREE.Group', () => {
    expect(deck.group).toBeInstanceOf(THREE.Group);
  });

  it('group starts with zero rotation', () => {
    expect(deck.group.rotation.z).toBe(0);
    expect(deck.group.rotation.x).toBe(0);
  });

  it('lean(0, 0, dt) keeps rotation at zero', () => {
    deck.lean(0, 0, 0.016);
    expect(deck.group.rotation.z).toBe(0);
    expect(deck.group.rotation.x).toBe(0);
  });

  it('positive roll moves rotation.z toward positive', () => {
    deck.lean(0.5, 0, 0.016);
    expect(deck.group.rotation.z).toBeGreaterThan(0);
  });

  it('positive pitch moves rotation.x toward positive', () => {
    deck.lean(0, 0.3, 0.016);
    expect(deck.group.rotation.x).toBeGreaterThan(0);
  });

  it('converges rotation.z to roll target over many frames', () => {
    const target = 0.20; // within MAX_LEAN_ANGLE (0.23)
    let t = 0.016;
    for (let i = 0; i < 200; i++) {
      deck.lean(target, 0, t);
    }
    expect(deck.group.rotation.z).toBeCloseTo(target, 1);
  });

  it('converges rotation.x to pitch target over many frames', () => {
    const target = 0.3;
    for (let i = 0; i < 200; i++) {
      deck.lean(0, target, 0.016);
    }
    expect(deck.group.rotation.x).toBeCloseTo(target, 1);
  });

  it('returns to zero when target is zero after being non-zero', () => {
    for (let i = 0; i < 50; i++)  deck.lean(0.5, 0, 0.016);
    for (let i = 0; i < 200; i++) deck.lean(0, 0, 0.016);
    expect(deck.group.rotation.z).toBeCloseTo(0, 1);
  });

  it('clamps extreme positive roll to MAX_LEAN_ANGLE', () => {
    for (let i = 0; i < 200; i++) deck.lean(10, 0, 0.016); // far beyond limit
    expect(deck.group.rotation.z).toBeCloseTo(MAX_LEAN_ANGLE, 2);
  });

  it('clamps extreme negative roll to -MAX_LEAN_ANGLE', () => {
    for (let i = 0; i < 200; i++) deck.lean(-10, 0, 0.016);
    expect(deck.group.rotation.z).toBeCloseTo(-MAX_LEAN_ANGLE, 2);
  });

  it('pitch is not clamped (no wheel bite risk on nose/tail axis)', () => {
    for (let i = 0; i < 200; i++) deck.lean(0, 1.0, 0.016);
    expect(deck.group.rotation.x).toBeCloseTo(1.0, 1);
  });
});
