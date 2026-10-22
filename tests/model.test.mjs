import test from 'node:test';
import assert from 'node:assert/strict';
import {alignedScale, bezierAt, fromBilibiliSplitLayer, layerState, normalizeConfig, resolveAssetUrl} from '../src/model.js';

const config = () => normalizeConfig({layers:[{src:'bg.svg',offset:[6,0]},{src:'fg.svg',offset:[64,12]}]});

for (const width of [375,1280,1920,2560,3440]) {
  test(`aligned canvas covers ${width}px at both displacement extremes`, () => {
    const value = config();
    const height = width <= 640 ? 144 : Math.min(240,Math.max(155,width*.09375));
    const scale = alignedScale(value,width,height);
    for (const layer of value.layers) for (const progress of [-1,0,1]) {
      const motion = layerState(layer,progress,height/value.baseHeight);
      const w = value.baseWidth * scale * layer.scale;
      const h = value.baseHeight * scale * layer.scale;
      assert.ok(w/2-Math.abs(motion.x) >= width/2);
      assert.ok(h/2-Math.abs(motion.y) >= height/2);
    }
  });
}

test('all aligned layers use one shared canvas scale', () => {
  const value=config(); const scale=alignedScale(value,1920,180);
  assert.equal(value.layers[0].scale,value.layers[1].scale);
  assert.ok(scale>1);
});

test('Bilibili adapter preserves native geometry, initial values and height scaling', () => {
  const value=fromBilibiliSplitLayer({version:'1',layers:[{id:7,resources:[{src:'cloud.png'}],
    scale:{initial:.87,offset:.2},translate:{initial:[4,-2],offset:[90,15]},
    rotate:{initial:5,offset:8},blur:{initial:2,offset:4},opacity:{initial:.7,offset:.1}}]});
  const state=layerState(value.layers[0],.5,2);
  assert.equal(value.mode,'bilibili'); assert.equal(value.baseHeight,155); assert.equal(value.pixelRatio,1);
  assert.ok(Math.abs(state.x-(4+90*.5)*2*.87)<1e-8);
  assert.ok(Math.abs(state.y-(-2+15*.5)*2*.87)<1e-8);
  assert.equal(state.scale,1.1);assert.equal(state.rotate,9);assert.equal(state.blur,4);
});

test('bezier remapping is signed and deterministic', () => {
  const points=[.25,.1,.25,1];
  assert.ok(Math.abs(bezierAt(-.5,points)+bezierAt(.5,points))<1e-8);
  assert.ok(bezierAt(.5,points)>.5);
});

test('unsupported extensions and duplicate identities fail explicitly', () => {
  assert.throws(()=>fromBilibiliSplitLayer({version:'1',layers:[],extensions:{time:{}}}),/extensions/);
  assert.throws(()=>normalizeConfig({layers:[{id:'x',src:'a'},{id:'x',src:'b'}]}),/Duplicate/);
  assert.throws(()=>normalizeConfig({layers:[{src:'x',scale:NaN}]}),/finite/);
});

test('JSON-relative paths resolve against manifest location and unsafe schemes fail', () => {
  assert.equal(resolveAssetUrl('fg.webp','https://example.org/banners/summer/banner.json'),'https://example.org/banners/summer/fg.webp');
  assert.throws(()=>resolveAssetUrl('javascript:alert(1)','https://example.org'),/protocol/);
});

test('alternate opacity and negative blur remain bounded', () => {
  const value=fromBilibiliSplitLayer({version:'1',layers:[{resources:[{src:'x'}],opacity:{initial:.9,offset:.5,wrap:'alternate'},blur:{initial:1,offset:-4}}]});
  const state=layerState(value.layers[0],1,1);
  assert.ok(Math.abs(state.opacity-.6)<1e-8);assert.equal(state.blur,0);
});
