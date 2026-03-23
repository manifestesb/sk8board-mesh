export { Skateboard } from './Skateboard.js';
export { Sk8Packet, Sk8Processor } from './Sk8Packet.js';
export { ComplementaryFilter } from './filters/ComplementaryFilter.js';
export { JumpDetector } from './filters/JumpDetector.js';
export type {
  Vector3,
  RawSensorData,
  SkateboardTick,
  SensorConfig,
  SkateboardOptions,
} from './types.js';

// Asset URLs — resolved by Vite at build time, available to consumers
export { default as warehouseHdrUrl } from './assets/hdr/warehouse-256.hdr?url';
