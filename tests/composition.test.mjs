import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeConfig,layoutScale,layerState} from '../src/model.js';

const folder='examples/frieren';
const composition=JSON.parse(await readFile(`${folder}/composition.json`,'utf8'));
const themes={};
for(const [name,file] of [['desktop','banner'],['mobile','mobile']]) themes[name]=normalizeConfig(JSON.parse(await readFile(`${folder}/assets/${file}.json`,'utf8')));

for(const width of [280,320,360,375,390,412,430,600,640,767,768,820,1024,1280,1366,1440,1920,2560,3440,3840,5120]) {
  test(`all three character heads remain inside ${width}px at both motion extremes`,()=>{
    const mobile=width<=767,config=themes[mobile?'mobile':'desktop'];
    const height=width<=config.height.breakpoint?config.height.mobile:Math.min(config.height.max,Math.max(config.height.min,width*config.height.ratio));
    const subject=config.layers.find(layer=>layer.id.endsWith('party'));
    assert.equal(subject.fit,'contain');
    const scale=layoutScale(config,subject,width,height)*subject.scale;
    const left=(width-config.baseWidth*scale)*subject.position[0],top=(height-config.baseHeight*scale)*subject.position[1];
    for(const entry of composition.source.subjects) {
      let [x,y,w,h]=entry.bounds;
      if(mobile) {
        const art=composition.mobile,ratio=art.characterWidth/art.sourceCrop.width;
        x=(x-art.sourceCrop.left)*ratio-art.cropLeft;
        y=(y-art.sourceCrop.top)*ratio+art.height-Math.round(art.sourceCrop.height*ratio);
        w*=ratio;h*=ratio;
      }
      for(const progress of [-1,-.55,0,.55,1]) {
        const motion=layerState(subject,progress*config.interaction.strength,scale/subject.scale);
        const bounds={left:left+x/config.pixelRatio*scale+motion.x,top:top+y/config.pixelRatio*scale+motion.y,
          right:left+(x+w)/config.pixelRatio*scale+motion.x,bottom:top+(y+h)/config.pixelRatio*scale+motion.y};
        assert.ok(bounds.left>=4&&bounds.right<=width-4&&bounds.top>=4&&bounds.bottom<=height-4,
          `${entry.name} cropped at ${width}px, progress ${progress}: ${JSON.stringify(bounds)}`);
      }
    }
  });
}

test('mobile composition uses a proportional height instead of a fixed cropped 180px strip',()=>{
  const config=themes.mobile;
  assert.equal(config.height.breakpoint,0);
  assert.equal(config.height.ratio,config.baseHeight/config.baseWidth);
  assert.equal(config.baseWidth*config.pixelRatio,composition.mobile.width);
  assert.equal(config.baseHeight*config.pixelRatio,composition.mobile.height);
});
