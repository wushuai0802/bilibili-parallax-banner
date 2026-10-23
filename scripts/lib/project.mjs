import {normalizeConfig} from '../../src/model.js';
import {normalizeTheme} from '../../src/theme-model.js';

export const PRESETS={
  desktop:{canvas:[1920,216],pixelRatio:2,height:{min:190,max:280,ratio:.125,mobile:180,breakpoint:0},strength:1,
    viewports:[768,1024,1280,1440,1920,2560,3440,5120],textZones:[{id:'site-title',rect:[.04,.45,.3,.5]}],subjectBox:[.44,.06,.52,.94],offsets:{background:[6,0],subject:[24,0],foreground:[64,6],detail:[12,0]}},
  mobile:{canvas:[375,200],pixelRatio:3,height:{min:120,max:280,ratio:200/375,mobile:180,breakpoint:0},strength:.65,
    viewports:[280,320,360,375,390,412,430,600,767],textZones:[{id:'site-title',rect:[.048,.05,.6,.32]}],subjectBox:[.04,.42,.92,.58],offsets:{background:[2,0],subject:[8,0],foreground:[20,2],detail:[4,0]}},
};
const roles=new Set(['background','subject','foreground','detail']);
const allowed=new Set(['$schema','version','name','artwork','background','layers','variants','breakpoint','minimumMargin','motion','preview','preserve']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const keys=(value,allowed,label)=>{
  if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw new TypeError(`${label} must be an object`);
  for(const key of Object.keys(value??{}))if(!allowed.includes(key))throw new TypeError(`Unknown ${label} field: ${key}`);
};

export function rectangle(value,label) {
  if(!Array.isArray(value)||value.length!==4||!value.every(finite)||value[2]<=0||value[3]<=0)throw new TypeError(`${label} must be [x,y,width,height] with positive dimensions`);
  return value;
}
export function normalizeProject(input) {
  if(!input||input.version!==1)throw new TypeError('Unsupported project version');
  for(const key of Object.keys(input))if(!allowed.has(key))throw new TypeError(`Unknown project field: ${key}`);
  if(typeof input.name!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(input.name))throw new TypeError('Project name must be a lowercase ASCII slug');
  for(const key of ['author','source','license'])if(typeof input.artwork?.[key]!=='string'||!input.artwork[key].trim())throw new TypeError(`artwork.${key} must be recorded`);
  if(!Array.isArray(input.layers)||!input.layers.length||input.layers.length>32)throw new TypeError('Project requires 1 to 32 source layers');
  keys(input.preserve,['reference'],'preserve');
  if(input.preserve&&(typeof input.preserve.reference!=='string'||!input.preserve.reference.trim()))throw new TypeError('preserve.reference must name the original image');
  keys(input.preview,['brand','title','subtitle','eyebrow','proofWidths'],'preview');
  if(input.preview?.proofWidths&&(!Array.isArray(input.preview.proofWidths)||!input.preview.proofWidths.length||input.preview.proofWidths.some(width=>!Number.isInteger(width)||width<1||width>10000)))throw new TypeError('proofWidths must contain positive integer container widths');
  const ids=new Set();
  for(const [index,layer] of input.layers.entries()) {
    keys(layer,['id','role','src','regions','layout','runtime'],'source layer');
    if(!layer||typeof layer.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(layer.id)||ids.has(layer.id))throw new TypeError('Source layers need unique lowercase ASCII ids');
    ids.add(layer.id);
    if(!roles.has(layer.role))throw new TypeError(`Unknown role for ${layer.id}`);
    if((index===0)!==(layer.role==='background'))throw new TypeError('Use exactly one background as the first source layer');
    if(typeof layer.src!=='string'||!layer.src.trim())throw new TypeError(`Missing source for ${layer.id}`);
  }
  for(const key of Object.keys(input.variants??{}))if(!['desktop','mobile'].includes(key))throw new TypeError(`Unknown variant: ${key}`);
  const variants={};
  for(const name of ['desktop','mobile']) {
    const preset=PRESETS[name],variant=input.variants?.[name]??{};
    keys(variant,['canvas','pixelRatio','height','interaction','layers','description','viewports','textZones'],'variant');
    for(const key of Object.keys(variant.layers??{}))if(!ids.has(key))throw new TypeError(`Unknown layer override: ${key}`);
    const [baseWidth,baseHeight]=variant.canvas??preset.canvas,pixelRatio=variant.pixelRatio??preset.pixelRatio;
    const width=baseWidth*pixelRatio,height=baseHeight*pixelRatio;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>40_000_000)throw new TypeError('Export canvas must have integer pixel dimensions within 40 megapixels');
    const config=normalizeConfig({baseWidth,baseHeight,pixelRatio,background:input.background??'#173d42',
      description:variant.description??input.preview?.title??input.name,height:variant.height??(variant.canvas?{...preset.height,ratio:baseHeight/baseWidth}:preset.height),
      interaction:{enabled:true,touch:'drag',resetDuration:200,strength:preset.strength,...variant.interaction},layers:input.layers.map(layer=>{
        const override=variant.layers?.[layer.id]??{};
        keys(override,['src','regions','layout','runtime'],'layer override');
        const definition={...layer,...override,runtime:{...layer.runtime,...override.runtime}};
        keys(definition.runtime,['name','fit','position','offset','initial','scale','opacity','rotate','blur','required'],'runtime');
        const regions=definition.regions??[];
        if(!Array.isArray(regions)||regions.some(region=>!region||typeof region.id!=='string'||!region.id.trim()))throw new TypeError(`Invalid protected regions for ${layer.id}`);
        if(layer.role==='subject'&&!regions.length)throw new TypeError(`Mark at least one important source region for ${layer.id}`);
        regions.forEach(region=>rectangle(region.rect,`${layer.id}/${region.id}`));
        const layout={fit:layer.role==='background'?'cover':'contain',trim:layer.role!=='background',anchor:layer.role==='background'?[.5,.5]:[.5,1],...definition.layout};
        keys(layout,['fit','trim','anchor','box','crop'],'layout');
        if(typeof layout.trim!=='boolean')throw new TypeError('layout.trim must be a boolean');
        if(!['cover','contain','fill'].includes(layout.fit))throw new TypeError(`Invalid source fit for ${layer.id}`);
        if(layout.box)rectangle(layout.box,`${layer.id}.layout.box`);
        if(layout.crop)rectangle(layout.crop,`${layer.id}.layout.crop`);
        if(!Array.isArray(layout.anchor)||layout.anchor.length!==2||layout.anchor.some(value=>!finite(value)||value<0||value>1))throw new TypeError('Layout anchor must have two values in [0,1]');
        return {id:layer.id,src:definition.src,fit:layer.role==='subject'?'contain':'canvas',position:[.5,1],
          offset:preset.offsets[layer.role],required:['background','subject'].includes(layer.role),requireAlpha:layer.role!=='background',...definition.runtime,
          source:{...definition,layout,regions}};
      })});
    const boundary=input.breakpoint??767;
    const widths=[...new Set([...preset.viewports,name==='mobile'?boundary:boundary+1])].filter(width=>name==='mobile'?width<=boundary:width>boundary).sort((a,b)=>a-b);
    variants[name]={...variant,config,viewports:variant.viewports??widths,textZones:variant.textZones??preset.textZones};
  }
  const theme=normalizeTheme({...input,variants:Object.fromEntries(Object.entries(variants).map(([name,value])=>[name,{config:value.config}]))});
  return {...input,breakpoint:theme.breakpoint,minimumMargin:input.minimumMargin??4,motion:theme.motion,variants};
}

export function defaultBox(project,name,layer) {
  if(layer.source.layout.box)return layer.source.layout.box;
  if(layer.source.role!=='subject')return [0,0,1,1];
  const subjects=project.variants[name].config.layers.filter(item=>item.source.role==='subject');
  const [x,y,w,h]=PRESETS[name].subjectBox,index=subjects.findIndex(item=>item.id===layer.id);
  return [x+w/subjects.length*index,y,w/subjects.length,h];
}
