// Generated rooms share one inner volume (cm): x ±260, z ±400, ceiling 290.
const GENERATED_BOUNDS = Object.freeze([[-258,0,-398],[258,288,398]]);
export const MAPS = Object.freeze({
  living: Object.freeze({ id:'living', name:'The Living Room', number:'01', asset:'InteriorTest.fbx', description:'Skim the sofa. Bank around the bookshelf.', sourceBounds:[[-249,0,-399],[249,298,399]], theme:{background:0xd6d9ce} }),
  dining: Object.freeze({ id:'dining', name:'The Dining Room', number:'02', asset:'dining-room.glb', description:'Thread the dining chairs. Skim the table and shelves.', sourceBounds:[[-201,0,-1512],[1030,297,-508]], theme:{background:0xd6d9ce} }),
  kitchen: Object.freeze({ id:'kitchen', name:'The Kitchen', number:'03', asset:'generated', generator:'kitchen', description:'Dive under the pendant lights. Loop the island and the fan.', sourceBounds:GENERATED_BOUNDS, spawn:[0,150,330], heading:0, theme:{background:0xf1e7d3} }),
  bedroom: Object.freeze({ id:'bedroom', name:"The Kids' Bedroom", number:'04', asset:'generated', generator:'bedroom', description:'Slip between the bunks. Storm the toy castle and the cubbies.', sourceBounds:GENERATED_BOUNDS, spawn:[0,165,330], heading:0, theme:{background:0xcfe3f0} }),
  garage: Object.freeze({ id:'garage', name:'The Garage', number:'05', asset:'generated', generator:'garage', description:'Fly under the car. Weave the shelving racks. Shoot some hoops.', sourceBounds:GENERATED_BOUNDS, spawn:[40,170,330], heading:0, theme:{background:0xbfc3bd} }),
  library: Object.freeze({ id:'library', name:'The Grand Library', number:'06', asset:'generated', generator:'library', description:'Race the bookcase aisles. Circle the chandeliers by firelight.', sourceBounds:GENERATED_BOUNDS, spawn:[180,170,335], heading:0, theme:{background:0x2f4a3f} }),
});
export const MAP_ORDER = Object.freeze(['living','dining','kitchen','bedroom','garage','library']);
// V11 halves the previous 1:100 player jet in every dimension.
export const MINIATURE_RATIO = 200;
export const JET_SCALE = .68 * 60 / MINIATURE_RATIO;
export const PLAYER_CORE_RADIUS = .065;
