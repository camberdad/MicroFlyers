import * as THREE from 'three';
import { forwardVector, segmentHitsBox } from './flight.js';
import { isSafePosition } from './world.js';
import { PLAYER_CORE_RADIUS } from './maps.js';
import { createJet } from './aircraft.js';
import { randomAirPoint, spawnForward } from './spawns.js';
import { ENEMY_TYPES, BALLOONS } from './modes.js';

const BULLET_CAP = 200;
const confetti = new Map();
const flashGeometry = new THREE.SphereGeometry(.5, 14, 10);
const flashBase = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x5a5753, transparent: true, opacity: .55, depthWrite: false });
const balloonKnot = new THREE.ConeGeometry(.08, .14, 8);
const stringMaterial = new THREE.LineBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: .8 });

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
export const ENEMY_GUN = Object.freeze({coneCos:Math.cos(10*Math.PI/180),noseOffset:.78,range:55});
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
    this.gunActivity = 0; this.gunHits = 0; this.powerups = { rapid: 0, spread: 0 };
  }

  reset(options = {}) {
    for (const bullet of this.bullets) if (bullet.trail) { bullet.trail.removeFromParent(); bullet.trail.geometry.dispose(); }
    for (const object of [...this.drones.map(d => d.mesh), ...this.bullets.map(b => b.mesh), ...this.particles.map(p => p.mesh)]) object.removeFromParent();
    // Drone geometry/materials are disposed on restart; shared shot/effect assets stay cached.
    for (const drone of this.drones) drone.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    this.drones = []; this.bullets = []; this.particles = []; this.kills = 0; this.elapsed = 0; this.fireCooldown = 0; this.missileCooldown = 0;
    this.gunActivity = 0; this.gunHits = 0; this.powerups = { rapid: 0, spread: 0 };
    this.config={count:4,health:3,patrolSpeed:.105,attacks:true,fireInterval:3.3,bulletSpeed:36,damage:10,aimError:0,planes:false,...options};
    this.loadout={gunDamage:1,gunInterval:.105,missileDamage:3,missileCooldown:MISSILE.cooldown,missileTurn:MISSILE.turnRate,missileRange:MISSILE.range,...options.loadout};
    for (let i = 0; i < this.config.count; i++) this.spawnDrone(i);
  }

  /** Add more enemies/targets mid-sortie (Survival reinforcements, Blitz balloons)
   * without clearing bullets, kills or power-ups. Long-dead drones are disposed. */
  addDrones(spawns, types = [], overrides = {}) {
    this.prune();
    Object.assign(this.config, overrides);
    const added = [];
    spawns.forEach((spawn, i) => added.push(this.spawnDrone(this.drones.length, spawn, types[i] ?? 'fighter')));
    return added;
  }
  prune() {
    const keep = [];
    for (const drone of this.drones) {
      if (drone.alive) { keep.push(drone); continue; }
      drone.mesh.removeFromParent();
      drone.mesh.traverse(o => { if (o.isMesh || o.isLine) { if (o.geometry !== balloonKnot) o.geometry.dispose(); if (o.material !== stringMaterial) o.material.dispose(); } });
    }
    this.drones = keep;
  }
  get alive() { return this.drones.reduce((n, d) => n + (d.alive ? 1 : 0), 0); }

  spawnBalloon(index, spawn, kind) {
    const spec = BALLOONS[kind] ?? BALLOONS.red, group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(spec.size, 18, 14), new THREE.MeshStandardMaterial({ color: spec.color, roughness: .25, metalness: .05, emissive: spec.color, emissiveIntensity: kind === 'gold' ? .45 : .12 }));
    body.scale.y = 1.18; body.castShadow = true; group.add(body);
    const knot = new THREE.Mesh(balloonKnot, body.material); knot.position.y = -spec.size * 1.18 - .05; knot.rotation.x = Math.PI; group.add(knot);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -spec.size * 1.18 - .1, 0), new THREE.Vector3(.05, -spec.size * 1.18 - 1.3, .03)]), stringMaterial);
    group.add(line);
    if (kind === 'clock') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.size * 1.25, .03, 6, 24), new THREE.MeshBasicMaterial({ color: 0xeafff2 }));
      group.add(ring);
    }
    group.position.copy(spawn.position);
    const size = new THREE.Vector3(spec.size * 2.3, spec.size * 2.6, spec.size * 2.3);
    const drone = { mesh: group, balloon: kind, spec, health: 1, maxHealth: 1, alive: true, box: new THREE.Box3(), size, base: spawn.position.clone(),
      phase: Math.random() * Math.PI * 2, velocity: new THREE.Vector3(), cooldown: Infinity, age: 0, type: 'balloon' };
    drone.box.setFromCenterAndSize(group.position, size);
    this.drones.push(drone); this.scene.add(group); return drone;
  }

  spawnDrone(index, spawn = this.config.spawns?.[index], type = this.config.types?.[index] ?? 'fighter') {
    if (this.config.balloons) return this.spawnBalloon(index, spawn, type);
    const stats = ENEMY_TYPES[type] ?? ENEMY_TYPES.fighter;
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
      const plane=createJet(true,{body:stats.body,accent:stats.accent,glow:stats.boss?0xffd34d:undefined});plane.scale.multiplyScalar(stats.scale);group.add(plane);
    }
    const health=this.config.planes?Math.max(1,Math.ceil(this.config.health*stats.health)):this.config.health;
    const drone = { mesh: group, ring:this.config.planes?null:ring, health, maxHealth:health, type, stats, size:enemySize.clone().multiplyScalar(this.config.planes?stats.scale:1), phase: index * Math.PI*2 / Math.max(1,this.config.count) + .4,
      radiusX: 18 + index%4 * 2, radiusZ: 25 + index%4 * 2,
      height: 16 + index%4 * 2.5, cooldown: this.config.fireInterval+index*.4, box: new THREE.Box3(), alive: true,
      age:0,velocity:new THREE.Vector3(),waypoint:new THREE.Vector3(),retarget:0,aimOffset:new THREE.Vector3() };
    if(spawn){
      group.position.copy(spawn.position);group.rotation.y=spawn.heading;
      drone.waypoint.copy(spawn.position).addScaledVector(spawnForward(spawn),6);
      drone.retarget=2.5;
    }else this.patrolPosition(drone, 0, group.position);
    // Guarantee a clear spawn even if the supplied map is edited later.
    for (let attempt = 0; !spawn && attempt < 30 && !isSafePosition(this.world, group.position); attempt++) {
      drone.phase += .4; this.patrolPosition(drone, 0, group.position);
      if (attempt > 15) { drone.height += .3; group.position.y = drone.height; }
    }
    drone.box.setFromCenterAndSize(group.position, drone.size);
    this.drones.push(drone); this.scene.add(group); return drone;
  }

  patrolPosition(drone, time, target) {
    const angle = time * (this.config?.patrolSpeed??.105) + drone.phase;
    if(this.world.patrol){
      const p=this.world.patrol;
      return target.copy(p.center).add(new THREE.Vector3(Math.sin(angle)*(p.radiusX+drone.phase*.3),Math.sin(angle*1.7)*p.vertical+drone.phase*.25,Math.cos(angle)*p.radiusZ));
    }
    return target.set(Math.sin(angle) * drone.radiusX, drone.height + Math.sin(angle * 1.7) * 2.2, Math.cos(angle) * drone.radiusZ - 5);
  }

  chooseWaypoint(drone) {
    for(let i=0;i<60;i++){
      const point=randomAirPoint(this.world);
      if(point.distanceToSquared(drone.mesh.position)>36&&isSafePosition(this.world,point,1))return point;
    }
    return drone.mesh.position.clone().addScaledVector(forwardVector(drone.mesh),4);
  }

  updateEnemyFlight(drone,player,dt,active) {
    drone.age+=dt;drone.retarget-=dt;
    const before=drone.mesh.position.clone(),nose=forwardVector(drone.mesh);
    const blocked=!isSafePosition(this.world,before.clone().addScaledVector(nose,2),.8);
    if(drone.retarget<=0||before.distanceToSquared(drone.waypoint)<9){
      drone.waypoint.copy(this.chooseWaypoint(drone));drone.retarget=2+Math.random()*3;
      drone.aimOffset.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(this.config.aimError);
    }
    const canPursue=active&&this.config.attacks&&drone.age>2.5&&!blocked&&before.distanceToSquared(player.position)<65**2;
    const target=canPursue?player.position.clone().addScaledVector(player.velocity,before.distanceTo(player.position)/this.config.bulletSpeed*.45).add(drone.aimOffset):drone.waypoint;
    if(blocked&&drone.retarget>1){drone.waypoint.copy(this.chooseWaypoint(drone));drone.retarget=1;}
    const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(before,target,new THREE.Vector3(0,1,0)));
    const stats=drone.stats??ENEMY_TYPES.fighter;
    const turnRate=(.45+this.config.patrolSpeed*4)*stats.turn;
    drone.mesh.quaternion.rotateTowards(rotation,turnRate*dt);
    forwardVector(drone.mesh,nose);
    const candidate=before.clone().addScaledVector(nose,(2+this.config.patrolSpeed*25)*stats.speed*dt);
    if(isSafePosition(this.world,candidate,.7))drone.mesh.position.copy(candidate);
    drone.velocity.copy(drone.mesh.position).sub(before).divideScalar(Math.max(dt,.000001));
  }

  tryEnemyShot(drone,player) {
    if(!drone.alive||drone.balloon||!this.config.attacks||drone.cooldown>0||this.bullets.length>=BULLET_CAP)return false;
    const nose=forwardVector(drone.mesh),toPlayer=player.position.clone().sub(drone.mesh.position),distance=toPlayer.length();
    if(distance<2||distance>ENEMY_GUN.range||nose.dot(toPlayer.divideScalar(distance))<ENEMY_GUN.coneCos)return false;
    const origin=drone.mesh.position.clone().addScaledVector(nose,ENEMY_GUN.noseOffset);
    if(this.world.colliders.some(c=>segmentHitsBox(drone.mesh.position,player.position,c.box)))return false;
    // Bullet direction is the aircraft's actual -Z nose, never a turret vector.
    this.addBullet(origin,nose.multiplyScalar(this.config.bulletSpeed).add(drone.velocity),true);
    drone.cooldown=this.config.fireInterval*(drone.stats?.fire??1)*(.85+Math.random()*.3);return true;
  }

  shoot(state) {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = this.loadout.gunInterval*(this.powerups.rapid>0?.55:1);
    this.gunActivity = 1;
    const forward = forwardVector(state);
    const origin = state.position.clone().addScaledVector(forward, .22);
    if (this.powerups.spread > 0) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
      for (const angle of [-.075, .075]) this.addBullet(origin.clone(), forward.clone().applyAxisAngle(up, angle).multiplyScalar(85).add(state.velocity), false, this.loadout.gunDamage);
    }
    this.addBullet(origin, forward.multiplyScalar(85).add(state.velocity), false, this.loadout.gunDamage);
    this.events.shot?.();
  }

  addBullet(origin, velocity, hostile, damage = hostile ? this.config.damage : 1) {
    if (this.bullets.length >= BULLET_CAP) return;
    const mesh = new THREE.Mesh(bulletGeometry, hostile ? enemyBulletMaterial : bulletMaterial);
    if(!hostile)mesh.scale.setScalar(.5);
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
      if (distance < 1 || distance > (this.loadout?.missileRange ?? MISSILE.range)) continue;
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
    if (this.bullets.length >= BULLET_CAP) return false;
    const forward = forwardVector(state), origin = state.position.clone().addScaledVector(forward,.25);
    const mesh = new THREE.Group();
    mesh.scale.setScalar(.3);
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
    this.missileCooldown = this.loadout.missileCooldown ?? MISSILE.cooldown; this.events.missileShot?.(); return true;
  }

  burst(position, count = 12, big = false) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial); mesh.position.copy(position);
      const velocity = new THREE.Vector3(Math.random() - .5, Math.random() - .25, Math.random() - .5).multiplyScalar(big ? 9 : 7);
      this.particles.push({ mesh, velocity, life: .45 + Math.random() * .4 }); this.scene.add(mesh);
    }
    if (!big) return;
    const flash = new THREE.Mesh(flashGeometry, flashBase.clone()); flash.position.copy(position);
    this.particles.push({ mesh: flash, velocity: new THREE.Vector3(), life: .38, max: .38, flash: true }); this.scene.add(flash);
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(sparkGeometry, smokeMaterial); puff.position.copy(position);
      this.particles.push({ mesh: puff, velocity: new THREE.Vector3(Math.random() - .5, Math.random() * .6 + .2, Math.random() - .5).multiplyScalar(1.6), life: 1.1 + Math.random() * .6, smoke: true });
      this.scene.add(puff);
    }
  }
  /** Balloons pop into a ring of colored confetti instead of a fireball. */
  pop(position, color) {
    const material = confetti.get(color) ?? confetti.set(color, new THREE.MeshBasicMaterial({ color })).get(color);
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(sparkGeometry, material); mesh.position.copy(position);
      const velocity = new THREE.Vector3(Math.random() - .5, Math.random() - .3, Math.random() - .5).normalize().multiplyScalar(5 + Math.random() * 3);
      this.particles.push({ mesh, velocity, life: .7 }); this.scene.add(mesh);
    }
  }

  update(dt, player, active = true) {
    this.elapsed += dt; this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.gunActivity = Math.max(0,this.gunActivity-dt*2.5);
    this.powerups.rapid = Math.max(0, this.powerups.rapid - dt); this.powerups.spread = Math.max(0, this.powerups.spread - dt);
    playerBox.setFromCenterAndSize(player.position, playerSize);
    for (const drone of this.drones) {
      if (!drone.alive) continue;
      if (drone.balloon) {
        drone.age += dt;
        const t = drone.age * drone.spec.bob + drone.phase;
        drone.mesh.position.set(drone.base.x + (drone.spec.drift ? Math.sin(t * .37) * .9 : 0), drone.base.y + Math.sin(t) * .35, drone.base.z + (drone.spec.drift ? Math.cos(t * .29) * .9 : 0));
        drone.mesh.rotation.y += dt * .6;
        drone.box.setFromCenterAndSize(drone.mesh.position, drone.size);
        continue;
      }
      if(this.config.planes)this.updateEnemyFlight(drone,player,dt,active);
      else {
        const target = this.patrolPosition(drone, this.elapsed, new THREE.Vector3());
        if (isSafePosition(this.world, target, .6)) {
          direction.copy(target).sub(drone.mesh.position);
          if(direction.lengthSq()>.001)drone.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(drone.mesh.position,target,new THREE.Vector3(0,1,0)));
          drone.mesh.position.lerp(target, 1 - Math.exp(-3 * dt));
        }
      }
      if(drone.ring)drone.ring.rotation.y += dt * 1.7;
      drone.box.setFromCenterAndSize(drone.mesh.position, drone.size??enemySize);
      if (!active) continue;
      drone.cooldown -= dt;
      this.tryEnemyShot(drone,player);
      // Physical contact is forgiving; only hostile projectiles damage the hull.
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      if (bullet.missile && bullet.target.alive) {
        const desired = bullet.target.mesh.position.clone().sub(bullet.mesh.position).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(noseAxis,desired);
        bullet.mesh.quaternion.rotateTowards(rotation,(this.loadout.missileTurn??MISSILE.turnRate)*dt);
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
            if (hit.balloon) this.pop(hit.mesh.position, hit.spec.color);
            else this.burst(hit.mesh.position, hit.stats?.boss ? 45 : 25, true);
            this.events.kill?.(this.kills, hit);
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
      if (p.flash) { const k = Math.max(0, p.life / p.max); p.mesh.scale.setScalar(.3 + (1 - k) * 2.6); p.mesh.material.opacity = k * .9; }
      else if (p.smoke) { p.velocity.multiplyScalar(1 - dt * .8); p.mesh.scale.setScalar(Math.max(.01, 2.6 - p.life * 1.4)); }
      else { p.velocity.y -= dt * 3; p.mesh.scale.setScalar(Math.max(.01, p.life * 1.5)); }
      if (p.life <= 0) { p.mesh.removeFromParent(); if (p.flash) p.mesh.material.dispose(); this.particles.splice(i, 1); }
    }
  }
}
