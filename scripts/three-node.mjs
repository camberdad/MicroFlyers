// Let Node use the same pinned Three.js as the browser, without npm installation.
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    if (specifier.startsWith('three/addons/')) {
      return { url: new URL(`../vendor/three/examples/jsm/${specifier.slice('three/addons/'.length)}`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
