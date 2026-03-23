// Type declarations for Vite ?url asset imports used inside the library.
// Consumers using Vite (or any bundler with similar static asset support)
// will have these resolved automatically.

declare module '*.gltf?url'  { const url: string; export default url; }
declare module '*.bin?url'   { const url: string; export default url; }
declare module '*.webp?url'  { const url: string; export default url; }
declare module '*.png?url'   { const url: string; export default url; }
declare module '*.avif?url'  { const url: string; export default url; }
declare module '*.hdr?url'   { const url: string; export default url; }
