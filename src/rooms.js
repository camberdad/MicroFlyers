import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Code-built airfields. Every room is authored in centimeters: inner floor
 * x -260..260, z -400..400, ceiling 290. Each furniture part is a separate mesh
 * so per-mesh collider boxes stay tight around hollow pieces (bunks, shelves,
 * arches, the gap under the car) and those gaps remain flyable.
 */
const materials = new Map();
const canBrowser = typeof document !== 'undefined';

function pattern(kind) {
  if (!canBrowser) return null;
  const key = `pattern:${kind}`;
  if (materials.has(key)) return materials.get(key);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  let repeat = [4, 6];
  if (kind === 'checker') {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#2f3d40' : '#efe8d6'; c.fillRect(x * 32, y * 32, 32, 32); }
    repeat = [5, 8];
  } else if (kind === 'planks' || kind === 'darkplanks') {
    const base = kind === 'planks' ? [222, 190, 146] : [110, 74, 44];
    for (let i = 0; i < 8; i++) {
      const shade = (Math.sin(i * 12.9) * .5 + .5) * 26 - 13;
      c.fillStyle = `rgb(${base.map(v => Math.max(0, Math.min(255, v + shade))).join(',')})`; c.fillRect(0, i * 32, 256, 31);
      c.fillStyle = '#0000002a'; c.fillRect(0, i * 32 + 31, 256, 1); c.fillRect((i * 97) % 256, i * 32, 1, 32);
      for (let j = 0; j < 30; j++) { c.fillStyle = `rgba(60,35,18,${.04 + (j % 5) * .015})`; c.fillRect((j * 53 + i * 31) % 256, i * 32 + (j * 7) % 30, 30 + (j * 17) % 80, 1); }
    }
    repeat = [3, 7];
  } else if (kind === 'concrete') {
    c.fillStyle = '#8e908b'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) { const v = (i * 7919) % 255; c.fillStyle = `rgba(${v > 128 ? '255,255,255' : '30,30,30'},${.03 + (i % 7) * .006})`; c.fillRect((i * 31) % 256, (i * 113) % 256, 2, 2); }
    c.strokeStyle = '#5e605c88'; c.lineWidth = 2; c.strokeRect(1, 1, 254, 254);
    repeat = [4, 6];
  } else if (kind === 'rug') {
    c.fillStyle = '#7a2a2a'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#d9b36a'; c.lineWidth = 6; c.strokeRect(12, 12, 232, 232); c.lineWidth = 2; c.strokeRect(26, 26, 204, 204);
    c.fillStyle = '#d9b36a55'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(128, 128, 20 + i * 16, 0, Math.PI * 2); c.stroke(); }
    repeat = [1, 1];
  } else if (kind === 'kidsrug') {
    const colors = ['#f2c14e', '#f78154', '#4d9de0', '#7bc950', '#b57ee0'];
    for (let i = 0; i < 5; i++) { c.fillStyle = colors[i]; c.beginPath(); c.arc(128, 128, 128 - i * 25, 0, Math.PI * 2); c.fill(); }
    repeat = [1, 1];
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...repeat); texture.anisotropy = 4;
  materials.set(key, texture); return texture;
}

function material(color, options = {}) {
  const key = JSON.stringify([color, options]);
  if (materials.has(key)) return materials.get(key);
  const { emissive, intensity = .8, rough = .75, metal = 0, map, vertexColors, double, opacity } = options;
  const result = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: Boolean(vertexColors),
    side: double ? THREE.DoubleSide : THREE.FrontSide });
  if (emissive !== undefined) { result.emissive = new THREE.Color(emissive); result.emissiveIntensity = intensity; }
  if (map) { const texture = pattern(map); if (texture) result.map = texture; }
  if (opacity !== undefined) { result.transparent = true; result.opacity = opacity; result.depthWrite = false; }
  materials.set(key, result); return result;
}

