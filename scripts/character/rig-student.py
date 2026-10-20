"""Bind the user's finished textured mesh without rebuilding its geometry."""
import bpy, json, argparse, sys
from pathlib import Path
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True)
parser.add_argument('--asset-dir',required=True)
parser.add_argument('--studio-dir',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
SOURCE=Path(args.input).resolve()
ROOT=Path(args.studio_dir).resolve();ROOT.mkdir(parents=True,exist_ok=True)
PUBLIC=Path(args.asset_dir).resolve();PUBLIC.mkdir(parents=True,exist_ok=True)
P=[Vector((x,-z,y)) for x,y,z in [
 (-.178,1.40,0),(.178,1.40,0),(-.264,1.10,0),(.264,1.10,0),
 (-.313,.855,0),(.313,.855,0),(-.095,.84,0),(.095,.84,0),
 (-.117,.46,0),(.117,.46,0),(-.133,.105,0),(.133,.105,0)]]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
allco=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
bottom=min(v.z for v in allco);top=max(v.z for v in allco);scale=1.8/(top-bottom)
cx=(min(v.x for v in allco)+max(v.x for v in allco))*.5
for o in meshes:
 for v in o.data.vertices:
  co=o.matrix_world@v.co;v.co=Vector(((co.x-cx)*scale,co.y*scale,(co.z-bottom)*scale))
 o.parent=None;o.matrix_world.identity();o.name='SuppliedStudent'
 for p in o.data.polygons:p.use_smooth=True
 o.data.update()
arm=bpy.data.armatures.new('StudentControlRig');rig=bpy.data.objects.new('StudentControlRig',arm);bpy.context.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
bones={}
def bone(name,head,tail,parent=None):
 b=arm.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=bones[parent]
 bones[name]=b
mid=(P[6]+P[7])*.5
bone('root',mid,mid+Vector((0,0,-.15)))
bone('body',mid,(P[0]+P[1])*.5,'root')
for ci,(a,b,c) in enumerate([(0,2,4),(1,3,5),(6,8,10),(7,9,11)]):
 bone(f'limb{ci}_upper',P[a],P[b],'body' if ci<2 else 'root')
 bone(f'limb{ci}_lower',P[b],P[c],f'limb{ci}_upper')
 end=P[c]+((P[c]-P[b]).normalized()*.14 if ci<2 else Vector((0,-.14,-.055)))
 bone(f'limb{ci}_end',P[c],end,f'limb{ci}_lower')
bpy.ops.object.mode_set(mode='OBJECT')
# Solve heat weights on a watertight voxel proxy, then transfer only weights.
# This repairs the binding surface without changing the user's mesh or UVs.
proxy=meshes[0].copy();proxy.data=meshes[0].data.copy();proxy.name='BindingProxy';bpy.context.collection.objects.link(proxy)
bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
remesh=proxy.modifiers.new('WatertightBindingSurface','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.009;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
if any(not v.groups for v in proxy.data.vertices):raise RuntimeError('Proxy heat binding failed')
for o in meshes:
 for name in bones:o.vertex_groups.new(name=name)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 transfer=o.modifiers.new('TransferHeatWeights','DATA_TRANSFER');transfer.object=proxy;transfer.use_vert_data=True;transfer.data_types_verts={'VGROUP_WEIGHTS'};transfer.vert_mapping='POLYINTERP_NEAREST'
 transfer.layers_vgroup_select_src='ALL';transfer.layers_vgroup_select_dst='NAME'
 bpy.ops.object.modifier_apply(modifier=transfer.name)
 o.parent=rig
 mod=o.modifiers.new('StudentRig','ARMATURE');mod.object=rig
bpy.data.objects.remove(proxy,do_unlink=True)
for o in meshes:
 missing=[v.index for v in o.data.vertices if not v.groups]
 print('WEIGHT_CHECK',o.name,'vertices',len(o.data.vertices),'unweighted',len(missing))
 if missing:raise RuntimeError('Automatic weights left unbound vertices')
 for m in o.modifiers:
  if m.type=='ARMATURE':m.use_deform_preserve_volume=True
rig.show_in_front=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.render.resolution_x=594;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.view_settings.view_transform='Standard';scene.world.color=(.65,.65,.65)
def area(pos,power,size):
 bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=power;l.data.size=size
 l.rotation_euler=(Vector((0,0,.9))-l.location).to_track_quat('-Z','Y').to_euler()
area((-3,-4,5),450,5);area((3,-2,2),180,4);area((0,3,4),250,4)
bpy.ops.object.camera_add(location=(0,-5,.94));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=2.02
cam.rotation_euler=Vector((0,1,0)).to_track_quat('-Z','Y').to_euler();scene.camera=cam
scene.render.filepath=str(PUBLIC/'supplied-student-preview.png');bpy.ops.render.render(write_still=True)
for image in bpy.data.images:
 if image.has_data and image.source=='FILE' and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'supplied-student-rigged.blend'))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'supplied-student-rigged.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_def_bones=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_image_format='AUTO',export_cameras=False,export_lights=False)
info={'source':'User supplied textured_mesh.glb','height':1.8,'vertexCount':sum(len(o.data.vertices) for o in meshes),'bones':list(bones),'restPose':[[v.x,v.z,-v.y] for v in P],'binding':'Blender automatic heat weights via watertight proxy','originalGeometryPreserved':True}
(ROOT/'asset-info.json').write_text(json.dumps(info,indent=2),encoding='utf-8')
print('ASSET_READY',json.dumps(info))
