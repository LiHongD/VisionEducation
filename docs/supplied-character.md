# Supplied classroom character

The pose explorer uses `public/micro15-assets/supplied-student-rigged.glb`, derived from the user's `textured_mesh.glb`. It retains the source mesh's vertex positions, UV mapping, base color and PBR textures. It is normalized to 1.8 m, centered, and faces +Z in the browser.

The source has no skin or animation. Blender adds a 14-bone rig matching `pose-character.js` and `pose-presets.js`. Heat weights are transferred from a watertight binding proxy; the original mesh is rendered without deleting faces or rebuilding geometry. No generated portrait or replacement geometry is used. This is an automatic teaching rig: large shoulder rotations can stretch the clothing around the underarm; it is not a manually retopologized production animation character.

The seven presets use analytic two-bone IK with lengths derived from this character's rest pose. The camera fits presets to the stage's aspect ratio. Controls remain anonymous numbered points, with pointer and keyboard support.

Rebuild with Blender 5:

```powershell
blender --background --python scripts/character/rig-student.py -- --input C:/path/textured_mesh.glb --asset-dir public/micro15-assets --studio-dir C:/path/character-studio
```

The script writes the bound GLB, preview PNG, packed editable `.blend` and an asset report. Use the original file as input, not an already bound export. Validate with `node tests/reference-character.test.mjs` and `node tests/pose-presets.test.mjs`, then inspect all presets in the browser.