class RoomBuilder {
  constructor(name) { this.root = new THREE.Group(); this.root.name = name; this.count = 0; }
  add(name, geometry, color, options = {}, position = [0, 0, 0], rotation) {
    const mesh = new THREE.Mesh(geometry, material(color, options));
    mesh.name = `${name}_${++this.count}`; mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    if (options.noShadow) mesh.castShadow = false;
    mesh.userData.noCastShadow = Boolean(options.noShadow);
    this.root.add(mesh); return mesh;
  }
  /** Axis-aligned box from min/max corners (cm). */
  box(name, color, [x0, y0, z0], [x1, y1, z1], options) {
    return this.add(name, new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), color, options, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], options?.rot);
  }
  /** Upright cylinder whose base sits at y. */
  cyl(name, color, x, y, z, radius, height, options = {}) {
    const geometry = new THREE.CylinderGeometry(options.top ?? radius, radius, height, options.segments ?? 20, 1, Boolean(options.open));
    return this.add(name, geometry, color, options, [x, y + height / 2, z], options.rot);
  }
  /** Horizontal cylinder centered at x,y,z along an axis ('x' or 'z'). */
  axle(name, color, x, y, z, radius, length, axis = 'x', options = {}) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, options.segments ?? 20);
    return this.add(name, geometry, color, options, [x, y, z], axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
  }
  sphere(name, color, x, y, z, radius, options = {}) {
    const mesh = this.add(name, new THREE.SphereGeometry(radius, options.segments ?? 18, 12), color, options, [x, y, z], options.rot);
    if (options.scale) mesh.scale.set(...options.scale);
    return mesh;
  }
  cone(name, color, x, y, z, radius, height, options = {}) {
    return this.add(name, new THREE.ConeGeometry(radius, height, options.segments ?? 18, 1, Boolean(options.open)), color, options, [x, y + height / 2, z], options.rot);
  }
  torus(name, color, x, y, z, radius, tube, rotation = [Math.PI / 2, 0, 0], options = {}) {
    return this.add(name, new THREE.TorusGeometry(radius, tube, 8, 28), color, options, [x, y, z], rotation);
  }
  /** Floor, four walls and a ceiling around the shared inner volume. */
  shell({ wall, floor, floorMap, ceiling = 0xf4f1e8, trim = 0xffffff }) {
    this.box('Floor', floor, [-272, -6, -412], [272, 0, 412], { map: floorMap, rough: .7 });
    this.box('Ceiling', ceiling, [-272, 290, -412], [272, 296, 412], { noShadow: true });
    this.box('WallNorth', wall, [-272, 0, -412], [272, 290, -400], { noShadow: true });
    this.box('WallSouth', wall, [-272, 0, 400], [272, 290, 412], { noShadow: true });
    this.box('WallWest', wall, [-272, 0, -400], [-260, 290, 400], { noShadow: true });
    this.box('WallEast', wall, [260, 0, -400], [272, 290, 400], { noShadow: true });
    for (const [a, b] of [[[-260, 0, -400], [260, 10, -398]], [[-260, 0, 398], [260, 10, 400]], [[-260, 0, -398], [-258, 10, 398]], [[258, 0, -398], [260, 10, 398]]])
      this.box('Baseboard', trim, a, b, { noShadow: true });
  }
  /** Four-legged table with a rectangular top. */
  table(name, color, [x0, z0], [x1, z1], height, { top = 5, leg = 4, legColor = color } = {}) {
    this.box(`${name}Top`, color, [x0, height - top, z0], [x1, height, z1]);
    for (const x of [x0 + leg + 4, x1 - leg - 4]) for (const z of [z0 + leg + 4, z1 - leg - 4]) this.cyl(`${name}Leg`, legColor, x, 0, z, leg, height - top, { segments: 10 });
  }
  /** Simple chair facing +z (rotate by swapping sides with `facing = -1`). */
  chair(name, color, x, z, facing = 1, seat = 45) {
    this.box(`${name}Seat`, color, [x - 21, seat - 5, z - 21], [x + 21, seat, z + 21]);
    for (const dx of [-17, 17]) for (const dz of [-17, 17]) this.box(`${name}Leg`, color, [x + dx - 2, 0, z + dz - 2], [x + dx + 2, seat - 5, z + dz + 2]);
    const back = z - 19 * facing;
    this.box(`${name}Back`, color, [x - 21, seat, Math.min(back, back - 4 * facing)], [x + 21, seat + 48, Math.max(back, back - 4 * facing)]);
  }
  /** Books along a shelf: one merged, vertex-colored mesh per run. */
  books(name, x0, x1, y, z0, z1, seed, palette) {
    const geometries = []; let x = x0, i = 0;
    const color = new THREE.Color();
    while (x < x1 - 4) {
      const r = Math.abs(Math.sin(seed * 91.7 + i * 12.989));
      const width = 3.5 + r * 5, height = 22 + Math.abs(Math.sin(seed * 3.1 + i * 4.3)) * 24;
      const depth = Math.abs(z1 - z0) * (.75 + r * .2);
      if (r > .93) { x += width + 6; i++; continue; } // occasional gap
      const geometry = new THREE.BoxGeometry(width, height, depth);
      geometry.translate(x + width / 2, y + height / 2, (z0 + z1) / 2);
      color.setHex(palette[i % palette.length]).offsetHSL(0, 0, (r - .5) * .12);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let k = 0; k < colors.length; k += 3) color.toArray(colors, k);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(geometry); x += width + .6; i++;
    }
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    this.add(name, merged, 0xffffff, { vertexColors: true, rough: .8 });
  }
}

const BOOK_COLORS = [0x8c2f39, 0x2e5266, 0xd9a441, 0x3c6e47, 0x6b4e71, 0xb5651d, 0x1f3a5f, 0xc9b79c, 0x5c3c24, 0x9b2226];

