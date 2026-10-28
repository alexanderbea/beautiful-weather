import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { holidayFor, easterSunday } from '../src/engine/holidays.js';

const at = (y, m, d, hour = 12) => new Date(y, m - 1, d, hour);
test('inclusive fixed windows and adjacent days, including year rollover', () => {
  for (const [name,y,m,start,end] of [
    ['halloween',2026,10,24,31], ['christmas',2026,12,24,26],
    ['valentine',2026,2,14,14], ['new-year',2026,12,31,32],
    ['easter',2027,3,26,29], ['midsummer',2026,6,19,21],
  ]) {
    assert.equal(holidayFor(at(y,m,start-1)), null);
    for(let d=start;d<=end;d++) for(const h of [0,12,23]) assert.equal(holidayFor(at(y,m,d,h)),name);
    assert.equal(holidayFor(at(y,m,end+1)),null);
  }
});
test('Computus and Friday rule across years, with no extra holiday days', () => {
  assert.equal(easterSunday(2024).getDate(),31);
  assert.equal(easterSunday(2024).getMonth(),2);
  for(let y=2020;y<=2040;y++) {
    const counts = {};
    for(let d=at(y,1,1);d.getFullYear()===y;d.setDate(d.getDate()+1)) {
      const name = holidayFor(d);
      if(name) counts[name]=(counts[name]??0)+1;
      if(name==='midsummer' && d.getDay()===5) assert.ok(d.getDate()>=19 && d.getDate()<=25);
    }
    assert.deepEqual(counts,{'new-year':2,valentine:1,easter:4,midsummer:3,halloween:8,christmas:3});
  }
  assert.equal(holidayFor(at(2026,7,15)),null);
  assert.equal(holidayFor(new Date(NaN)),null);
});
test('local dates across UTC offsets and DST Easter boundary', () => {
  for(const tz of ['Europe/Stockholm','America/Los_Angeles','Pacific/Kiritimati']) {
    execFileSync(process.execPath,['--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import { holidayFor } from './src/engine/holidays.js';
      for (const [m,d,expected] of [[10,24,'halloween'],[10,31,'halloween'],[11,1,null]]) {
        for(const h of [0,23]) assert.equal(holidayFor(new Date(2026,m-1,d,h,59)),expected);
      }
      for(let d=26;d<=29;d++) assert.equal(holidayFor(new Date(2027,2,d,0,1)),'easter');
      assert.equal(holidayFor(new Date(2027,2,30,0,1)),null);
    `],{env:{...process.env,TZ:tz}});
  }
});

test('engine reevaluates midnight and return from background without resetting wildlife; cleans timers/listeners', async t => {
  const { createEngine } = await import('../src/engine/engine.js');
  const RealDate = Date;
  let date = new RealDate(2026,9,31,23,59), frame, timer;
  const listeners = new Map();
  const noop = () => {};
  const events = { addEventListener: (name,fn) => listeners.set(name,fn), removeEventListener: name => listeners.delete(name) };
  const ctx = new Proxy({}, { get: (_,key) => /create.*Gradient/.test(key) ? () => ({addColorStop:noop}) : noop });
  const canvas = () => ({style:{},getContext:()=>ctx});
  const globals = {
    Date: class extends RealDate { constructor(...args) { super(...(args.length?args:[date.getTime()])); } },
    window:{...events,innerWidth:390,innerHeight:844,location:{search:''}},
    document:{...events,hidden:false,documentElement:events,createElement:canvas},
    Path2D:class {moveTo(){} lineTo(){} closePath(){} rect(){}},
    requestAnimationFrame: fn => {frame=fn;return 1;},cancelAnimationFrame:noop,
    setTimeout:fn=>{timer=fn;return 7;},clearTimeout:id=>{assert.equal(id,7);timer=null;},
  };
  const restore=[];
  for(const [key,value] of Object.entries(globals)) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    restore.push(()=>descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]);
  }
  let engine;
  t.after(()=>{engine?.destroy();restore.forEach(fn=>fn());});
  engine=createEngine(canvas()); engine.setWeather({condition:'clear',isDay:false},{immediate:true});engine.start();
  assert.equal(engine.state.holiday,'halloween');
  date=new RealDate(2026,10,1);frame(performance.now()+16);
  assert.equal(engine.state.holiday,null);
  engine.stop();date=new RealDate(2027,2,26);timer();
  assert.equal(engine.state.holiday,'easter','paused canvas still observes the calendar');
  date=new RealDate(2027,2,30);listeners.get('focus')();assert.equal(engine.state.holiday,null);
  date=new RealDate(2026,9,28);listeners.get('visibilitychange')();assert.equal(engine.state.holiday,'halloween');
  const wildlife=engine.state.wildlife;listeners.get('pageshow')();assert.deepEqual(engine.state.wildlife,wildlife);
  engine.destroy();engine=null;assert.equal(timer,null);assert.equal(listeners.size,0);
});
