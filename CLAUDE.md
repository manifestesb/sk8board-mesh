# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Commands

```bash
# Library
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode
npm test               # Run tests once
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report

# Example app (run from example/)
cd example && npm run dev    # Dev server with live preview
cd example && npm run build  # Production build
```

Run a single test file:

```bash
npx vitest run src/__tests__/ComplementaryFilter.test.ts
```

## Workflow and Orchestration

### 1. Modular Design

Each module isolates a single responsibility within the 3D model — update or
test it without affecting the rest.

### 2. TDD (Test-Driven Development) Cycle

* **Write the test before implementation**: create a unit test that represents
  the usage of the feature or component.
* **Implement the minimum necessary**: write just enough code to make the test
  pass.
* **Refactor safely**: improve the code design only when truly necessary and
  only with all tests passing.
* **Maintain contract coverage**: ensure that `interfaces` (Adjectives) have
  tests that validate their expected behavior regardless of the implementation.

### 3. Slices and Plans Orchestration

* **Adopt Plan Mode by default**: detail architectural steps before modifying
  any file for non-trivial tasks.
* **Stop and Replan**: immediately stop execution if the observed behavior
  diverges from the original plan.

### 4. Cohesion and Simplicity Verification

* **Strive for Functional Cohesion**: Ensure that each component has a single,
  clear responsibility focused on their responsibility.
* **Prioritize Simplicity**: Question if there is a more direct way to solve the
  problem without introducing accidental complexity or unnecessary layers.
* **Eliminate Workarounds**: Identify the root cause of failures instead of
  applying temporary fixes, maintaining the integrity of the event architecture.
* **Validate Quality**: Evaluate code by its readability and strict adherence to
  DDD and grammatical rules, going beyond test success.

## Design Principles and Language

### 1. Mandatory Grammatical Naming

* **Interfaces (Capabilities)**: use verb + "able" suffix to turn them into *
  *Adjectives** (e.g., `Rollable`, `Spinnable`, `Orientable`).
* **Classes (Agents)**: Name using **Nouns** to designate the concrete or
  abstract entity (e.g., `Wheel`, `Deck`, `Scene`).
* **Methods (Behaviors)**: Always use a **Verb** to declare the action
  performed; it may contain a noun. (e.g., `spin()`, `jump()`,
  `hasChanged()`, `canSync()`).

### 2. Domain Integrity (DDD)

* **Use Ubiquitous Language**: Use terms from skateboard ecosystem. Avoid
  suffixes that express design patterns, such as `Service`, `Manager`, or
  `Repository`.
* **Protect the Core**: Keep context folders (`src`) free from dependencies on
  external frameworks (next, react).
* **Isolate 3D Model and Textures**: 3D Model and Texturues integration must be
  isolated from the context by adapters.
* **Avoid Getters and Setters**: prefer expressive names — not
  `getCalibrateStatus()`, but `isCalibrated()` or `isReady()`.

## Architecture

This is a headless TypeScript library (`@manifeste/sk8board`) that drives a 3D
skateboard model from IMU telemetry.
There is no front-end framework — consumers integrate it into their own Three.js
scenes.

### Data Pipeline

```
RawSensorData (IMU: accel, gyro, dt)
    ↓
Sk8Processor  (stateful)
    ├─ ComplementaryFilter  →  fused orientation (roll, pitch, yaw)
    └─ JumpDetector         →  airborne flag + jump height estimate
    ↓
SkateboardTick  (normalized: roll, pitch, yaw, speed, airborne, jumpHeight)
    ↓
Skateboard.tick()
    ├─ applyOrientation  →  tiltGroup (roll/pitch)
    ├─ spinWheels        →  wheel rotation from speed
    └─ updateJump        →  GSAP tween on jumpGroup (Y axis)
    ↓
Three.js Scene
```

### Key Classes

- **`Sk8Processor`** (`src/Sk8Packet.ts`) — stateful processor for continuous
  sensor streams; owns filter lifecycle
- **`Sk8Packet`** (`src/Sk8Packet.ts`) — single-frame wrapper; low-level
  alternative to `Sk8Processor`
- **`Skateboard`** (`src/Skateboard.ts`) — Three.js model driver; group
  hierarchy:
  `root (yaw) → jumpGroup (Y) → tiltGroup (roll/pitch) → modelGroup (mesh)`
- **`ComplementaryFilter`** (`src/filters/`) — blends accel + gyro with
  configurable alpha (default 0.96) to eliminate
  gyro drift
- **`JumpDetector`** (`src/filters/`) — free-fall detection via acceleration
  magnitude threshold + debounce; estimates
  height from pop impulse

### Asset System

Assets (GLTF model, textures, HDR) live in `src/assets/` and are compiled into
the library distribution — no `public/`
path required by consumers. The vitest config stubs asset imports to URLs for
testing. The example app's
`vite.config.ts` aliases `@manifeste/sk8board` to the source directory and
serves parent assets during dev.

### GLTF Node Names

Named nodes used in `Skateboard.ts`: `GripTape`, `Wheel1`–`Wheel4`, `Deck`,
`Bolts`, `Baseplates`, `Truck1`–`Truck2`.
Renaming these in the model file will break the loader.

### Sensor Axis Convention

Defined in `src/types.ts`: IMU is mounted on the rear truck with a specific
orientation. Roll/pitch/yaw axes correspond
to skateboard motion — read the comments in `types.ts` before modifying sensor
fusion logic.