function kitchen() {
  const r = new RoomBuilder('Kitchen');
  r.shell({ wall: 0xf1e7d3, floor: 0xffffff, floorMap: 'checker' });
  const teal = 0x4f7c74, marble = 0xe9e5dc, steel = 0xb9c2c4, wood = 0xb07a4a, dark = 0x222a2c;
  // Back run of cabinets, cooktop, oven and hood.
  r.box('BaseCabinets', teal, [-258, 0, -398], [150, 88, -338]);
  r.box('Countertop', marble, [-258, 88, -398], [152, 93, -334], { rough: .3 });
  for (let x = -250; x < 150; x += 50) r.box('CabinetSeam', 0x3d625b, [x, 8, -338], [x + 1, 84, -336.5], { noShadow: true });
  r.box('Cooktop', dark, [-55, 93, -390], [15, 95, -345], { rough: .2 });
  for (const [x, z] of [[-38, -378], [-2, -378], [-38, -357], [-2, -357]]) r.torus('Burner', 0x555c5e, x, 95.5, z, 9, 1.2);
  r.box('OvenDoor', 0x1a1f21, [-55, 12, -338], [15, 78, -336], { rough: .15, metal: .4 });
  r.box('OvenHandle', steel, [-50, 70, -336], [10, 72, -332], { metal: .8, rough: .3 });
  r.box('RangeHood', steel, [-65, 190, -398], [25, 205, -350], { metal: .7, rough: .3 });
  r.box('HoodChimney', steel, [-35, 205, -398], [-5, 290, -378], { metal: .7, rough: .3 });
  r.box('UpperCabinetLeft', teal, [-258, 150, -398], [-80, 222, -364]);
  r.box('UpperCabinetRight', teal, [45, 150, -398], [150, 222, -364]);
  r.box('Backsplash', 0xd8e6e2, [-258, 93, -399], [150, 150, -397], { noShadow: true });
  r.cyl('Faucet', steel, -130, 93, -385, 2.2, 30, { metal: .9, rough: .2 });
  r.box('FaucetSpout', steel, [-132, 118, -385], [-128, 122, -362], { metal: .9, rough: .2 });
  r.box('Sink', 0x8d999b, [-165, 90, -380], [-95, 93.5, -350], { metal: .6, rough: .25 });
  // Fridge.
  r.box('Fridge', 0xe4e8e6, [175, 0, -398], [258, 205, -322], { rough: .35, metal: .2 });
  r.box('FridgeSeam', 0xb7bcba, [175, 130, -322], [258, 132, -321], { noShadow: true });
  r.box('FridgeHandle', steel, [182, 60, -321], [186, 190, -315], { metal: .8 });
  for (let i = 0; i < 5; i++) r.box('FridgeMagnet', [0xf25f5c, 0xffe066, 0x247ba0, 0x70c1b3, 0xff9f1c][i], [200 + i * 10, 150 + (i % 2) * 18, -321], [207 + i * 10, 157 + (i % 2) * 18, -319.5], { noShadow: true });
  // Side run on the west wall with window, microwave, toaster and kettle.
  r.box('SideCabinets', teal, [-258, 0, -334], [-198, 88, -60]);
  r.box('SideCounter', marble, [-258, 88, -334], [-194, 93, -60], { rough: .3 });
  r.box('Microwave', dark, [-252, 93, -300], [-206, 124, -250], { rough: .3 });
  r.box('MicrowaveGlass', 0x395057, [-206, 100, -296], [-205, 120, -265], { emissive: 0x1c3a40, intensity: .4, noShadow: true });
  r.box('Toaster', 0xd94f45, [-246, 93, -185], [-216, 113, -160], { rough: .35, metal: .3 });
  r.cyl('Kettle', 0xe8e1cf, -228, 93, -120, 11, 22, { top: 8, metal: .2 });
  r.box('KettleSpout', 0xe8e1cf, [-219, 104, -122], [-206, 108, -118]);
  r.box('Window', 0xcfe8ff, [-260, 135, -300], [-259, 245, -110], { emissive: 0xbfe0ff, intensity: .9, noShadow: true });
  for (const z of [-302, -205, -108]) r.box('WindowFrame', 0xffffff, [-260, 133, z - 2], [-256, 247, z + 2]);
  for (const y of [133, 190, 247]) r.box('WindowSill', 0xffffff, [-260, y - 2, -302], [-252, y + 2, -108]);
  // Island with bar stools and a fruit bowl.
  r.box('IslandBase', wood, [-110, 0, -70], [110, 90, 30], { map: 'planks' });
  r.box('IslandTop', marble, [-122, 90, -82], [122, 96, 42], { rough: .3 });
  r.cyl('FruitBowl', 0xf0eadb, 40, 96, -20, 24, 10, { top: 28, open: false });
  for (const [x, z, c] of [[32, -24, 0xff9f1c], [46, -14, 0xff9f1c], [40, -30, 0xd7263d], [50, -26, 0x9bc53d]]) r.sphere('Fruit', c, x, 112, z, 7);
  r.box('CuttingBoard', 0xc8955c, [-70, 96, -40], [-20, 99, -5]);
  r.cyl('Vase', 0x3d7ea6, -90, 96, -55, 8, 26, { top: 5 });
  for (const [dx, dz] of [[0, 0], [5, 4], [-4, 5]]) r.sphere('Flower', [0xffd166, 0xef476f, 0xffffff][(dx + 5) % 3], -90 + dx, 128 + dz, -55 + dz, 6);
  for (const x of [-70, 0, 70]) {
    r.cyl('StoolBase', steel, x, 0, 78, 18, 3, { metal: .7 });
    r.cyl('StoolPost', steel, x, 3, 78, 3, 64, { metal: .7 });
    r.torus('StoolRing', steel, x, 32, 78, 14, 1.4, [Math.PI / 2, 0, 0], { metal: .7 });
    r.cyl('StoolSeat', 0x2f3d40, x, 67, 78, 20, 6);
  }
  // Pendant lights over the island.
  for (const x of [-60, 60]) {
    r.cyl('PendantCord', 0x1b1b1b, x, 200, -20, .8, 90, { segments: 6, noShadow: true });
    r.cone('PendantShade', 0x2d5d57, x, 176, -20, 22, 26, { open: true, double: true });
    r.sphere('PendantBulb', 0xfff3d6, x, 180, -20, 6, { emissive: 0xffe2a8, intensity: 1.4, noShadow: true });
  }
  // Dining table, chairs, rug and ceiling fan to the south.
  r.box('DiningRug', 0xc96b4b, [-150, 0, 165], [150, .8, 365], { noShadow: true });
  r.table('DiningTable', wood, [-100, 200], [100, 320], 74, { leg: 4 });
  for (const x of [-50, 50]) { r.chair('ChairNorth', 0x8a5a36, x, 172, 1); r.chair('ChairSouth', 0x8a5a36, x, 348, -1); }
  r.cyl('TableCandle', 0xfff8e7, 0, 74, 260, 4, 18);
  r.sphere('CandleFlame', 0xffc15e, 0, 95, 260, 2.6, { emissive: 0xffa500, intensity: 2, noShadow: true });
  r.cyl('FanRod', 0x5a4a3a, 0, 266, 260, 2, 24, { segments: 8 });
  r.cyl('FanHub', 0x5a4a3a, 0, 258, 260, 11, 8);
  for (let i = 0; i < 4; i++) r.box('FanBlade', 0x8a6a4a, [-80, 261, 253], [-12, 263, 267], { rot: [0, i * Math.PI / 2, 0] }).position.set(Math.cos(i * Math.PI / 2) * 46, 262, 260 - Math.sin(i * Math.PI / 2) * 46);
  // East wall shelf, clock and plant.
  r.box('WallShelf', wood, [236, 160, -170], [258, 164, 60]);
  for (let i = 0; i < 6; i++) r.cyl('Jar', [0xe0c097, 0xd4a373, 0x7f5539, 0xccd5ae, 0xe9edc9, 0xfaedcd][i], 247, 164, -150 + i * 36, 8, 18 + (i % 3) * 6, { opacity: .85 });
  r.axle('WallClock', 0xfaf7ef, 257, 215, 150, 26, 4, 'x');
  r.box('ClockHand', dark, [254, 213, 140], [255, 217, 152], { noShadow: true });
  r.cyl('PlantPot', 0xc06b42, 225, 0, 370, 24, 40, { top: 28 });
  r.sphere('PlantLeaves', 0x4c8b3c, 225, 82, 370, 40, { scale: [1, 1.1, 1] });
  r.box('Doormat', 0x6b5a43, [-60, 0, 380], [60, 1.2, 398], { noShadow: true });
  return r.root;
}

