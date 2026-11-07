import * as THREE from 'three';
import { forwardVector, segmentHitsBox } from './flight.js';
import { isSafePosition } from './world.js';
import { PLAYER_CORE_RADIUS } from './maps.js';
import { createJet } from './aircraft.js';

const bulletGeometry = new THREE.CylinderGeometry(.018, .018, .8, 5);
bulletGeometry.rotateX(Math.PI / 2);
const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xe5ff91 });
const enemyBulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff8463 });
const sparkGeometry = new THREE.IcosahedronGeometry(.07, 0);
const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffd193 });
const enemySize = new THREE.Vector3(1.05, .8, 1.05);
const playerSize = new THREE.Vector3().setScalar(PLAYER_CORE_RADIUS*2);
const direction = new THREE.Vector3();
const playerBox = new THREE.Box3();
const sweep = new THREE.Box3();
const collisionPoint = new THREE.Vector3();
export const MISSILE = Object.freeze({ speed:32, turnRate:3.5, cooldown:1.8, life:5, range:65, coneCos:.1, damage:3 });
const noseAxis = new THREE.Vector3(0,0,-1);
const missileBodyGeometry = new THREE.CylinderGeometry(.045,.045,.48,8).rotateX(Math.PI/2);
const missileNoseGeometry = new THREE.ConeGeometry(.045,.16,8).rotateX(-Math.PI/2);
const missileFinGeometry = new THREE.BoxGeometry(.22,.018,.14);
const missileFlameGeometry = new THREE.ConeGeometry(.05,.26,8).rotateX(Math.PI/2);
const missileMaterial = new THREE.MeshStandardMaterial({color:0xe7ebd7,metalness:.45,roughness:.35});
const missileGlow = new THREE.MeshBasicMaterial({color:0xffb56b});
const trailMaterial = new THREE.LineBasicMaterial({color:0xffc887,transparent:true,opacity:.85});

export class Combat {
  constructor(scene, world, events) {
    this.scene = scene; this.world = world; this.events = events;
    this.drones = []; this.bullets = []; this.particles = [];
    this.kills = 0; this.fireCooldown = 0; this.missileCooldown = 0; this.elapsed = 0;
    this.gunActivity = 0; this.gunHits = 0;
  }

  reset(options = {}) {
    for (const bullet of this.bullets) if (bullet.trail) { bullet.trail.removeFromParent(); bullet.trail.geometry.dispose(); }
    for (const object of [...this.drones.map(d => d.mesh), ...this.bullets.map(b => b.mesh), ...this.particles.map(p => p.mesh)]) object.removeFromParent();
    // Drone geometry/materials are disposed on restart; shared shot/effect assets stay cached.
    for (const drone of this.drones) drone.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    this.drones = []; this.bullets = []; this.particles = []; this.kills = 0; this.elapsed = 0; this.fireCooldown = 0; this.missileCooldown = 0;
    this.gunActivity = 0; this.gunHits = 0;
    this.config={count:4,health:3,patrolSpeed:.105,attacks:true,fireInterval:3.3,bulletSpeed:36,damage:10,aimError:0,planes:false,...options};
    this.loadout={gunDamage:1,gunInterval:.105,missileDamage:3,...options.loadout};
    for (let i = 0; i < this.config.count; i++) this.spawnDrone(i);
  }

