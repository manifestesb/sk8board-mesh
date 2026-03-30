export { Skateboard } from './adapters/Skateboard.js';
export type { Loadable, Tickable, Disposable, Debuggable, DebugGroups } from './adapters/Skateboard.js';

export { PivotDebug } from './debug/PivotDebug.js';

export { SkateboardAsset } from './adapters/SkateboardAsset.js';
export { SkatieAsset }     from './adapters/SkatieAsset.js';
export type { Mountable, BoardRig, TruckAnimatable } from './adapters/Mountable.js';

export { PhysicsRig } from './adapters/PhysicsRig.js';
export type { Simulatable, RigState } from './adapters/PhysicsRig.js';

export { Sk8Packet, Sk8Session } from './core/Sk8Packet.js';

export { ComplementaryFilter } from './core/filters/ComplementaryFilter.js';
export type { Fusable } from './core/filters/ComplementaryFilter.js';

export { JumpDetector } from './core/filters/JumpDetector.js';
export type { Detectable, JumpResult } from './core/filters/JumpDetector.js';

export { GroundContact } from './core/GroundContact.js';
export type { Constrainable } from './core/GroundContact.js';

export type {
  Vector3,
  RawSensorData,
  SkateboardTick,
  SensorConfig,
  SkateboardOptions,
} from './core/types.js';

// Asset URLs — resolved by Vite at build time, available to consumers
export { default as warehouseHdrUrl  } from './assets/hdr/warehouse-256.hdr?url';