function bedroom() {
  const r = new RoomBuilder('Bedroom');
  r.shell({ wall: 0xcfe3f0, floor: 0xffffff, floorMap: 'planks' });
  const white = 0xf3efe7, wood = 0xd0a06a;
  // Bunk bed: fly between the two mattresses.
  for (const x of [-254, -162]) for (const z of [-394, -202]) r.box('BunkPost', white, [x - 4, 0, z - 4], [x + 4, 186, z + 4]);
  r.box('LowerFrame', white, [-258, 20, -398], [-158, 34, -198]);
  r.box('LowerMattress', 0x5b8fd6, [-255, 34, -395], [-161, 52, -201]);
  r.box('LowerPillow', 0xffffff, [-250, 52, -390], [-170, 62, -360]);
  r.box('UpperFrame', white, [-258, 125, -398], [-158, 140, -198]);
  r.box('UpperMattress', 0xf28c5b, [-255, 140, -395], [-161, 157, -201]);
  r.box('UpperPillow', 0xffffff, [-250, 157, -390], [-170, 167, -360]);
  r.box('SafetyRail', white, [-162, 157, -398], [-158, 186, -262]);
  for (const z of [-232, -206]) r.box('LadderRail', white, [-160, 0, z - 2], [-155, 170, z + 2]);
  for (let y = 25; y < 170; y += 30) r.box('LadderRung', white, [-160, y, -232], [-155, y + 3, -206]);
  r.box('Teddy', 0xa47148, [-245, 157, -240], [-225, 175, -222]);
  r.sphere('TeddyHead', 0xa47148, -235, 183, -231, 9);
  // Desk corner.
  r.table('Desk', white, [80, -398], [220, -330], 74, { leg: 3 });
  r.box('Monitor', 0x1e2430, [118, 76, -388], [182, 118, -383]);
  r.box('MonitorScreen', 0x4ad0ff, [121, 79, -383], [179, 115, -382], { emissive: 0x3ab7ff, intensity: .7, noShadow: true });
  r.box('MonitorStand', 0x1e2430, [146, 74, -386], [154, 80, -370]);
  r.cyl('LampBase', 0xff6b6b, 205, 74, -380, 9, 3);
  r.box('LampArm', 0xff6b6b, [203, 77, -382], [207, 122, -378]);
  r.cone('LampHead', 0xff6b6b, 205, 112, -366, 10, 16, { rot: [Math.PI * .8, 0, 0], open: true, double: true });
  r.cyl('DeskChairBase', 0x333333, 150, 0, -300, 22, 3);
  r.cyl('DeskChairPost', 0x333333, 150, 3, -300, 3, 42);
  r.cyl('DeskChairSeat', 0x4d9de0, 150, 45, -300, 22, 6);
  r.box('DeskChairBack', 0x4d9de0, [130, 51, -282], [170, 95, -277]);
  // Open-backed cubby divider: fly through the open cells.
  const cx0 = 60, cell = 45, panel = 3;
  for (let i = 0; i <= 4; i++) r.box('CubbySide', wood, [cx0 + i * cell, 0, -18], [cx0 + i * cell + panel, 4 * cell + panel, 18]);
  for (let j = 0; j <= 4; j++) r.box('CubbyShelf', wood, [cx0, j * cell, -18], [cx0 + 4 * cell + panel, j * cell + panel, 18]);
  for (const [i, j, c] of [[0, 0, 0xf78154], [2, 0, 0x7bc950], [3, 1, 0xf2c14e], [1, 3, 0xb57ee0]])
    r.box('ToyBin', c, [cx0 + i * cell + 6, j * cell + panel, -14], [cx0 + i * cell + cell - 3, j * cell + 30, 14]);
  // Toy castle on a round rug.
  r.cyl('KidsRug', 0xffffff, -70, 0, 130, 150, 1, { map: 'kidsrug', segments: 40, noShadow: true });
  const castle = [-70, 130], half = 60;
  for (const dx of [-half, half]) for (const dz of [-half, half]) {
    r.cyl('CastleTower', 0xd9d2c3, castle[0] + dx, 0, castle[1] + dz, 18, 110);
    r.cone('CastleRoof', 0xd64545, castle[0] + dx, 110, castle[1] + dz, 23, 42);
    r.cyl('FlagPole', 0x555555, castle[0] + dx, 152, castle[1] + dz, .8, 22, { segments: 6 });
    r.box('Flag', [0x4d9de0, 0xf2c14e, 0x7bc950, 0xb57ee0][(dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0)], [castle[0] + dx, 164, castle[1] + dz - .5], [castle[0] + dx + 14, 173, castle[1] + dz + .5]);
  }
  r.box('CastleWallNorth', 0xcfc6b4, [castle[0] - half, 0, castle[1] - half - 5], [castle[0] + half, 72, castle[1] - half + 5]);
  r.box('CastleWallWest', 0xcfc6b4, [castle[0] - half - 5, 0, castle[1] - half], [castle[0] - half + 5, 72, castle[1] + half]);
  r.box('CastleWallEast', 0xcfc6b4, [castle[0] + half - 5, 0, castle[1] - half], [castle[0] + half + 5, 72, castle[1] + half]);
  r.box('CastleGateLeft', 0xcfc6b4, [castle[0] - half, 0, castle[1] + half - 5], [castle[0] - 22, 72, castle[1] + half + 5]);
  r.box('CastleGateRight', 0xcfc6b4, [castle[0] + 22, 0, castle[1] + half - 5], [castle[0] + half, 72, castle[1] + half + 5]);
  r.box('CastleGateTop', 0xcfc6b4, [castle[0] - 22, 52, castle[1] + half - 5], [castle[0] + 22, 72, castle[1] + half + 5]);
  // Building blocks and a flyable arch.
  const blocks = [0xf25f5c, 0xffe066, 0x247ba0, 0x70c1b3, 0x9b5de5];
  for (const [x, z, n] of [[110, 210, 5], [150, 250, 3], [190, 200, 4], [-200, 30, 6]])
    for (let i = 0; i < n; i++) r.box('Block', blocks[Math.abs(i + x) % blocks.length], [x - 10 + (i % 2) * 3, i * 20, z - 10], [x + 10 + (i % 2) * 3, i * 20 + 20, z + 10], { rough: .5 });
  for (const x of [-42, 22]) r.box('ArchPillar', blocks[x > 0 ? 0 : 2], [x, 0, 290], [x + 20, 70, 310]);
  r.box('ArchTop', blocks[1], [-46, 70, 288], [46, 88, 312]);
  // Hanging planet mobile.
  r.box('MobileBar', 0xffffff, [-30, 248, 148], [150, 251, 152]);
  r.cyl('MobileHook', 0xffffff, 60, 251, 150, .8, 39, { segments: 6, noShadow: true });
  for (const [x, y, rad, color, ring] of [[-20, 210, 14, 0x4d9de0], [40, 222, 22, 0xffc93c], [100, 205, 16, 0xe0a96d, true], [140, 225, 9, 0xd64545]]) {
    r.cyl('MobileString', 0xffffff, x, y + rad, 150, .6, 248 - y - rad, { segments: 5, noShadow: true });
    r.sphere('Planet', color, x, y, 150, rad, color === 0xffc93c ? { emissive: 0xffb000, intensity: .6 } : {});
    if (ring) r.torus('PlanetRing', 0xf1dca7, x, y, 150, rad * 1.7, 1.6, [Math.PI / 2.3, 0, 0]);
  }
  // Beanbag, rocket, wardrobe, window and lamp.
  r.sphere('Beanbag', 0x9b5de5, 195, 24, 330, 45, { scale: [1, .55, 1] });
  r.cyl('ToyRocket', 0xf6f6f6, -205, 0, 300, 13, 95);
  r.cone('RocketNose', 0xd64545, -205, 95, 300, 13, 34);
  for (let i = 0; i < 3; i++) r.box('RocketFin', 0xd64545, [-207, 0, 300], [-203, 30, 324], { rot: [0, i * Math.PI * 2 / 3, 0] }).position.set(-205 + Math.sin(i * 2.094) * 14, 15, 300 + Math.cos(i * 2.094) * 14);
  r.axle('RocketWindow', 0x4ad0ff, -205, 70, 313, 5, 2, 'z', { emissive: 0x3ab7ff, intensity: .6 });
  r.box('Wardrobe', wood, [200, 0, 90], [258, 222, 220], { map: 'planks' });
  r.box('WardrobeSeam', 0x9c7448, [199, 10, 154], [200, 212, 156], { noShadow: true });
  r.box('BedroomWindow', 0xd7efff, [-120, 120, 399], [40, 240, 400], { emissive: 0xcfe8ff, intensity: .85, noShadow: true });
  for (const x of [-132, 40]) r.box('Curtain', 0xf28c5b, [x, 100, 392], [x + 14, 255, 397]);
  r.cyl('CeilingCord', 0xffffff, 0, 262, 0, .8, 28, { segments: 6, noShadow: true });
  r.sphere('CeilingLamp', 0xfffbea, 0, 250, 0, 18, { emissive: 0xfff1c9, intensity: 1.1, noShadow: true });
  r.box('ToyCar', 0x247ba0, [20, 2, 150], [60, 18, 170]);
  for (const x of [26, 54]) for (const z of [150, 170]) r.axle('ToyWheel', 0x222222, x, 6, z, 6, 4, 'z');
  return r.root;
}

