# Supplied classroom character

The pose explorer uses `public/micro15-assets/student-articulated.glb`, derived from the user's `textured_mesh.glb`. The detailed head, face, hair, body and limb surfaces retain the source's UV mapping, base color and PBR textures. The model is normalized to 1.8 m, centered, and faces +Z in the browser.

The source is an unrigged generated mesh. Automatic heat weights incorrectly mixed forearms, torso and thighs: a raised hand pulled torso vertices into stretched sheets. This version partitions the source surface along its limb boundaries, closes the cuts, and adds overlapping round joint covers plus an internal shirt/pelvis closure. Each surface follows one bone at full weight, so each body segment keeps its original shape. Sleeve and closure colors match the source fabric. Small articulation seams are visible; there is no cloth simulation.

The 14-bone hierarchy matches `pose-rig.js` and `pose-presets.js`. The shared driver builds an orthonormal torso frame and applies rotation and translation, never pose-dependent scale. `pose-character.js` loads and disposes the asset and delegates pose updates to that driver.

The seven presets use analytic two-bone IK with lengths derived from this character's rest pose. The camera fits presets to the stage's aspect ratio. Controls remain anonymous numbered points, with pointer and keyboard support.

Rebuild with Blender 5:

```powershell
blender --background --python scripts/character/rig-student.py -- --input C:/path/textured_mesh.glb --asset-dir public/micro15-assets --studio-dir C:/path/character-studio
```

The script writes `student-articulated.glb` and a packed editable `student-articulated.blend`. Use the original file as input, not an already bound export. Validate with:

```text
node tests/reference-character.test.mjs
node tests/pose-presets.test.mjs
node tests/pose-deformation.test.mjs
```

The deformation regression loads the actual shipped binary mesh and the same rig driver used by the browser. It verifies every triangle edge preserves its length across all seven presets, intermediate poses during large changes, and a manual torso lean/wrist drag. It would catch the previous stretched-sheet behavior that checking only bone lengths missed. Also inspect the presets and front/side/rear views in the browser for joint coverage and appearance.
