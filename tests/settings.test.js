import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindWildlifeInput, createWaterWildlife } from '../src/engine/wildlife.js';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('date is paint: no handler, focus target, or readout hit exclusion', () => {
  const overlay = read('../src/app/overlay.js');
  assert.match(overlay, /<div class="overlay__date" data-el="date"><\/div>/);
  assert.doesNotMatch(overlay, /el\.date\.(?:on\w+|addEventListener|tabIndex)/);
  assert.match(read('../src/styles.css'), /\.overlay__date\s*\{[^}]*pointer-events: none/);
  const listeners = new Map(); let hit = false;
  const target = { addEventListener: (n,f) => listeners.set(n,f) };
  const canvas = { clientWidth:390, clientHeight:844, getBoundingClientRect:()=>({left:0,top:0,width:390,height:844}), ownerDocument:{getElementById:()=>({getBoundingClientRect:()=>({left:0,top:0,right:300,bottom:200})})} };
  bindWildlifeInput(target,canvas,()=>true,()=>{hit=true;});
  const e={pointerId:1,button:0,clientX:50,clientY:120,timeStamp:0,target:{closest:()=>null}};
  listeners.get('pointerdown')(e); listeners.get('pointerup')({...e,timeStamp:100});
  assert.ok(hit, 'Tap under date reaches wildlife');
});
test('fish hit checks existing bodies without throwing fish into empty water', () => {
  const fish = createWaterWildlife(()=>.5);
  fish.setWater({width:390,shore:500,alpha:1,bottom:()=>700});
  assert.equal(fish.hit(100,520,390),false);
  assert.equal(fish.state.fishes.length,0);
  fish.interact(100,520);
  assert.equal(fish.hit(100,520,390),true);
  assert.equal(fish.state.fishes.length,1);
});
test('settings has no forecast markup or focus zoom trigger', () => {
  assert.doesNotMatch(read('../index.html'), /forecast__|back-to-now|preview-caption|menu__handle/);
  assert.doesNotMatch(read('../src/app/overlay.js'), /forecast__|Choose an hour/);
  assert.match(read('../src/styles.css'), /\.menu button, \.menu input, \.menu select\s*\{[^}]*font-size: 16px/);
  assert.doesNotMatch(read('../src/app/forecastMenu.js'), /\.focus\(\)/);
  assert.doesNotMatch(read('../index.html'), /user-scalable|maximum-scale/);
});
