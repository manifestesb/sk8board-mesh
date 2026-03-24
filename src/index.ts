export { Skateboard } from './adapters/Skateboard.js';
export type { Loadable, Tickable, Disposable } from './adapters/Skateboard.js';

export { Sk8Packet, Sk8Session } from './core/Sk8Packet.js';

export { ComplementaryFilter } from './core/filters/ComplementaryFilter.js';
export type { Fusable } from './core/filters/ComplementaryFilter.js';

export { JumpDetector } from './core/filters/JumpDetector.js';
export type { Detectable, JumpResult } from './core/filters/JumpDetector.js';

export type {
  Vector3,
  RawSensorData,
  SkateboardTick,
  SensorConfig,
  SkateboardOptions,
} from './core/types.js';

// Asset URLs — resolved by Vite at build time, available to consumers
export { default as warehouseHdrUrl } from './assets/hdr/warehouse-256.hdr?url';
