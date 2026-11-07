import * as THREE from 'three';

/** Static triangle BVH: split by centroid, query only nearby leaves. Unlike large
 * per-furniture boxes, it leaves holes, chair gaps and table undersides open.
 * Packed coordinates keep the prepared OBJ's collision data small in memory.
 */
export class SurfaceIndex {
  constructor(root) {
    const meshes=[];let count=0;
    root.updateMatrixWorld(true);
    root.traverse(o=>{if(o.isMesh){meshes.push(o);count+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
    this.points=new Float32Array(count*9);this.order=new Uint32Array(count);
    this.centers=new Float32Array(count*3);this.pool=[];
    const v=new THREE.Vector3();let cursor=0;
    for(const mesh of meshes) {
      const attribute=mesh.geometry.attributes.position,index=mesh.geometry.index;
      const length=index?.count??attribute.count;
      for(let i=0;i<length;i+=3) {
        this.order[cursor]=cursor;
        for(let j=0;j<3;j++){
          v.fromBufferAttribute(attribute,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
          v.toArray(this.points,cursor*9+j*3);
          for(let axis=0;axis<3;axis++)this.centers[cursor*3+axis]+=v.getComponent(axis)/3;
        }
        cursor++;
      }
    }
    this.root=this.build(0,count);
    this.centers=null; // construction-only data
  }

  build(start,end) {
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const cmin=[Infinity,Infinity,Infinity],cmax=[-Infinity,-Infinity,-Infinity];
    for(let i=start;i<end;i++){
      const id=this.order[i];
      for(let axis=0;axis<3;axis++){
        const c=this.centers[id*3+axis];cmin[axis]=Math.min(cmin[axis],c);cmax[axis]=Math.max(cmax[axis],c);
        for(let j=0;j<3;j++){const p=this.points[id*9+j*3+axis];min[axis]=Math.min(min[axis],p);max[axis]=Math.max(max[axis],p);}
      }
    }
    const node={min,max,start,end};
    if(end-start<=24)return node;
    const spans=cmax.map((n,i)=>n-cmin[i]);const axis=spans.indexOf(Math.max(...spans));
    const pivot=(cmin[axis]+cmax[axis])*.5;
    let split=start;
    for(let i=start;i<end;i++)if(this.centers[this.order[i]*3+axis]<pivot){const temp=this.order[split];this.order[split++]=this.order[i];this.order[i]=temp;}
    if(split===start||split===end)split=(start+end)>>1;
    node.left=this.build(start,split);node.right=this.build(split,end);return node;
  }

  getSphereTriangles(sphere,result) {
    let used=0;const center=sphere.center,r2=sphere.radius**2;
    const visit=node=>{
      let distance=0;
      for(let axis=0;axis<3;axis++){const p=center.getComponent(axis),d=Math.max(node.min[axis]-p,0,p-node.max[axis]);distance+=d*d;}
      if(distance>r2)return;
      if(node.left){visit(node.left);visit(node.right);return;}
      for(let i=node.start;i<node.end;i++){
        const triangle=this.pool[used]??(this.pool[used]=new THREE.Triangle());used++;
        const offset=this.order[i]*9;
        triangle.a.fromArray(this.points,offset);triangle.b.fromArray(this.points,offset+3);triangle.c.fromArray(this.points,offset+6);result.push(triangle);
      }
    };
    visit(this.root);
  }
}
