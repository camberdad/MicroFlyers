export const MAPS = Object.freeze({
  living: Object.freeze({ id:'living', name:'The Living Room', number:'01', asset:'InteriorTest.fbx', description:'Skim the sofa. Bank around the bookshelf.', sourceBounds:[[-249,0,-399],[249,298,399]] }),
  dining: Object.freeze({ id:'dining', name:'The Dining Room', number:'02', asset:'dining-room.glb', description:'Thread the dining chairs. Skim the table and shelves.', sourceBounds:[[-201,0,-1512],[1030,297,-508]] }),
});
// 1:100 replaces the previous 1:60 miniature: 60% of its former dimensions.
export const MINIATURE_RATIO = 100;
export const JET_SCALE = .68 * 60 / MINIATURE_RATIO;
export const PLAYER_CORE_RADIUS = .13;