function garage() {
  const r = new RoomBuilder('Garage');
  r.shell({ wall: 0xbfc3bd, floor: 0xffffff, floorMap: 'concrete', ceiling: 0xd8dad5, trim: 0x8b8f89 });
  const red = 0xb8322d, chrome = 0xd5d9db, glass = 0x2a3d45, rubber = 0x1c1c1c;
  // Car: fly under the chassis between the wheels.
  r.box('CarBody', red, [-150, 28, -170], [30, 84, 220], { rough: .3, metal: .5 });
  r.box('CarCabin', glass, [-142, 84, -75], [22, 136, 120], { rough: .1, metal: .6 });
  r.box('CarRoof', red, [-138, 136, -68], [18, 142, 112], { rough: .3, metal: .5 });
  r.box('CarHood', red, [-150, 84, -170], [30, 88, -75], { rough: .3, metal: .5 });
  for (const z of [-171, 221]) r.box('Bumper', chrome, [-152, 32, Math.min(z, z + (z < 0 ? -6 : 6))], [32, 46, Math.max(z, z + (z < 0 ? -6 : 6))], { metal: .9, rough: .2 });
  for (const x of [-130, 10]) r.box('Headlight', 0xfff7cc, [x - 14, 58, -178], [x + 14, 72, -176], { emissive: 0xfff1a8, intensity: 1.2, noShadow: true });
  for (const x of [-130, 10]) r.box('Taillight', 0xff3b30, [x - 14, 60, 226], [x + 14, 72, 228], { emissive: 0xff2010, intensity: .9, noShadow: true });
  for (const x of [-161, 41]) for (const z of [-110, 160]) {
    r.axle('Tire', rubber, x, 33, z, 33, 22, 'x', { rough: .9 });
    r.axle('Hubcap', chrome, x + (x < 0 ? -11.5 : 11.5), 33, z, 16, 1.5, 'x', { metal: .9, rough: .2 });
  }
  r.box('Plate', 0xf4f4f0, [-82, 48, 228], [-38, 62, 229], { noShadow: true });
  // Workbench and pegboard.
  r.box('BenchTop', 0x9b6b3d, [-200, 84, -398], [150, 92, -330], { map: 'planks' });
  for (const x of [-195, 145]) for (const z of [-393, -335]) r.box('BenchLeg', 0x7a5530, [x - 4, 0, z - 4], [x + 4, 84, z + 4]);
  r.box('BenchShelf', 0x7a5530, [-196, 22, -394], [146, 26, -334]);
  r.box('Pegboard', 0xc9a46c, [-200, 108, -400], [150, 220, -397], { noShadow: true });
  for (let i = 0; i < 6; i++) {
    const x = -170 + i * 52;
    r.box('ToolHandle', [0xd94f45, 0x333333, 0xf2c14e][i % 3], [x - 2, 140, -397], [x + 2, 190, -393]);
    r.box('ToolHead', 0x8d9294, [x - 9, 186, -397], [x + 9, 196, -392], { metal: .8, rough: .3 });
  }
  r.box('Vise', 0x2f5f8a, [100, 92, -390], [130, 110, -365], { metal: .5 });
  r.box('Toolbox', 0xd23b31, [-150, 92, -390], [-80, 122, -350], { metal: .4, rough: .4 });
  r.box('ToolboxHandle', chrome, [-130, 122, -372], [-100, 126, -368], { metal: .9 });
  // Open steel rack: fly between shelves.
  for (const x of [202, 254]) for (const z of [-298, 58]) r.box('RackPost', 0x4a5258, [x - 2, 0, z - 2], [x + 2, 242, z + 2], { metal: .6 });
  for (const y of [18, 82, 146, 210]) r.box('RackShelf', 0x6c757b, [200, y, -300], [256, y + 3, 60], { metal: .5 });
  for (const [y, z, w, c] of [[21, -280, 40, 0xb48a5a], [21, -180, 50, 0xa67c52], [85, -250, 45, 0xb48a5a], [85, -60, 38, 0xc49a6c], [149, -150, 52, 0xa67c52], [149, 10, 36, 0xb48a5a], [213, -260, 40, 0xc49a6c]])
    r.box('StorageBox', c, [208, y, z], [250, y + 35, z + w]);
  for (let i = 0; i < 4; i++) r.cyl('PaintCan', [0x4d9de0, 0xffffff, 0xf2c14e, 0x7bc950][i], 225, 85, i * 15, 6, 18, { metal: .5 });
  // Drums, tires, water heater and boxes.
  for (const [x, z, c] of [[180, 190, 0x2f5f8a], [180, 258, 0x2f5f8a], [118, 225, 0xb8322d]]) {
    r.cyl('Drum', c, x, 0, z, 30, 88, { metal: .4, rough: .5 });
    for (const y of [22, 66]) r.torus('DrumRib', 0x6c757b, x, y, z, 30.5, 1.5);
  }
  r.axle('DrumOnSide', 0x3c7a44, 130, 30, 330, 30, 86, 'x', { metal: .4 });
  for (let i = 0; i < 4; i++) r.torus('TireStack', rubber, -215, 12 + i * 24, 310, 30, 12, [Math.PI / 2, 0, 0], { rough: .9 });
  r.cyl('WaterHeater', 0xe9ece8, 225, 0, -360, 28, 165, { metal: .3 });
  r.cyl('HeaterPipe', 0xb87333, 225, 165, -360, 3, 125, { metal: .8, segments: 8 });
  for (const [x0, y0, z0, w, h, d] of [[-250, 0, -320, 60, 50, 60], [-250, 50, -315, 50, 40, 50], [-185, 0, -320, 45, 40, 45], [-250, 90, -310, 40, 30, 40]])
    r.box('CardboardBox', 0xb48a5a, [x0, y0, z0], [x0 + w, y0 + h, z0 + d]);
  // Bike on the west wall, ladder, garage door and basketball hoop.
  for (const z of [-40, 70]) r.torus('BikeWheel', 0x222222, -250, 170, z, 32, 2.5, [0, Math.PI / 2, 0]);
  r.box('BikeFrame', 0x2bb3a3, [-252, 168, -40], [-248, 172, 70]);
  r.box('BikeFrameUp', 0x2bb3a3, [-252, 168, 10], [-248, 215, 14]);
  r.box('BikeSeat', 0x222222, [-254, 215, 0], [-246, 219, 24]);
  for (const z of [118, 152]) r.box('LadderRail', 0xd6a531, [-258, 0, z - 2], [-252, 255, z + 2], { metal: .3 });
  for (let y = 20; y < 255; y += 28) r.box('LadderStep', 0xd6a531, [-258, y, 116], [-252, y + 3, 154], { metal: .3 });
  r.box('GarageDoor', 0xdcdcd2, [-210, 0, 396], [210, 255, 399], { noShadow: true });
  for (let y = 50; y < 255; y += 50) r.box('DoorPanelLine', 0xb6b6aa, [-210, y, 395], [210, y + 2, 396], { noShadow: true });
  r.box('Backboard', 0xffffff, [-46, 205, 386], [46, 265, 390]);
  r.box('BackboardSquare', 0xd64545, [-15, 215, 385], [15, 238, 386], { noShadow: true });
  r.torus('Hoop', 0xff7a1a, 0, 215, 366, 20, 1.4, [Math.PI / 2, 0, 0], { metal: .6 });
  r.box('HoopBracket', 0xff7a1a, [-2, 212, 384], [2, 216, 386]);
  r.sphere('Basketball', 0xe8732a, -90, 12, 360, 12);
  // Hanging shop lights.
  for (const [x, z] of [[-60, -170], [-60, 170], [130, 0]]) {
    for (const dx of [-50, 50]) r.cyl('LightChain', 0x555555, x + dx, 282, z, .6, 8, { segments: 5, noShadow: true });
    r.box('ShopLight', 0xffffff, [x - 62, 276, z - 7], [x + 62, 282, z + 7], { emissive: 0xf4fbff, intensity: 1.3, noShadow: true });
  }
  r.box('OilStain', 0x50524f, [-110, 0, -20], [-30, .4, 60], { noShadow: true });
  return r.root;
}