  spawnDrone(index) {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), new THREE.MeshStandardMaterial({ color: 0x394b4c, roughness: .35, metalness: .6 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.52, .035, 6, 24), new THREE.MeshStandardMaterial({ color: 0xf08d67, emissive: 0xd24b2a, emissiveIntensity: .35 }));
    ring.rotation.x = Math.PI / 2; group.add(shell, ring);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa277 }));
    eye.position.z = -.27; group.add(eye);
    shell.castShadow = true;
    if(this.config.planes){
      for(const child of [...group.children])child.removeFromParent();
      shell.geometry.dispose();shell.material.dispose();ring.geometry.dispose();ring.material.dispose();eye.geometry.dispose();eye.material.dispose();
      const plane=createJet(true);plane.rotation.y=Math.PI;group.add(plane);
    }
    const drone = { mesh: group, ring:this.config.planes?null:ring, health: this.config.health, phase: index * Math.PI*2 / Math.max(1,this.config.count) + .4,
      radiusX: 18 + index%4 * 2, radiusZ: 25 + index%4 * 2,
      height: 16 + index%4 * 2.5, cooldown: this.config.fireInterval+index*.4, box: new THREE.Box3(), alive: true };
    // First practice target appears clearly ahead of the launch path.
    if(this.config.planes && this.config.count===1)drone.phase=0;
    if(this.config.planes&&this.config.count===1&&this.world.spawn){
      const nose=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),this.world.heading??0);
      for(const distance of [16,14,12,10,8]){
        const anchor=this.world.spawn.clone().addScaledVector(nose,distance);
        if(isSafePosition(this.world,anchor,.8)&&!this.world.colliders.some(c=>segmentHitsBox(this.world.spawn,anchor,c.box))){drone.practiceAnchor=anchor;break;}
      }
    }
    this.patrolPosition(drone, 0, group.position);
    // Guarantee a clear spawn even if the supplied map is edited later.
    for (let attempt = 0; attempt < 30 && !isSafePosition(this.world, group.position); attempt++) {
      drone.phase += .4; this.patrolPosition(drone, 0, group.position);
      if (attempt > 15) { drone.height += .3; group.position.y = drone.height; }
    }
    drone.box.setFromCenterAndSize(group.position, enemySize);
    this.drones.push(drone); this.scene.add(group);
  }

  patrolPosition(drone, time, target) {
    const angle = time * (this.config?.patrolSpeed??.105) + drone.phase;
    if(drone.practiceAnchor)return target.copy(drone.practiceAnchor).add(new THREE.Vector3(Math.sin(angle)*1.3,Math.sin(angle*.7)*.3,0));
    if(this.world.patrol){
      const p=this.world.patrol;
      return target.copy(p.center).add(new THREE.Vector3(Math.sin(angle)*(p.radiusX+drone.phase*.3),Math.sin(angle*1.7)*p.vertical+drone.phase*.25,Math.cos(angle)*p.radiusZ));
    }
    return target.set(Math.sin(angle) * drone.radiusX, drone.height + Math.sin(angle * 1.7) * 2.2, Math.cos(angle) * drone.radiusZ - 5);
  }

  shoot(state) {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = this.loadout.gunInterval;
    this.gunActivity = 1;
    const forward = forwardVector(state);
    const origin = state.position.clone().addScaledVector(forward, .44);
    this.addBullet(origin, forward.multiplyScalar(85).add(state.velocity), false, this.loadout.gunDamage);
    this.events.shot?.();
  }

  addBullet(origin, velocity, hostile, damage = hostile ? this.config.damage : 1) {
    if (this.bullets.length >= 120) return;
    const mesh = new THREE.Mesh(bulletGeometry, hostile ? enemyBulletMaterial : bulletMaterial);
    mesh.position.copy(origin); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), velocity.clone().normalize());
    this.scene.add(mesh);
    this.bullets.push({ mesh, previous: origin.clone(), velocity, hostile,damage, life: hostile ? 3.5 : 1.5 });
  }

  getMissileTarget(state) {
    const forward = forwardVector(state);
    let best = null, score = -Infinity;
    for (const drone of this.drones) {
      if (!drone.alive) continue;
      const offset = drone.mesh.position.clone().sub(state.position), distance = offset.length();
      if (distance < 1 || distance > MISSILE.range) continue;
      const alignment = offset.divideScalar(distance).dot(forward);
      if (alignment < MISSILE.coneCos) continue;
      if (this.world.colliders.some(c => segmentHitsBox(state.position, drone.mesh.position, c.box))) continue;
      const candidate = alignment - distance / (MISSILE.range * 10);
      if (candidate > score) { score = candidate; best = drone; }
    }
    return best;
  }

  fireMissile(state) {
    if (this.missileCooldown > 0) { this.events.weaponNotice?.('MISSILES REARMING'); return false; }
    const target = this.getMissileTarget(state);
    if (!target) { this.events.weaponNotice?.('NO MISSILE LOCK · FACE A DRONE'); return false; }
    if (this.bullets.length >= 120) return false;
    const forward = forwardVector(state), origin = state.position.clone().addScaledVector(forward,.5);
    const mesh = new THREE.Group();
    mesh.scale.setScalar(.6);
    mesh.add(new THREE.Mesh(missileBodyGeometry,missileMaterial));
    const nose = new THREE.Mesh(missileNoseGeometry,missileMaterial); nose.position.z = -.3;
    const fin = new THREE.Mesh(missileFinGeometry,missileMaterial); fin.position.z = .15;
    const verticalFin = fin.clone(); verticalFin.rotation.z = Math.PI/2;
    const flame = new THREE.Mesh(missileFlameGeometry,missileGlow); flame.position.z = .36;
    mesh.add(nose,fin,verticalFin,flame); mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(noseAxis,forward);
    const points = new Float32Array(90);
    for (let i=0;i<points.length;i+=3) origin.toArray(points,i);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(points,3).setUsage(THREE.DynamicDrawUsage));
    const trail = new THREE.Line(geometry,trailMaterial); trail.frustumCulled = false;
    this.scene.add(mesh,trail);
    this.bullets.push({mesh,trail,target,missile:true,damage:this.loadout.missileDamage,previous:origin.clone(),velocity:forward.multiplyScalar(MISSILE.speed),hostile:false,life:MISSILE.life});
    this.missileCooldown = MISSILE.cooldown; this.events.missileShot?.(); return true;
  }

  burst(position, count = 12) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial); mesh.position.copy(position);
      const velocity = new THREE.Vector3(Math.random() - .5, Math.random() - .25, Math.random() - .5).multiplyScalar(7);
      this.particles.push({ mesh, velocity, life: .45 + Math.random() * .4 }); this.scene.add(mesh);
    }
  }

  update(dt, player, active = true) {
    this.elapsed += dt; this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.gunActivity = Math.max(0,this.gunActivity-dt*2.5);
    playerBox.setFromCenterAndSize(player.position, playerSize);
    for (const drone of this.drones) {
      if (!drone.alive) continue;
      const target = this.patrolPosition(drone, this.elapsed, new THREE.Vector3());
      if (isSafePosition(this.world, target, .6)) {
        direction.copy(target).sub(drone.mesh.position);
        if (direction.lengthSq() > .001) drone.mesh.lookAt(target);
        drone.mesh.position.lerp(target, 1 - Math.exp(-3 * dt));
      }
      if(drone.ring)drone.ring.rotation.y += dt * 1.7;
      drone.box.setFromCenterAndSize(drone.mesh.position, enemySize);
      if (!active) continue;
      drone.cooldown -= dt;
      const distance = drone.mesh.position.distanceTo(player.position);
      if (this.config.attacks && drone.cooldown <= 0 && distance < 55 && distance > 2) {
        drone.cooldown = this.config.fireInterval*(.85+Math.random()*.3);
        const lead = player.position.clone().addScaledVector(player.velocity, distance / this.config.bulletSpeed * .65);
        lead.add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(this.config.aimError));
        direction.copy(lead).sub(drone.mesh.position).normalize();
        // Furniture blocks enemy fire as well as player shots.
        if (!this.world.colliders.some(c => segmentHitsBox(drone.mesh.position, player.position, c.box))) {
          this.addBullet(drone.mesh.position.clone(), direction.clone().multiplyScalar(this.config.bulletSpeed), true);
        }
      }
      // Physical contact is forgiving; only hostile projectiles damage the hull.
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      if (bullet.missile && bullet.target.alive) {
        const desired = bullet.target.mesh.position.clone().sub(bullet.mesh.position).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(noseAxis,desired);
        bullet.mesh.quaternion.rotateTowards(rotation,MISSILE.turnRate*dt);
        bullet.velocity.copy(noseAxis).applyQuaternion(bullet.mesh.quaternion).multiplyScalar(MISSILE.speed);
      }
      bullet.previous.copy(bullet.mesh.position);
      bullet.mesh.position.addScaledVector(bullet.velocity, dt); bullet.life -= dt;
      if (bullet.trail) {
        const attribute = bullet.trail.geometry.attributes.position;
        attribute.array.copyWithin(3,0,attribute.array.length-3);
        bullet.mesh.position.toArray(attribute.array,0); attribute.needsUpdate = true;
      }
      const start = bullet.previous, end = bullet.mesh.position;
      sweep.setFromPoints([start, end]).expandByScalar(.045);
      // Find the FIRST obstruction on the segment, so shots cannot hit through walls.
      const ray = new THREE.Ray(start, direction.copy(end).sub(start).normalize());
      let nearest = start.distanceTo(end) + .001, hit = null;
      const consider = (box, candidate) => {
        if (!sweep.intersectsBox(box)) return;
        if (box.containsPoint(start)) { nearest = 0; hit = candidate; return; }
        if (ray.intersectBox(box, collisionPoint)) {
          const distance = start.distanceTo(collisionPoint);
          if (distance < nearest) { nearest = distance; hit = candidate; }
        }
      };
      for (const collider of this.world.colliders) consider(collider.box, 'world');
      if (bullet.hostile) consider(playerBox, 'player');
      else for (const drone of this.drones) if (drone.alive) consider(drone.box, drone);
      if (hit) {
        bullet.life = 0;
        const impact = ray.at(nearest, new THREE.Vector3());
        if (hit === 'player') this.events.damage?.(bullet.damage, 'INCOMING FIRE');
        else if (hit !== 'world') {
          hit.health -= bullet.damage ?? 1;
          if (!bullet.missile) this.gunHits++;
          this.events.hit?.(); this.burst(impact, 5);
          if (hit.health <= 0) {
            hit.alive = false; hit.mesh.visible = false; this.kills++;
            this.burst(hit.mesh.position, 25); this.events.kill?.(this.kills);
          }
        } else this.burst(impact, bullet.missile ? 10 : 2);
      }
      if (bullet.life <= 0) {
        bullet.mesh.removeFromParent();
        if (bullet.trail) { bullet.trail.removeFromParent(); bullet.trail.geometry.dispose(); }
        this.bullets.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt; p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= dt * 3; p.mesh.scale.setScalar(Math.max(.01, p.life * 1.5));
      if (p.life <= 0) { p.mesh.removeFromParent(); this.particles.splice(i, 1); }
    }
  }
}
