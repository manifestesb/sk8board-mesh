# @manifeste/sk8board

A headless TypeScript library that drives 3D skateboard models from IMU
telemetry. This project serves as an example of loading and interacting
with 3D models on the web using Three.js.

## Live Demo

https://manifestsb-sk8board-mesh.netlify.app/

## How It Works

The library combines skateboard movements across three axes (X, Y and Z)
to drive a Three.js model — orientation, wheel spin, truck steering and
jump animation.

## Getting Started

```bash
npm install
npm run build
```

### Running the Example

```bash
cd example
npm install
npm run dev
```

## License

See individual asset directories for model-specific licenses.

```
 modelGroup
   └─ rearPitchPivot
   |   └─ rearPitchInverse
   |       └─ tailContactPivot          ← NEW
   |           └─ tailContactInverse     ← NEW
   |               └─ frontPitchPivot
   |                   └─ frontPitchInverse
   |                       └─ noseContactPivot      ← NEW
   |                           └─ noseContactInverse ← NEW
   |                               └─ flipGroup
   |                                   └─ flipInverse → [rig]
   └─ rearPitchPivot
       └─ rearPitchInverse
           └─ tailContactPivot          ← NEW
               └─ tailContactInverse     ← NEW
                   └─ frontPitchPivot
                       └─ frontPitchInverse
                           └─ noseContactPivot      ← NEW
                               └─ noseContactInverse ← NEW
                                   └─ flipGroup
                                       └─ flipInverse → [rig]
```
