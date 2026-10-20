"""Articulate the supplied textured surface without blending distant body parts."""
import bpy,bmesh,json,math,argparse,sys
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
P=[Vector((x,-z,y)) for x,y,z in [(-.178,1.4,0),(.178,1.4,0),(-.264,1.1,0),(.264,1.1,0),(-.313,.855,0),(.313,.855,0),(-.095,.84,0),(.095,.84,0),(-.117,.46,0),(.117,.46,0),(-.133,.105,0),(.133,.105,0)]]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
source=next(o for o in bpy.context.scene.objects if o.type=='MESH')
co=[source.matrix_world@v.co for v in source.data.vertices];bottom=min(v.z for v in co);scale=1.8/(max(v.z for v in co)-bottom);cx=(max(v.x for v in co)+min(v.x for v in co))*.5
for v in source.data.vertices:
 c=source.matrix_world@v.co;v.co=((c.x-cx)*scale,c.y*scale,(c.z-bottom)*scale)
source.parent=None;source.matrix_world.identity()
original=source.data.materials[0]
def solid(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.85;return m
# Colors are linear and match the source's fabric and skin under studio lighting.
shirt=solid('ShirtJoint',(.015,.030,.014));skin=solid('SkinJoint',(.565,.262,.127));pants=solid('TrouserJoint',(.474,.376,.301));shoe=solid('ShoeJoint',(.78,.78,.74))
materials=[original,shirt,skin,pants,shoe]
parts=[]
def plane(point,normal):return (Vector(point),Vector(normal).normalized())
def cutpart(name,bone,planes,kind):
 bm=bmesh.new();bm.from_mesh(source.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
 for point,normal in planes:
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=point,plane_no=normal)
  gone=[v for v in bm.verts if (v.co-point).dot(normal)<-1e-6]
  bmesh.ops.delete(bm,geom=gone,context='VERTS')
 boundary=[e for e in bm.edges if e.is_boundary and any(all(abs((v.co-point).dot(normal))<.00003 for v in e.verts) for point,normal in planes)]
 caps=bmesh.ops.holes_fill(bm,edges=boundary,sides=0).get('faces',[])
 for f in caps:
  h=f.calc_center_median().z
  f.material_index=1 if kind=='body' and h>.87 or kind=='arm' and h>1.22 else 2 if kind=='arm' else 4 if kind=='foot' else 3
 if kind=='body':
  for f in bm.faces:
   c=f.calc_center_median()
   if .90<c.z<1.25 and abs(c.x)>.17:f.material_index=1
 if kind=='arm':
  for f in bm.faces:
   if f.calc_center_median().z>1.235:f.material_index=1
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 mesh=bpy.data.meshes.new(name);bm.to_mesh(mesh);bm.free()
 for m in materials:mesh.materials.append(m)
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
 for f in mesh.polygons:f.use_smooth=True
 parts.append((obj,bone));print('PART',name,len(mesh.vertices),len(mesh.polygons));return obj

cutpart('Student_HeadAndBody','body',[plane((-.195,0,0),(1,0,0)),plane((.195,0,0),(-1,0,0)),plane((0,0,.84),(0,0,1))],'body')
cutpart('Student_Pelvis','root',[plane((0,0,.84),(0,0,-1)),plane((0,0,.70),(1.474,0,1)),plane((0,0,.70),(-1.474,0,1))],'leg')
for ci,(a,b,c) in enumerate([(0,2,4),(1,3,5),(6,8,10),(7,9,11)]):
 arm=ci<2;sign=-1 if ci in (0,2) else 1
 if arm:
  # Preserve the outside surface and close the hidden arm/torso contact.
  # x_boundary = .133 + .20 * (1.40 - height).
  side=plane((sign*.413,0,0),(sign,0,.20))
  shared=[side,plane((0,0,1.465),(0,0,-1))]
 else:shared=[plane((0,0,0),(sign,0,0)),plane((sign*.22,0,0),(-sign,0,0)),plane((0,0,.84),(0,0,-1))]
 upperdir=(P[b]-P[a]).normalized();lowerdir=(P[c]-P[b]).normalized()
 # Cuts perpendicular to the limb make overlapping round joints unobtrusive.
 cutpart(f'Student_Limb{ci}_Upper',f'limb{ci}_upper',shared+[plane(P[b]+upperdir*.008,-upperdir)],'arm' if arm else 'leg')
 cutpart(f'Student_Limb{ci}_Lower',f'limb{ci}_lower',shared+[plane(P[b]-upperdir*.008,upperdir),plane(P[c]+lowerdir*.008,-lowerdir)],'arm' if arm else 'leg')
 cutpart(f'Student_Limb{ci}_End',f'limb{ci}_end',shared+[plane(P[c]-lowerdir*.008,lowerdir)],'arm' if arm else 'foot')

def joint(name,bone,center,radii,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,radius=1,location=center)
 o=bpy.context.object;o.name=name
 for v in o.data.vertices:v.co=Vector((v.co.x*radii[0],v.co.y*radii[1],v.co.z*radii[2]))+center
 o.location=(0,0,0);o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 parts.append((o,bone))
def shirt_lining():
 rings=[(.875,.194,.100),(1.0,.197,.100),(1.15,.197,.105),(1.30,.196,.100),(1.39,.18,.090),(1.43,.14,.075)]
 verts=[(rx*math.cos(i*2*math.pi/32),ry*math.sin(i*2*math.pi/32),h) for h,rx,ry in rings for i in range(32)]
 faces=[(j*32+i,j*32+(i+1)%32,(j+1)*32+(i+1)%32,(j+1)*32+i) for j in range(len(rings)-1) for i in range(32)]
 faces.extend([tuple(reversed(range(32))),tuple(range((len(rings)-1)*32,len(rings)*32))])
 mesh=bpy.data.meshes.new('ShirtLining');mesh.from_pydata(verts,[],faces);mesh.materials.append(shirt)
 o=bpy.data.objects.new('Student_ShirtLining',mesh);bpy.context.collection.objects.link(o)
 for f in mesh.polygons:f.use_smooth=True
 parts.append((o,'body'))
shirt_lining()
joint('Student_PelvisLining','root',Vector((0,0,.82)),(.13,.060,.115),pants)
for ci,(a,b,c) in enumerate([(0,2,4),(1,3,5),(6,8,10),(7,9,11)]):
 arm=ci<2
 joint(f'Joint_{ci}_Root',f'limb{ci}_upper',P[a],(.065,.075,.068) if arm else (.091,.091,.10),shirt if arm else pants)
 joint(f'Joint_{ci}_Middle',f'limb{ci}_lower',P[b],(.050,.055,.052) if arm else (.064,.060,.070),skin if arm else pants)
 joint(f'Joint_{ci}_End',f'limb{ci}_end',P[c],(.031,.033,.035) if arm else (.040,.048,.040),skin if arm else pants)

armature=bpy.data.armatures.new('StudentControlRig');rig=bpy.data.objects.new('StudentControlRig',armature);bpy.context.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');bones={}
def bone(name,head,tail,parent=None):
 b=armature.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=bones[parent]
 bones[name]=b
center=(P[6]+P[7])*.5;bone('root',center,center+Vector((0,0,-.15)));bone('body',center,(P[0]+P[1])*.5,'root')
for ci,(a,b,c) in enumerate([(0,2,4),(1,3,5),(6,8,10),(7,9,11)]):
 bone(f'limb{ci}_upper',P[a],P[b],'body' if ci<2 else 'root');bone(f'limb{ci}_lower',P[b],P[c],f'limb{ci}_upper');bone(f'limb{ci}_end',P[c],P[c]+((P[c]-P[b]).normalized()*.14 if ci<2 else Vector((0,-.14,-.055))),f'limb{ci}_lower')
bpy.ops.object.mode_set(mode='OBJECT')
for obj,name in parts:
 g=obj.vertex_groups.new(name=name);g.add(list(range(len(obj.data.vertices))),1,'REPLACE');obj.parent=rig;mod=obj.modifiers.new('PoseRig','ARMATURE');mod.object=rig
bpy.data.objects.remove(source,do_unlink=True)
for image in bpy.data.images:
 if image.has_data and image.source=='FILE' and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'student-articulated.blend'))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o,_ in parts:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'student-articulated.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_def_bones=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_image_format='AUTO',export_cameras=False,export_lights=False)
print('ARTICULATED_READY',len(parts),'parts')