function library() {
  const r = new RoomBuilder('Library');
  r.shell({ wall: 0x2f4a3f, floor: 0xffffff, floorMap: 'darkplanks', ceiling: 0xe8dcc4, trim: 0x5a3a22 });
  const wood = 0x5a3a22, gold = 0xd4af37;
  // Three double-sided bookcase rows form racing aisles; the middle one has a gap.
  const unit = (x0, x1, zc, seed) => {
    const z0 = zc - 20, z1 = zc + 20;
    r.box('CaseSide', wood, [x0, 0, z0], [x0 + 4, 240, z1]);
    r.box('CaseSide', wood, [x1 - 4, 0, z0], [x1, 240, z1]);
    r.box('CaseTop', wood, [x0 - 3, 240, z0 - 3], [x1 + 3, 246, z1 + 3]);
    r.box('CaseBack', 0x3e2818, [x0, 0, zc - 1.5], [x1, 240, zc + 1.5]);
    for (const [k, y] of [10, 65, 120, 175].entries()) {
      r.box('CaseShelf', wood, [x0, y - 3, z0], [x1, y, z1]);
      r.books('Books', x0 + 5, x1 - 5, y, z0 + 2, zc - 2, seed + k, BOOK_COLORS);
      r.books('Books', x0 + 5, x1 - 5, y, zc + 2, z1 - 2, seed + k + 10, BOOK_COLORS);
    }
    r.box('CaseShelf', wood, [x0, 227, z0], [x1, 230, z1]);
  };
  unit(-200, 120, -250, 1);
  unit(-200, -45, -100, 21);
  unit(25, 120, -100, 41);
  unit(-200, 120, 50, 61);
  for (const z of [-292, -268]) r.box('RollingLadderRail', 0x8a5a2b, [-150, 0, z - 2], [-146, 246, z + 2]);
  for (let y = 22; y < 240; y += 26) r.box('RollingLadderStep', 0x8a5a2b, [-150, y, -294], [-146, y + 3, -266]);
  r.box('LadderTrack', 0x9c8a5a, [-200, 236, -274], [120, 239, -271], { metal: .8 });
  // Reading nook.
  r.box('ReadingRug', 0xffffff, [-200, 0, 165], [200, 1, 385], { map: 'rug', noShadow: true });
  for (const x of [-120, 120]) {
    const facing = x < 0 ? 1 : -1;
    r.box('ArmchairSeat', 0x7a2a2a, [x - 38, 0, 230], [x + 38, 45, 300]);
    r.box('ArmchairBack', 0x7a2a2a, [x - 38 * facing - (facing > 0 ? 0 : 14), 0, 230], [x - 38 * facing + (facing > 0 ? 14 : 0), 105, 300]);
    for (const z of [226, 300]) r.box('ArmchairArm', 0x6a2222, [x - 38, 0, z - 6], [x + 38, 66, z + 4]);
  }
  r.cyl('CoffeeTable', wood, 0, 0, 265, 48, 44, { segments: 28 });
  for (let i = 0; i < 4; i++) r.box('TableBook', BOOK_COLORS[i * 2], [-22 + i, 44 + i * 5, 250 - i * 2], [18 + i, 49 + i * 5, 278 - i * 2]);
  r.cyl('GlobeStand', wood, 185, 0, 145, 6, 80);
  r.cyl('GlobeFoot', wood, 185, 0, 145, 22, 4);
  r.sphere('Globe', 0x2d6a9a, 185, 110, 145, 30, { rough: .4 });
  r.torus('GlobeMeridian', gold, 185, 110, 145, 33, 1.6, [0, Math.PI / 4, 0], { metal: .9, rough: .3 });
  // Fireplace with glowing fire.
  r.box('HearthLeft', 0x8a7f74, [228, 0, 180], [258, 130, 200]);
  r.box('HearthRight', 0x8a7f74, [228, 0, 300], [258, 130, 320]);
  r.box('Mantel', 0x6b5d50, [222, 120, 172], [258, 132, 328]);
  r.box('Firebox', 0x1d1512, [248, 0, 200], [258, 120, 300]);
  r.box('ChimneyBreast', 0x8a7f74, [240, 132, 195], [258, 290, 305], { noShadow: true });
  for (const [z, h] of [[225, 34], [250, 46], [275, 30]]) r.cone('Fire', 0xff8c1a, 246, 4, z, 11, h, { emissive: 0xff6a00, intensity: 2, noShadow: true });
  r.axle('Log', 0x4a2f1b, 246, 6, 250, 6, 70, 'z');
  for (const z of [190, 305]) r.cyl('MantelCandle', 0xfff8e7, 240, 132, z, 3, 16);
  r.box('Painting', 0x3a5a40, [257, 160, 205], [258, 250, 295], { noShadow: true });
  r.box('PaintingFrame', gold, [256, 156, 201], [257, 254, 299], { metal: .8, noShadow: true });
  // Clock, desk, windows and chandeliers.
  r.box('GrandfatherClock', 0x4a2c17, [-258, 0, 200], [-226, 212, 240]);
  r.axle('ClockFace', 0xf6efdc, -225, 182, 220, 13, 2, 'x', { emissive: 0xf6efdc, intensity: .3 });
  r.box('Pendulum', gold, [-226, 70, 218], [-225, 140, 222], { metal: .9, noShadow: true });
  r.table('ReadingDesk', wood, [150, -398], [258, -318], 76, { leg: 4 });
  r.cyl('BankerLampBase', gold, 200, 76, -370, 8, 4, { metal: .9 });
  r.cyl('BankerLampStem', gold, 200, 80, -370, 1.5, 26, { metal: .9 });
  r.axle('BankerLampShade', 0x1e6b3a, 200, 108, -370, 7, 34, 'x', { emissive: 0x2fa85a, intensity: .5 });
  r.chair('DeskChair', 0x6a2222, 205, -290, -1);
  for (const x0 of [-180, 10]) {
    r.box('ArchedWindow', 0xcfe2ff, [x0, 100, -400], [x0 + 100, 262, -399], { emissive: 0xbcd6ff, intensity: .8, noShadow: true });
    r.box('Mullion', 0x3e2818, [x0 + 48, 100, -399], [x0 + 52, 262, -397]);
    r.box('Transom', 0x3e2818, [x0, 178, -399], [x0 + 100, 182, -397]);
  }
  for (const [x, y, z, ring] of [[0, 250, 265, 48], [-40, 266, -25, 36]]) {
    r.cyl('ChandelierChain', gold, x, y + 4, z, 1.4, 290 - y - 4, { segments: 6, metal: .9, noShadow: true });
    r.torus('ChandelierRing', gold, x, y, z, ring, 2.6, [Math.PI / 2, 0, 0], { metal: .9, rough: .3 });
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, cx = x + Math.cos(a) * ring, cz = z + Math.sin(a) * ring;
      r.cyl('ChandelierCandle', 0xfff8e7, cx, y + 2, cz, 2.4, 10, { segments: 8 });
      r.sphere('ChandelierFlame', 0xffd27a, cx, y + 15, cz, 2.2, { emissive: 0xffb347, intensity: 2, noShadow: true });
    }
  }
  r.cyl('FernPot', 0x7a5a3a, -230, 0, 370, 20, 34, { top: 24 });
  r.sphere('Fern', 0x3c6e47, -230, 70, 370, 34, { scale: [1.1, .9, 1.1] });
  for (const [x, z, n] of [[160, 60, 5], [-230, -20, 7], [60, 180, 3]])
    for (let i = 0; i < n; i++) r.box('FloorBooks', BOOK_COLORS[(i + n) % BOOK_COLORS.length], [x - 15 + (i % 2) * 2, i * 6, z - 10], [x + 15 + (i % 2) * 2, i * 6 + 6, z + 10]);
  return r.root;
}

export const ROOM_BUILDERS = Object.freeze({ kitchen, bedroom, garage, library });
export function buildRoom(id) {
  const builder = ROOM_BUILDERS[id];
  if (!builder) throw new Error(`Unknown generated room: ${id}`);
  const room = builder();
  room.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.noCastShadow; o.receiveShadow = true; } });
  return room;
}
