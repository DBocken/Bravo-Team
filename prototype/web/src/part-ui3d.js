// Haunted-diorama renderer (three.js, fully procedural — no assets) + UI glue.
if(typeof document!=="undefined"){(function(){
const $=(q)=>document.querySelector(q);
let sim=null,sel=null,sprint=false,rings=[];
const REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
let tut=null,tutMarker=null;
// ---- movement tweens over tile-space waypoints (consumed by render loop)
const anim={};let tweens=[];
function animPos(name,fb){if(!anim[name])anim[name]={x:fb[0],y:fb[1]};return anim[name]}
function startWalk(name,pts,perTile=95){if(REDUCED||pts.length<2){
    anim[name]={x:pts[pts.length-1][0],y:pts[pts.length-1][1]};return}
  tweens=tweens.filter(t=>t.name!==name);
  tweens.push({name,pts,t0:performance.now(),dur:(pts.length-1)*perTile})}
function syncAnim(){for(const s of sim.squad){const a=animPos(s.name,s.pos);
    if(!tweens.some(t=>t.name===s.name)&&(a.x!==s.pos[0]||a.y!==s.pos[1]))
      startWalk(s.name,[[a.x,a.y],s.pos],130)}
  const g=animPos("ghost",sim.gpos);
  if(!tweens.some(t=>t.name==="ghost")&&(g.x!==sim.gpos[0]||g.y!==sim.gpos[1]))
    startWalk("ghost",[[g.x,g.y],sim.gpos],60)}
function layoutHUD(){const a=$("#acts"),t=$("#tutcard"),
  r=document.documentElement;
  if(a)r.style.setProperty("--actsH",a.offsetHeight+"px");
  r.style.setProperty("--tutH",
    (t&&t.classList.contains("on")?t.offsetHeight:0)+"px")}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("on");
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),2200)}

// ================= THREE scene =================
let R=null;           // renderer bundle
const TEX={},GEO={},MAT={};
const SRC={};   // name -> source canvas (for normal-map derivation)
function anisotropy(t){if(R&&R.renderer&&t)
    t.anisotropy=R.renderer.capabilities.getMaxAnisotropy();
  return t}
// Canvas pixels are authored in sRGB. Left undeclared, three feeds them to
// the lighting maths as if they were linear and the composite gammas them a
// second time — every surface lifts toward mid-grey and the whole frame
// reads as washed out. Colour maps get decoded; normal maps must NOT.
const SRGB=THREE.sRGBEncoding||3001;
function asColor(t){t.encoding=SRGB;t.needsUpdate=true;return t}
// Drawn in a 128 grid but rasterised at 256 so the pattern is unchanged and
// simply carries twice the detail — the surfaces stop smearing under zoom.
const TEXSS=2;
function tex(name,fn,rw=1,rh=1){if(TEX[name])return TEX[name];
  const c=document.createElement("canvas");c.width=c.height=128*TEXSS;
  const g=c.getContext("2d");g.scale(TEXSS,TEXSS);
  fn(g,128,128);
  SRC[name]=c;
  const t=asColor(new THREE.CanvasTexture(c));
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rw,rh);
  TEX[name]=t;return t}
// Sobel height->normal: gives every procedural surface real relief under the
// point lights, at zero asset cost.
function normalOf(name,strength=2.4){const k="n:"+name;
  if(TEX[k])return TEX[k];
  const src=SRC[name];if(!src)return null;
  const w=src.width,h=src.height;
  const d=src.getContext("2d").getImageData(0,0,w,h).data;
  const L=(x,y)=>{x=(x+w)%w;y=(y+h)%h;const i=(y*w+x)*4;
    return (d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255};
  const out=document.createElement("canvas");out.width=w;out.height=h;
  const og=out.getContext("2d"),od=og.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let nx=(L(x-1,y)-L(x+1,y))*strength,ny=(L(x,y-1)-L(x,y+1))*strength,nz=1;
    const len=Math.hypot(nx,ny,nz);nx/=len;ny/=len;nz/=len;
    const i=(y*w+x)*4;
    od.data[i]=(nx*0.5+0.5)*255;od.data[i+1]=(ny*0.5+0.5)*255;
    od.data[i+2]=(nz*0.5+0.5)*255;od.data[i+3]=255}
  og.putImageData(od,0,0);
  const t=new THREE.CanvasTexture(out);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;TEX[k]=t;return t}
function surface(color,mapName,rough=0.92){
  const o={color,roughness:rough,metalness:0.0};
  if(mapName){o.map=TEX[mapName];const n=normalOf(mapName);
    if(n){o.normalMap=n;o.normalScale=new THREE.Vector2(0.7,0.7)}}
  return new THREE.MeshStandardMaterial(o)}
function noise(g,w,h,alpha,n=900){for(let i=0;i<n;i++){
  g.fillStyle="rgba("+(Math.random()<.5?"0,0,0":"255,255,255")+","+
    (Math.random()*alpha)+")";
  g.fillRect(Math.random()*w,Math.random()*h,2,2)}}
function texAO(g,w,h){g.strokeStyle="rgba(0,0,0,.34)";g.lineWidth=7;
  g.strokeRect(3,3,w-6,h-6)}
function floorKind(kind){return tex("f_"+kind,(g,w,h)=>{
  if(kind==="wood"||kind==="wooddark"){
    g.fillStyle=kind==="wood"?"#8f8f8f":"#6f6a62";g.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=21){g.fillStyle=((y/21)%2?"rgba(0,0,0,.09)":"rgba(255,255,255,.05)");
      g.fillRect(0,y,w,21);
      g.strokeStyle="rgba(0,0,0,.4)";g.beginPath();g.moveTo(0,y+.5);g.lineTo(w,y+.5);g.stroke();
      for(let i=0;i<2;i++){const x=Math.random()*w;
        g.strokeStyle="rgba(0,0,0,.28)";g.beginPath();g.moveTo(x,y);g.lineTo(x,y+21);g.stroke()}}
    noise(g,w,h,.09)}
  else if(kind==="tile"){
    g.fillStyle="#8d9294";g.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=32)for(let x=0;x<w;x+=32){
      g.fillStyle=((x+y)/32)%2?"#878c8f":"#93989a";g.fillRect(x,y,32,32)}
    g.strokeStyle="rgba(30,35,40,.5)";
    for(let i=0;i<=w;i+=32){g.beginPath();g.moveTo(i+.5,0);g.lineTo(i+.5,h);g.stroke();
      g.beginPath();g.moveTo(0,i+.5);g.lineTo(w,i+.5);g.stroke()}
    noise(g,w,h,.06)}
  else if(kind==="stone"){
    g.fillStyle="#77797c";g.fillRect(0,0,w,h);
    for(let i=0;i<10;i++){g.fillStyle="rgba("+(Math.random()<.5?"0,0,0":"255,255,255")+",.07)";
      g.fillRect(Math.random()*w,Math.random()*h,20+Math.random()*40,14+Math.random()*30)}
    g.strokeStyle="rgba(0,0,0,.35)";
    for(let i=0;i<7;i++){g.strokeRect(Math.random()*w,Math.random()*h,
      24+Math.random()*36,18+Math.random()*26)}
    noise(g,w,h,.14,1300)}
  else if(kind==="carpet"){
    g.fillStyle="#8b8378";g.fillRect(0,0,w,h);noise(g,w,h,.16,2400);
    g.strokeStyle="rgba(0,0,0,.25)";g.lineWidth=4;g.strokeRect(8,8,w-16,h-16)}
  else{g.fillStyle="#85878a";g.fillRect(0,0,w,h);noise(g,w,h,.11,1500)}
  texAO(g,w,h)})}
const ROOMFLOOR={Kitchen:"tile",Pantry:"wood",Mudroom:"concrete",Bedroom:"carpet",
  Cellar:"stone",Hall:"wood",Bathroom:"tile",Living:"carpet",Foyer:"wood",
  Study:"wooddark",Van:"concrete"};
function floorTex(){return tex("floor",(g,w,h)=>{
  g.fillStyle="#8a8a8a";g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=16){g.fillStyle=(y/16)%2?"#818181":"#8f8f8f";
    g.fillRect(0,y,w,16);
    g.strokeStyle="rgba(0,0,0,.35)";g.beginPath();g.moveTo(0,y+.5);
    g.lineTo(w,y+.5);g.stroke();
    for(let i=0;i<3;i++){const x=Math.random()*w;
      g.strokeStyle="rgba(0,0,0,.25)";
      g.beginPath();g.moveTo(x,y);g.lineTo(x,y+16);g.stroke()}}
  noise(g,w,h,.10)})}
function wallTex(){return tex("wall",(g,w,h)=>{
  g.fillStyle="#9a948c";g.fillRect(0,0,w,h);
  for(let i=0;i<160;i++){                       // plaster mottling
    g.fillStyle="rgba("+(Math.random()<.5?"0,0,0":"255,255,255")+","+
      (Math.random()*0.12)+")";
    g.beginPath();g.arc(Math.random()*w,Math.random()*h,
      2+Math.random()*9,0,7);g.fill()}
  noise(g,w,h,.16,1800);
  g.strokeStyle="rgba(0,0,0,.28)";g.lineWidth=1.4;
  for(let i=0;i<7;i++){g.beginPath();                    // hairline cracks
    let x=Math.random()*w,y=0;g.moveTo(x,y);
    while(y<h){x+=(Math.random()-0.5)*16;y+=8+Math.random()*13;g.lineTo(x,y)}
    g.stroke()}
  g.lineWidth=1;
  g.fillStyle="rgba(0,0,0,.30)";g.fillRect(0,h-13,w,13);  // skirting shadow
  g.fillStyle="rgba(255,255,255,.06)";g.fillRect(0,h-13,w,3)})}
function doorTex(){return tex("door",(g,w,h)=>{
  g.fillStyle="#6B5B3E";g.fillRect(0,0,w,h);
  for(let i=0;i<3;i++){                                   // four vertical boards
    g.strokeStyle="rgba(0,0,0,.45)";g.beginPath();
    g.moveTo((i+1)*w/4,0);g.lineTo((i+1)*w/4,h);g.stroke()}
  for(let i=0;i<90;i++){                                   // grain
    g.strokeStyle="rgba(0,0,0,"+(Math.random()*0.18)+")";
    const y=Math.random()*h;g.beginPath();g.moveTo(0,y);
    g.bezierCurveTo(w*0.3,y+3,w*0.6,y-3,w,y);g.stroke()}
  g.strokeStyle="rgba(0,0,0,.5)";g.lineWidth=5;
  g.strokeRect(9,9,w-18,h-18);                             // inset panel
  g.lineWidth=1;
  g.fillStyle="rgba(255,255,255,.10)";g.fillRect(11,11,w-22,4);
  g.fillStyle="#C8B98A";                                   // handle
  g.beginPath();g.arc(w-20,h/2,5.5,0,7);g.fill();
  noise(g,w,h,.10,700)})}
function grassTex(){return tex("grass",(g,w,h)=>{
  g.fillStyle="#1B2126";g.fillRect(0,0,w,h);
  for(let i=0;i<70;i++){g.fillStyle="rgba(255,255,255,"+(Math.random()*0.03)+")";
    g.fillRect(Math.random()*w,Math.random()*h,10+Math.random()*26,
      8+Math.random()*20)}})}
function saltTex(scoured){return tex(scoured?"salt2":"salt",(g,w,h)=>{
  g.clearRect(0,0,w,h);g.fillStyle=scoured?"rgba(190,185,170,.4)":"#efe9da";
  for(let x=4;x<w;x+=12)g.fillRect(x,h/2-4,scoured?4:8,8)})}
function spriteTx(txt,color){const k="sp:"+txt+color;if(TEX[k])return TEX[k];
  const c=document.createElement("canvas");c.width=c.height=128;
  const g=c.getContext("2d");g.scale(2,2);
  g.font="bold 44px Arial";g.textAlign="center";
  g.textBaseline="middle";g.shadowColor="#000";g.shadowBlur=8;
  g.fillStyle=color;g.fillText(txt,32,34);
  const t=asColor(new THREE.CanvasTexture(c));TEX[k]=t;return t}
function makeWord(txt,color){const k="wd:"+txt+color;
  if(!TEX[k]){const c=document.createElement("canvas");c.width=512;c.height=96;
    const g=c.getContext("2d");g.scale(2,2);
    g.font="bold 30px Arial";g.textAlign="center";
    g.textBaseline="middle";g.shadowColor="#000";g.shadowBlur=7;
    g.fillStyle=color;g.fillText(txt,128,26);
    TEX[k]=asColor(new THREE.CanvasTexture(c))}
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:TEX[k],
    transparent:true,depthWrite:false}));
  s.scale.set(2.1,0.4,1);return s}
// Name plate, not a floating capital: a dark dog-tag with the crew colour on
// its edge, so three figures in one beam stay tellable apart without shouting.
function nameTagTx(name,color){const k="nt:"+name+color;if(TEX[k])return TEX[k];
  const c=document.createElement("canvas");c.width=256;c.height=72;
  const g=c.getContext("2d");
  const x0=10,y0=16,w=236,h=40,r=8;
  g.beginPath();
  g.moveTo(x0+r,y0);g.lineTo(x0+w-r,y0);g.quadraticCurveTo(x0+w,y0,x0+w,y0+r);
  g.lineTo(x0+w,y0+h-r);g.quadraticCurveTo(x0+w,y0+h,x0+w-r,y0+h);
  g.lineTo(x0+r,y0+h);g.quadraticCurveTo(x0,y0+h,x0,y0+h-r);
  g.lineTo(x0,y0+r);g.quadraticCurveTo(x0,y0,x0+r,y0);g.closePath();
  g.fillStyle="rgba(7,10,17,0.78)";g.fill();
  g.strokeStyle=color;g.globalAlpha=0.55;g.lineWidth=2;g.stroke();
  g.globalAlpha=1;
  g.fillStyle=color;g.fillRect(x0+6,y0+9,5,h-18);
  g.font="600 25px ui-monospace,Menlo,Consolas,monospace";
  g.textAlign="center";g.textBaseline="middle";
  g.shadowColor="#000";g.shadowBlur=5;
  g.fillStyle="#EFE8D9";g.fillText(name.toUpperCase(),x0+w/2+6,y0+h/2+1);
  const t=asColor(new THREE.CanvasTexture(c));TEX[k]=t;return t}
function makeNameTag(name,color){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:nameTagTx(name,color),
    transparent:true,depthWrite:false}));
  s.scale.set(1.12,0.315,1);return s}
function makeSprite(txt,color,scale=0.66){
  const m=new THREE.SpriteMaterial({map:spriteTx(txt,color),transparent:true,
    depthWrite:false});
  const s=new THREE.Sprite(m);s.scale.set(scale,scale,1);return s}
// faded room names painted on the boards — blueprint lettering, not UI
function wordPlane(txt){const k="wp:"+txt;
  if(!TEX[k]){const c=document.createElement("canvas");c.width=256;c.height=64;
    const g=c.getContext("2d");g.font="700 24px Arial";g.textAlign="center";
    g.textBaseline="middle";g.fillStyle="#EFE8D9";
    // manual letterspacing for the surveyor's-stencil look
    const sp=txt.split("").join("  ");
    g.fillText(sp,128,34);TEX[k]=asColor(new THREE.CanvasTexture(c))}
  const m=new THREE.Mesh(new THREE.PlaneGeometry(2.3,0.575),
    new THREE.MeshBasicMaterial({map:TEX[k],transparent:true,opacity:0.085,
      depthWrite:false}));
  m.rotation.x=-Math.PI/2;return m}
// A gobo for the headlamps: real torches never throw a clean disc.
function cookieTex(){if(TEX.cookie)return TEX.cookie;
  const c=document.createElement("canvas");c.width=c.height=128;
  const g=c.getContext("2d");
  const r=g.createRadialGradient(64,64,6,64,64,62);
  r.addColorStop(0,"#ffffff");r.addColorStop(0.55,"#d8d2c4");
  r.addColorStop(0.86,"#4a463e");r.addColorStop(1,"#000000");
  g.fillStyle=r;g.fillRect(0,0,128,128);
  g.globalCompositeOperation="multiply";
  for(let i=0;i<16;i++){
    g.fillStyle="rgba(0,0,0,"+(0.05+Math.random()*0.13)+")";
    g.beginPath();g.arc(20+Math.random()*88,20+Math.random()*88,
      3+Math.random()*16,0,7);g.fill()}
  const t=asColor(new THREE.CanvasTexture(c));TEX.cookie=t;return t}
// a two-tone sky/ground gradient so gloss has something to reflect
function envTex(){if(TEX.env)return TEX.env;
  const c=document.createElement("canvas");c.width=c.height=64;
  const g=c.getContext("2d");
  const lg=g.createLinearGradient(0,0,0,64);
  lg.addColorStop(0,"#39485C");lg.addColorStop(0.5,"#1A2028");
  lg.addColorStop(1,"#0E1216");
  g.fillStyle=lg;g.fillRect(0,0,64,64);
  const t=asColor(new THREE.CanvasTexture(c));
  t.mapping=THREE.EquirectangularReflectionMapping;
  TEX.env=t;return t}
function glowTex(){if(TEX.glow)return TEX.glow;
  const c=document.createElement("canvas");c.width=64;c.height=64;
  const g=c.getContext("2d");
  const r=g.createRadialGradient(32,32,2,32,32,30);
  r.addColorStop(0,"rgba(255,255,255,.9)");r.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=r;g.fillRect(0,0,64,64);
  TEX.glow=asColor(new THREE.CanvasTexture(c));return TEX.glow}
// per-ghost read (02 §6: silhouette identifies — surviving a Hunt IS evidence)
const GHOSTVIS={hantu:{c:0x9FD8FF,s:1.0,tall:false},
 demon:{c:0xE05848,s:1.3,tall:false},mare:{c:0x8A7FD6,s:0.95,tall:false},
 jinn:{c:0xFFD070,s:1.0,tall:false},wraith:{c:0xBFD6CF,s:1.0,tall:true},
 yurei:{c:0xF0F0E8,s:0.95,tall:true},poltergeist:{c:0xD6B37F,s:0.85,tall:false},
 banshee:{c:0xD9E8F0,s:1.0,tall:true},revenant:{c:0xC87F5A,s:1.1,tall:false},
 shade:{c:0x9AA4AD,s:0.9,tall:false},draugr:{c:0x7FB0D6,s:1.35,tall:false},
 dybbuk:{c:0xA078DC,s:0.95,tall:false}};
const ROOMBASE={Kitchen:0xB9A47E,Pantry:0xA89B7C,Mudroom:0xA39784,
  Bedroom:0xAF9A8E,Cellar:0x7E8A96,Hall:0xAB9F86,Bathroom:0x93A8A0,
  Living:0xB3A182,Foyer:0xB0A07E,Study:0xA5977F,Van:0x5A6B7C};
const CLSCOL={Ritualist:0xDFA457,Warden:0x8A9BB0,Scout:0x7FD6B4};
const W2=(p)=>({x:p[0]+0.5,z:p[1]+0.5});   // tile -> world center

// ---- post-processing (hand-rolled: three's UMD build ships no composer) ----
const VERT=`varying vec2 vUv;void main(){vUv=uv;
 gl_Position=vec4(position.xy,0.0,1.0);}`;
const FRAG_BRIGHT=`uniform sampler2D tDiffuse;uniform float threshold,knee;
 varying vec2 vUv;
 void main(){vec4 c=texture2D(tDiffuse,vUv);
  float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));
  gl_FragColor=vec4(c.rgb*smoothstep(threshold,threshold+knee,l),1.0);}`;
const FRAG_BLUR=`uniform sampler2D tDiffuse;uniform vec2 dir;varying vec2 vUv;
 void main(){vec3 s=vec3(0.0);
  s+=texture2D(tDiffuse,vUv-dir*4.0).rgb*0.0162;
  s+=texture2D(tDiffuse,vUv-dir*3.0).rgb*0.0540;
  s+=texture2D(tDiffuse,vUv-dir*2.0).rgb*0.1216;
  s+=texture2D(tDiffuse,vUv-dir).rgb*0.1946;
  s+=texture2D(tDiffuse,vUv).rgb*0.2270;
  s+=texture2D(tDiffuse,vUv+dir).rgb*0.1946;
  s+=texture2D(tDiffuse,vUv+dir*2.0).rgb*0.1216;
  s+=texture2D(tDiffuse,vUv+dir*3.0).rgb*0.0540;
  s+=texture2D(tDiffuse,vUv+dir*4.0).rgb*0.0162;
  gl_FragColor=vec4(s,1.0);}`;
const FRAG_COMP=`uniform sampler2D tScene,tBloom,tSoft;
 uniform float uBloom,uTime,uDread,uHunt,uVig,uExposure,uDof,uFocus,uBand,uSharp;
 uniform vec2 uTexel;
 varying vec2 vUv;
 vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
 void main(){vec2 d=vUv-0.5;
  float ca=0.0022*uHunt;                       // hunts fray the image
  vec3 col;
  col.r=texture2D(tScene,vUv+d*ca).r;
  col.g=texture2D(tScene,vUv).g;
  col.b=texture2D(tScene,vUv-d*ca).b;
  // Unsharp mask straight off the scene buffer: a four-tap cross costs four
  // reads in this pass instead of two extra full-screen blur passes, and the
  // high-pass stays at native resolution so fine grain actually survives.
  vec3 lo=(texture2D(tScene,vUv+vec2(uTexel.x,0.0)).rgb
          +texture2D(tScene,vUv-vec2(uTexel.x,0.0)).rgb
          +texture2D(tScene,vUv+vec2(0.0,uTexel.y)).rgb
          +texture2D(tScene,vUv-vec2(0.0,uTexel.y)).rgb)*0.25;
  col+=(col-lo)*uSharp;
  // Tilt-shift only at the very edges of the frame, and gently — the diorama
  // hint must never cost legibility of the board.
  float band=smoothstep(uBand,uBand+0.26,abs(vUv.y-uFocus));
  col=mix(col,texture2D(tSoft,vUv).rgb,band*uDof);
  col+=texture2D(tBloom,vUv).rgb*uBloom;
  float lum=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(col,vec3(lum),0.10+0.22*uDread);     // dread drains the color
  col*=mix(vec3(0.93,0.98,1.08),vec3(1.10,0.92,0.84),uDread);
  col+=vec3(0.30,0.04,0.03)*uHunt*0.10;
  float v=1.0-uVig*dot(d,d)*1.85;
  col*=clamp(v,0.0,1.0);
  col=aces(col*uExposure);
  gl_FragColor=vec4(pow(max(col,0.0),vec3(1.0/2.2)),1.0);}`;
function makeRT(w,h,depth,samples){
  const o={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   type:THREE.UnsignedByteType,format:THREE.RGBAFormat,
   depthBuffer:!!depth,stencilBuffer:false};
  // The canvas' own antialias flag is dead weight once we render into a
  // target — MSAA has to be asked for on the target itself, and only WebGL2
  // can serve it. Without this every edge in the game is a staircase.
  if(samples&&R&&R.renderer&&R.renderer.capabilities.isWebGL2)o.samples=samples;
  const rt=new THREE.WebGLRenderTarget(
    Math.max(2,Math.floor(w)),Math.max(2,Math.floor(h)),o);
  return rt}
function fsPass(frag,uniforms){
  const mat=new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:frag,
    uniforms,depthTest:false,depthWrite:false});
  const scene=new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat));
  return {scene,mat}}
function buildPost(W,H){
  const px=R&&R.px!=null?R.px:Math.min(devicePixelRatio||1,2);
  const w=Math.floor(W*px),h=Math.floor(H*px);
  const bw=Math.max(2,Math.floor(w/2)),bh=Math.max(2,Math.floor(h/2));
  // the soft buffer now only feeds the tilt-shift edge, which is blurred by
  // definition — half resolution there is free quality
  const sw=bw,sh=bh;
  // at devicePixelRatio 2 the frame is already supersampled, so 2 samples
  // clean the remaining edges without paying for 4
  const P={cam:new THREE.OrthographicCamera(-1,1,1,-1,0,1),
    rtScene:makeRT(w,h,true,px>=2?2:4),rtA:makeRT(bw,bh),rtB:makeRT(bw,bh),
    rtD:makeRT(sw,sh),rtE:makeRT(sw,sh),bw,bh,sw,sh};
  P.bright=fsPass(FRAG_BRIGHT,{tDiffuse:{value:P.rtScene.texture},
    threshold:{value:0.86},knee:{value:0.22}});
  P.blur=fsPass(FRAG_BLUR,{tDiffuse:{value:null},dir:{value:new THREE.Vector2()}});
  P.copy=fsPass(FRAG_BLUR,{tDiffuse:{value:null},
    dir:{value:new THREE.Vector2()}});
  P.comp=fsPass(FRAG_COMP,{tScene:{value:P.rtScene.texture},
    tBloom:{value:P.rtB.texture},tSoft:{value:P.rtD.texture},
    uBloom:{value:0.46},uTime:{value:0},
    uDread:{value:0},uHunt:{value:0},uVig:{value:0.62},uExposure:{value:1.62},
    uDof:{value:0.40},uFocus:{value:0.52},uBand:{value:0.34},
    uSharp:{value:0.58},uTexel:{value:new THREE.Vector2(1.5/w,1.5/h)}});
  return P}
// Give up effects before pixels: a soft full-res frame reads worse than a
// crisp one with less bloom, so resolution is the last thing to go.
function degrade(){if(R.q<=0)return;
  const u=R.post.comp.mat.uniforms;
  if(R.q===3){u.uDof.value=0;u.uSharp.value=0.30}
  else if(R.q===2){R.renderer.shadowMap.enabled=false;
    R.scene.traverse(o=>{if(o.material)o.material.needsUpdate=true})}
  else{R.px=1;R.renderer.setPixelRatio(1);
    const old=R.post;R.post=buildPost(R.W,R.H);
    R.post.comp.mat.uniforms.uDof.value=0;
    old.rtScene.dispose();old.rtA.dispose();old.rtB.dispose();
    old.rtD.dispose();old.rtE.dispose()}
  R.q--;R.fr=0;R.fsum=0}
function renderPost(now){const P=R.post,rn=R.renderer;
  if(R.flast){R.fsum+=now-R.flast;R.fr++;
    if(R.fr>=90){if(R.fsum/R.fr>42)degrade();R.fr=0;R.fsum=0}}
  R.flast=now;
  rn.setRenderTarget(P.rtScene);rn.clear();rn.render(R.scene,R.camera);
  // bright pass
  P.bright.mat.uniforms.tDiffuse.value=P.rtScene.texture;
  rn.setRenderTarget(P.rtA);rn.render(P.bright.scene,P.cam);
  // separable blur, three widening iterations for a softer, filmic glow
  for(let i=0;i<3;i++){
    P.blur.mat.uniforms.tDiffuse.value=P.rtA.texture;
    P.blur.mat.uniforms.dir.value.set((1.3+i*2.4)/P.bw,0);
    rn.setRenderTarget(P.rtB);rn.render(P.blur.scene,P.cam);
    P.blur.mat.uniforms.tDiffuse.value=P.rtB.texture;
    P.blur.mat.uniforms.dir.value.set(0,(1.3+i*2.4)/P.bh);
    rn.setRenderTarget(P.rtA);rn.render(P.blur.scene,P.cam)}
  const u=P.comp.mat.uniforms;
  if(u.uDof.value>0){          // soft copy only feeds the tilt-shift edge
    P.copy.mat.uniforms.tDiffuse.value=P.rtScene.texture;
    P.copy.mat.uniforms.dir.value.set(1.6/P.sw,0);
    rn.setRenderTarget(P.rtE);rn.render(P.copy.scene,P.cam);
    P.copy.mat.uniforms.tDiffuse.value=P.rtE.texture;
    P.copy.mat.uniforms.dir.value.set(0,1.6/P.sh);
    rn.setRenderTarget(P.rtD);rn.render(P.copy.scene,P.cam)}
  u.tBloom.value=P.rtA.texture;
  u.uTime.value=now*0.001;
  u.uDread.value=sim?Math.min(1,sim.dread/100):0;
  const hunt=sim&&sim.collapse?0.8:(sim&&sim.hunt?1:(sim&&sim.prelude?0.55:0));
  u.uHunt.value+=(hunt-u.uHunt.value)*0.12;
  u.uVig.value=0.60+u.uHunt.value*0.40;
  rn.setRenderTarget(null);rn.render(P.comp.scene,P.cam)}
function init3D(){
  const host=$("#gl");host.innerHTML="";
  const W=host.clientWidth||innerWidth,H=host.clientHeight||innerHeight;
  // Colour management on: material colours are authored in sRGB just like the
  // canvas textures, and both are now decoded once on the way in and encoded
  // once on the way out, instead of being gamma'd twice into flat grey.
  if(THREE.ColorManagement)THREE.ColorManagement.legacyMode=false;
  // antialias is meaningless on the canvas when every frame goes through a
  // render target — MSAA is requested on rtScene instead
  const renderer=new THREE.WebGLRenderer({antialias:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.setSize(W,H);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputEncoding=THREE.LinearEncoding;   // composite does the grade
  renderer.toneMapping=THREE.NoToneMapping;
  host.appendChild(renderer.domElement);
  // survive a GPU reset: preventDefault on loss lets three restore its own
  // programs when the context comes back (tab switch, driver hiccup)
  renderer.domElement.addEventListener("webglcontextlost",e=>{
    e.preventDefault();toast("display reset — recovering…")});
  renderer.domElement.addEventListener("webglcontextrestored",()=>{
    if(sim)renderAll()});
  // if a driver refuses one of our shaders, say so instead of going black
  if(renderer.debug)renderer.debug.onShaderError=()=>{
    if(!R||R._shErr)return;R._shErr=true;
    renderer.shadowMap.enabled=false;
    toast("graphics fallback: this GPU rejected a shader — shadows off")};
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080B10);
  scene.fog=new THREE.FogExp2(0x080B10,0.021);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,120);
  scene.environment=envTex();
  scene.add(new THREE.AmbientLight(0x223040,0.98));
  scene.add(new THREE.HemisphereLight(0x46617E,0x1A1512,0.46));
  const moon=new THREE.DirectionalLight(0x8FA8C8,0.86);
  moon.position.set(30,32,-10);moon.castShadow=true;
  moon.shadow.mapSize.set(W>700?2048:1024,W>700?2048:1024);
  moon.shadow.bias=-0.0012;
  const so=14;Object.assign(moon.shadow.camera,
    {left:-so-4,right:so+16,top:so,bottom:-so});
  moon.shadow.camera.updateProjectionMatrix();
  scene.add(moon);
  const staticG=new THREE.Group(),dynG=new THREE.Group(),
    unitG=new THREE.Group(),fxG=new THREE.Group(),lightG=new THREE.Group();
  scene.add(staticG,dynG,unitG,fxG,lightG);
  const huntLight=new THREE.PointLight(0xC8564C,0,9);huntLight.decay=1.4;scene.add(huntLight);
  const ghostLight=new THREE.PointLight(
    (GHOSTVIS[sim.contract.trueGhost]||{c:0x7FD6B4}).c,0,6);
  scene.add(ghostLight);
  R={renderer,scene,camera,staticG,dynG,unitG,fxG,lightG,huntLight,ghostLight,
    doors:{},roomFloors:{},roomLights:{},units:{},ghostM:null,alphaM:null,
    W,H,cam:(()=>{const f=Math.min(8.6,Math.max(4.6,6.4*(W/H)));return{cx:12,cz:12,half:f,tx:12,tz:12,th:f}})()};
  R.seen=null;R.vis=null;
  R.px=Math.min(devicePixelRatio||1,2);
  R.q=3;R.fr=0;R.fsum=0;R.flast=0;   // adaptive quality state
  R.post=buildPost(W,H);
  buildStatic();
  buildUnits();
  R.fog=buildFog();scene.add(R.fog.mesh);
  bindInput(renderer.domElement);
  if(!R.loop){R.loop=true;requestAnimationFrame(frame)}}
function camFollow(p,zoom){if(!R)return;
  R.cam.tx=Math.max(4,Math.min(20,p[0]+0.5));
  R.cam.tz=Math.max(3,Math.min(15.5,p[1]+0.5));
  if(zoom)R.cam.th=zoom}
function resize3D(){if(!R)return;const host=$("#gl");
  R.W=host.clientWidth||innerWidth;R.H=host.clientHeight||innerHeight;
  R.renderer.setSize(R.W,R.H);
  const old=R.post;
  R.post=buildPost(R.W,R.H);
  if(R.q<3)R.post.comp.mat.uniforms.uDof.value=0;   // keep the degraded tier
  if(old){old.rtScene.dispose();old.rtA.dispose();old.rtB.dispose();
    old.rtD.dispose();old.rtE.dispose()}}
function box(w,h,d,color,map,opts={}){
  const g=new THREE.BoxGeometry(w,h,d);
  const base={color,roughness:0.9,metalness:0.0};
  if(map){base.map=map;
    const nm=Object.keys(TEX).find(k=>TEX[k]===map);
    const n=nm?normalOf(nm):null;
    if(n){base.normalMap=n;base.normalScale=new THREE.Vector2(0.85,0.85)}}
  const m=new THREE.MeshStandardMaterial(Object.assign(base,opts));
  const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;
  return mesh}
function buildStatic(){
  const site=sim.site,G=R.staticG;
  while(G.children.length)G.remove(G.children[0]);
  R.doors={};R.roomFloors={};R.tileObjs={};
  const reg=(m,x,y)=>{const k=x+","+y;
    (R.tileObjs[k]=R.tileObjs[k]||[]).push(m);
    if(m.material&&m.material.color)m.userData.base=m.material.color.clone();
    return m};
  // outside ground
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(90,70),
    new THREE.MeshLambertMaterial({map:grassTex(),color:0x39424b}));
  TEX.grass.repeat.set(7,6);
  ground.rotation.x=-Math.PI/2;ground.position.set(12,-0.02,7.5);
  ground.receiveShadow=true;G.add(ground);
  // room floors (one plane per room, per-room material, tinted by light level)
  for(const[name,r]of Object.entries(ROOMS)){
    const w=r[2]-r[0]+1,d=r[3]-r[1]+1;
    const kind=ROOMFLOOR[name]||"wood";
    floorKind(kind);
    const ft=TEX["f_"+kind].clone();ft.needsUpdate=true;ft.repeat.set(w,d);
    anisotropy(ft);
    const nsrc=normalOf("f_"+kind);
    const nt=nsrc?nsrc.clone():null;
    if(nt){nt.needsUpdate=true;nt.repeat.set(w,d)}
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
      new THREE.MeshStandardMaterial({map:ft,color:0xffffff,
        roughness:kind==="tile"?0.55:0.94,metalness:0,
        normalMap:nt,normalScale:new THREE.Vector2(0.8,0.8)}));
    mesh.rotation.x=-Math.PI/2;
    mesh.position.set(r[0]+w/2,0,r[1]+d/2);
    mesh.receiveShadow=true;G.add(mesh);
    R.roomFloors[name]=mesh}
  // door thresholds get a small floor pad
  for(const k of Object.keys(site.kind)){const[x,y]=k.split(",").map(Number);
    const kind=site.kind[k];
    if(kind==="door"){const pad=new THREE.Mesh(new THREE.PlaneGeometry(1,1),
      new THREE.MeshLambertMaterial({map:floorTex(),color:0x8d8272}));
      pad.rotation.x=-Math.PI/2;pad.position.set(x+0.5,0.001,y+0.5);
      pad.receiveShadow=true;G.add(pad);
      // A door fills the gap in its wall line: if the neighbours left and
      // right are wall, the leaf spans X; otherwise it spans Z. (This was
      // inverted, which stood every leaf across the doorway sideways.)
      const spanX=site.kind[(x-1)+","+y]==="wall"||site.kind[(x+1)+","+y]==="wall";
      const leaf=box(spanX?0.9:0.11,0.82,spanX?0.11:0.9,0xffffff,doorTex());
      leaf.position.set(spanX?-0.45:0,0.41,spanX?0:-0.45);
      const hinge=new THREE.Group();
      hinge.position.set(x+0.5+(spanX?0.45:0),0,y+0.5+(spanX?0:0.45));
      hinge.add(leaf);
      const jamb=box(spanX?0.1:0.16,0.9,spanX?0.16:0.1,0x5A4B33);
      jamb.position.set(x+0.5+(spanX?0.47:0),0.45,y+0.5+(spanX?0:0.47));
      G.add(hinge,jamb);
      R.doors[k]={hinge,spanX,sign:((x+y)%2?1:-1),open:0}}
    else if(kind==="wall"){const m=box(1,0.92,1,0x8F8A80,wallTex(),
        {transparent:true,opacity:0.62,depthWrite:false});
      m.position.set(x+0.5,0.46,y+0.5);G.add(m);reg(m,x,y)}
    else if(kind==="window"){
      const b=box(1,0.42,1,0x8F8A80,wallTex(),
        {transparent:true,opacity:0.55,depthWrite:false});
      b.position.set(x+0.5,0.21,y+0.5);
      const t=box(1,0.16,1,0x8F8A80,wallTex(),
        {transparent:true,opacity:0.55,depthWrite:false});
      t.position.set(x+0.5,0.84,y+0.5);
      const glass=box(1,0.34,1,0x9FCADB,null,
        {transparent:true,opacity:0.22,emissive:0x224455});
      glass.castShadow=false;glass.position.set(x+0.5,0.59,y+0.5);
      G.add(b,t,glass);reg(b,x,y);reg(t,x,y);reg(glass,x,y)}
    else if(kind==="van"){/* below */}
    const furn=site.furn[k];
    if(furn)addProp(G,site.room([x,y]),furn,x,y,reg)}
  // the H&V van: cargo body, cab, glass, wheels, rear doors standing open
  {const V=new THREE.Group();
   const vr=ROOMS.Van,vz=vr[1]+0.5;
   V.position.set(vr[0]-2.0,0,vz);    // parked clear of the loading tiles
   V.rotation.y=Math.PI;              // rear doors face the crew
   const P=(w,hh,d,c,x,y,z,opts)=>{const m=box(w,hh,d,c,null,opts);
     m.position.set(x,y,z);V.add(m);return m};
   P(2.5,1.05,1.7,0x46586B,-0.55,0.72,0);
   P(2.5,0.1,1.72,0xDFA457,-0.55,1.05,0,{emissive:0x5a3f18});
   P(1.35,0.78,1.62,0x3E4E60,1.15,0.6,0);
   P(0.1,0.42,1.5,0x9FCADB,1.83,0.72,0,
     {transparent:true,opacity:0.35,emissive:0x1b3040});
   P(1.2,0.34,1.64,0x9FCADB,1.15,0.86,0,
     {transparent:true,opacity:0.22,emissive:0x16283a});
   P(0.16,0.16,0.16,0xFFF0C8,1.86,0.42,0.6,{emissive:0xFFE7A0});
   P(0.16,0.16,0.16,0xFFF0C8,1.86,0.42,-0.6,{emissive:0xFFE7A0});
   P(0.34,0.1,0.16,0xE0A050,-0.3,1.16,0,{emissive:0x8a5a10});
   for(const[wx,wz]of[[1.25,0.86],[1.25,-0.86],[-1.2,0.86],[-1.2,-0.86]]){
     const t=new THREE.Mesh(new THREE.CylinderGeometry(0.27,0.27,0.2,14),
       new THREE.MeshStandardMaterial({color:0x1E2228,roughness:0.95}));
     t.rotation.x=Math.PI/2;t.position.set(wx,0.27,wz);
     t.castShadow=true;V.add(t)}
   for(const s of[1,-1]){             // both rear doors standing open
     const d=box(0.8,0.95,0.07,0x3E4E60);
     d.position.set(-0.4,0.5,0);
     const hinge=new THREE.Group();hinge.position.set(-1.82,0,s*0.82);
     hinge.rotation.y=s*0.22;hinge.add(d);V.add(hinge)}
   G.add(V)}
  // rugs / doormat / hall runner (flat, walk-through)
  const rug=(w,d,color,x,z,op=0.85)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
      new THREE.MeshLambertMaterial({color,transparent:true,opacity:op}));
    m.rotation.x=-Math.PI/2;m.position.set(x,0.012,z);m.receiveShadow=true;
    G.add(m)};
  rug(2.6,1.8,0x6B4A44,4,11);          // living rug
  rug(1.6,0.9,0x5A5145,11.5,12.6);     // foyer doormat
  rug(7.5,0.72,0x5E4A40,11,6.5,0.8);   // hall runner
  // moonlight pools under windows
  for(const wp of WINDOWS){
    const dx=wp[0]===0?1:(wp[0]===23?-1:0);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.8),
      new THREE.MeshBasicMaterial({color:0x8FA8C8,transparent:true,opacity:0.09,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    m.rotation.x=-Math.PI/2;
    m.position.set(wp[0]+dx*1.1+0.5,0.015,wp[1]+0.5);G.add(m)}
  // gravel path from the van to the front door
  {const pt=floorKind("stone").clone();pt.needsUpdate=true;pt.repeat.set(6,4);
   const path=new THREE.Mesh(new THREE.PlaneGeometry(6,4.2),
     new THREE.MeshStandardMaterial({map:pt,color:0x4E5157,roughness:0.98}));
   path.rotation.x=-Math.PI/2;path.position.set(12,-0.005,15.6);
   path.receiveShadow=true;G.add(path)}
  // drifting dust motes
  {const N=110,pos=new Float32Array(N*3);
   for(let i=0;i<N;i++){pos[i*3]=1+Math.random()*22;
     pos[i*3+1]=0.15+Math.random()*1.2;pos[i*3+2]=1+Math.random()*12}
   const geo=new THREE.BufferGeometry();
   geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
   const dust=new THREE.Points(geo,new THREE.PointsMaterial({color:0x9FB4C8,
     size:0.045,transparent:true,opacity:0.45,depthWrite:false,
     blending:THREE.AdditiveBlending}));
   G.add(dust);R.dust=dust}
  // seeded decorative clutter (procedural set dressing)
  const rr=RNG("clutter:"+sim.contract.seed);
  const tiles=Object.keys(sim.site.roomOf).filter(k=>{
    const p=k.split(",").map(Number);
    return sim.site.walkable(p)&&sim.site.room(p)!=="Van"&&!sim.site.furn[k]});
  for(let i=0;i<34&&tiles.length;i++){
    const k=tiles[Math.floor(rr.random()*tiles.length)];
    const[x,y]=k.split(",").map(Number);
    const s=0.07+rr.random()*0.1;
    const m=rr.random()<0.5?
      box(s*2,s,s*1.4,0x6a5c48):(()=>{const c=new THREE.Mesh(
        new THREE.CylinderGeometry(s*0.7,s*0.7,s*1.6,6),
        new THREE.MeshLambertMaterial({color:0x5d5346}));
        c.castShadow=true;return c})();
    m.position.set(x+0.18+rr.random()*0.64,s/2,y+0.18+rr.random()*0.64);
    m.rotation.y=rr.random()*3.1;G.add(m);reg(m,x,y)}}
function addProp(G,room,kind,x,y,reg){
  const g=new THREE.Group();g.position.set(x+0.5,0,y+0.5);
  const B=(w,h,d,c,ox=0,oy=0,oz=0,rot=0)=>{const m=box(w,h,d,c);
    m.position.set(ox,oy+h/2,oz);if(rot)m.rotation.y=rot;
    g.add(m);if(reg)reg(m,x,y);return m};
  const cyl=(rt,rb,h,c,ox,oy,oz,seg)=>{
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||10),
      new THREE.MeshStandardMaterial({color:c,roughness:0.85}));
    m.position.set(ox,oy+h/2,oz);m.castShadow=true;m.receiveShadow=true;
    g.add(m);if(reg)reg(m,x,y);return m};
  if(kind==="hide"){
    if(room==="Bedroom"){                       // a bed you can get under
      B(0.95,0.14,0.72,0x5C4A35,0,0.16,0);      // frame
      for(const sx of[-1,1])for(const sz of[-1,1])
        B(0.07,0.16,0.07,0x4A3B2A,sx*0.42,0,sz*0.30);   // legs
      B(0.86,0.13,0.62,0xB8AF9A,0,0.30,0);      // mattress
      B(0.80,0.05,0.40,0x8A6E63,0,0.43,0.09);   // blanket
      B(0.30,0.09,0.44,0xD8D3C4,-0.26,0.43,0);  // pillow
      B(0.95,0.42,0.08,0x5C4A35,0,0.16,-0.36)}  // headboard
    else{                                        // a wardrobe
      B(0.78,0.05,0.62,0x4A3B2A,0,0,0);          // plinth
      B(0.74,0.86,0.58,0x54493B,0,0.05,0);
      B(0.82,0.05,0.66,0x5C4A35,0,0.91,0);       // cornice
      for(const sx of[-1,1]){
        const d=B(0.35,0.72,0.04,0x453B2F,sx*0.185,0.12,0.30);
        d.material.color.multiplyScalar(sx>0?1.06:0.94)}
      for(const sx of[-1,1])
        cyl(0.018,0.018,0.05,0xB8AF9A,sx*0.04,0.44,0.33,6).rotation.x=Math.PI/2}}
  else if(kind==="tall"){
    if(room==="Study"){                          // bookcase with actual books
      B(0.9,0.98,0.34,0x5C4A35,0,0,0);
      B(0.82,0.03,0.28,0x4A3B2A,0,0.30,0.02);
      B(0.82,0.03,0.28,0x4A3B2A,0,0.58,0.02);
      const cols=[0x8a4a3e,0x4a6a5a,0x9a8a4e,0x5a5a7a,0x7a4a5a,0x3f5a45];
      const rr3=RNG("books:"+x+","+y);
      for(let shelf=0;shelf<3;shelf++){
        let px=-0.36;
        while(px<0.34){
          const bw=0.035+rr3.random()*0.03,bh=0.16+rr3.random()*0.08;
          B(bw,bh,0.2,cols[Math.floor(rr3.random()*cols.length)],
            px+bw/2,0.03+shelf*0.28,0.03);
          px+=bw+0.006+rr3.random()*0.012}}}
    else if(room==="Cellar"){                    // shelving and a barrel
      B(0.85,0.06,0.4,0x5C4A35,0,0.30,0);
      B(0.85,0.06,0.4,0x5C4A35,0,0.62,0);
      for(const sx of[-1,1])B(0.06,0.9,0.06,0x4A3B2A,sx*0.39,0,0);
      const pts=[];
      for(let i2=0;i2<=6;i2++){const t=i2/6;
        pts.push(new THREE.Vector2(0.17+Math.sin(t*Math.PI)*0.055,t*0.5))}
      const bar=new THREE.Mesh(new THREE.LatheGeometry(pts,12),
        new THREE.MeshStandardMaterial({color:0x6E5A41,roughness:0.9}));
      bar.position.set(0.18,0,0.34);bar.castShadow=true;g.add(bar);
      if(reg)reg(bar,x,y);
      for(const hy of[0.10,0.40])
        cyl(0.215,0.215,0.025,0x3A3A3E,0.18,hy,0.34,12)}
    else{B(0.8,0.95,0.55,0x6E5A41,0,0,0);        // plain cupboard
      B(0.86,0.04,0.6,0x5C4A35,0,0.95,0);
      for(const sx of[-1,1])B(0.36,0.78,0.03,0x5A4B39,sx*0.19,0.08,0.28)}}
  else if(kind==="low"){
    if(room==="Kitchen"){                        // counter, sink and tap
      B(0.9,0.42,0.58,0x8A8F93,0,0,0);
      B(0.96,0.05,0.64,0xB9B3A6,0,0.42,0);       // worktop with overhang
      B(0.34,0.04,0.34,0x6E7478,0.2,0.44,0);     // basin
      cyl(0.02,0.02,0.14,0xB9B3A6,0.2,0.47,-0.14,8);
      B(0.03,0.03,0.1,0xB9B3A6,0.2,0.60,-0.10);
      for(const sx of[-1,1])                     // cupboard doors
        B(0.4,0.32,0.02,0x7A8085,sx*0.22,0.05,0.30)}
    else if(room==="Living"){                    // sofa with cushions
      B(0.9,0.16,0.56,0x6A4A3E,0,0,0.02);
      B(0.9,0.32,0.14,0x7A5548,0,0.16,-0.22);    // back
      for(const sx of[-1,1])B(0.12,0.26,0.5,0x7A5548,sx*0.39,0.16,0.04);
      for(const sx of[-1,1])B(0.36,0.1,0.42,0x8A6155,sx*0.2,0.16,0.06)}
    else if(room==="Study"){                     // desk, papers, lamp
      B(0.94,0.05,0.54,0x5C4A35,0,0.4,0);
      for(const sx of[-1,1])for(const sz of[-1,1])
        B(0.055,0.4,0.055,0x4A3B2A,sx*0.42,0,sz*0.22);
      B(0.2,0.012,0.15,0xD8D3C4,0.16,0.45,0.06,0.3);
      B(0.18,0.012,0.14,0xCFC9BA,-0.1,0.45,-0.04,-0.2);
      cyl(0.03,0.05,0.12,0x3A3F46,-0.3,0.45,-0.12,8)}
    else if(room==="Hall"){                      // stacked crates with slats
      for(const[cx,cy,cz,cs]of[[0,0,0,0.46],[0.12,0.3,0.06,0.34]]){
        B(cs,0.3,cs,0x6E5A41,cx,cy,cz);
        for(const t of[0.06,0.22])
          B(cs+0.01,0.03,cs+0.01,0x54452F,cx,cy+t,cz)}}
    else{B(0.8,0.4,0.55,0x7A664B,0,0,0);
      B(0.86,0.04,0.6,0x6E5A41,0,0.4,0)}}
  G.add(g)}
// A hard hat as a turned profile reads better than a stack of cylinders.
function hatGeo(){if(GEO.hat)return GEO.hat;
  const pts=[];
  for(let i=0;i<=8;i++){const t=i/8;
    pts.push(new THREE.Vector2(0.155*Math.sin(t*Math.PI*0.5)+0.005,
      0.105*Math.cos(t*Math.PI*0.5)))}
  pts.push(new THREE.Vector2(0.185,0.012),new THREE.Vector2(0.195,0.0));
  return GEO.hat=new THREE.LatheGeometry(pts,14)}
function makeWorker(overall,hat,withLamp){
  const grp=new THREE.Group();
  const inner=new THREE.Group();grp.add(inner);
  const mats=[];
  const M=(c,e)=>{const m=new THREE.MeshStandardMaterial(
    {color:c,transparent:true,roughness:0.72,metalness:0.05,
     emissive:e||0x000000,emissiveIntensity:e?1.4:0});
    mats.push(m);return m};
  const limbMat=M(0x333941),bootMat=M(0x23272C),skin=M(0xC9A98F),
    hatMat=M(hat),coat=M(overall),belt=M(0x2A2F36);
  const mk=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);
    m.position.set(x,y,z);m.castShadow=true;return m};
  const legGeo=new THREE.CapsuleGeometry(0.062,0.17,3,8);
  const legs=[];
  for(const sx of[-1,1]){
    const hip=new THREE.Group();hip.position.set(sx*0.085,0.30,0);
    hip.add(mk(legGeo,limbMat,0,-0.14,0));
    hip.add(mk(new THREE.BoxGeometry(0.115,0.075,0.17),bootMat,0,-0.27,0.02));
    inner.add(hip);legs.push(hip)}
  const body=mk(new THREE.BoxGeometry(0.33,0.34,0.24),coat,0,0.44,0);
  inner.add(body);
  inner.add(mk(new THREE.BoxGeometry(0.38,0.1,0.26),coat,0,0.585,0));
  inner.add(mk(new THREE.BoxGeometry(0.36,0.055,0.27),belt,0,0.30,0));
  for(const sx of[-1,1])
    inner.add(mk(new THREE.BoxGeometry(0.075,0.09,0.06),belt,sx*0.13,0.275,0.13));
  inner.add(mk(new THREE.BoxGeometry(0.24,0.26,0.11),belt,0,0.46,-0.18));
  const armGeo=new THREE.CapsuleGeometry(0.052,0.16,3,8);
  const arms=[];
  for(const sx of[-1,1]){
    const sh=new THREE.Group();sh.position.set(sx*0.205,0.57,0);
    sh.add(mk(armGeo,limbMat,0,-0.13,0));
    sh.add(mk(new THREE.SphereGeometry(0.052,8,6),bootMat,0,-0.25,0));
    inner.add(sh);arms.push(sh)}
  inner.add(mk(new THREE.CylinderGeometry(0.05,0.06,0.06,8),skin,0,0.635,0));
  const head=mk(new THREE.SphereGeometry(0.115,14,12),skin,0,0.72,0);
  head.scale.set(1,1.08,0.95);inner.add(head);
  inner.add(mk(hatGeo(),hatMat,0,0.775,0));
  inner.add(mk(new THREE.SphereGeometry(0.033,8,6),
    M(withLamp?0xFFF2C8:0x6A6256,withLamp?0xFFE7A0:0),0,0.80,0.145));
  let lamp=null;
  if(withLamp){lamp=new THREE.SpotLight(0xFFE7B0,6.0,7.4,0.55,0.55,1.1);
    // NO cookie texture here: SpotLight.map is fresh in r147 and fails to
    // link on a range of real GPU drivers, blacking out every lit material.
    // The readable cone comes from the ground-projected beam shader anyway.
    lamp.position.set(0,0.82,0.1);
    const lt=new THREE.Object3D();lt.position.set(0,0.25,2.4);
    inner.add(lt);lamp.target=lt;inner.add(lamp)}
  return {grp,inner,mats,lamp,legs,arms,body}}
// One texel per tile stretched over the whole map made the dark edge a
// tile-wide gradient — soft blobs that read as a smeared image. The mask is
// built at FOGSS subtexels per tile and the ramp is squeezed with a smooth
// curve, so the darkness now hugs what you can actually see.
const FOGSS=4;
function buildFog(){
  const W=sim.site.w*FOGSS,H=sim.site.h*FOGSS,data=new Uint8Array(W*H*4);
  for(let i=0;i<W*H;i++){data[i*4]=5;data[i*4+1]=7;data[i*4+2]=13;
    data[i*4+3]=255}
  const tex=new THREE.DataTexture(data,W,H,THREE.RGBAFormat);
  tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;
  const tw=sim.site.w,th=sim.site.h;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(tw,th),
    new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,
      fog:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(tw/2,0.045,th/2);
  mesh.renderOrder=6;
  return {mesh,tex,data}}
function computeVision(){
  const site=sim.site,W=site.w,H=site.h;
  const vis=R.vis||(R.vis=new Float32Array(W*H));
  vis.fill(0);
  if(!R.seen)R.seen=new Uint8Array(W*H);
  const setv=(x,y,v)=>{if(x<0||y<0||x>=W||y>=H)return;
    const i=y*W+x;if(v>vis[i])vis[i]=v};
  // You see where your people are LOOKING — nothing else. In the dark that
  // is the headlamp beam; where a room light burns it is ordinary sight.
  for(const p of site.roomTiles("Van"))setv(p[0],p[1],1);
  const BEAM=7.2,SIGHT=11.5;
  for(const s of sim.squad){
    if(!s.mobile())continue;
    const u=R.units[s.name],dir=u?u.dir:Math.PI;
    const fx=Math.sin(dir),fz=Math.cos(dir),cx=s.pos[0],cy=s.pos[1];
    const rad=Math.ceil(SIGHT);
    for(let y=Math.max(0,cy-rad);y<=Math.min(H-1,cy+rad);y++)
      for(let x=Math.max(0,cx-rad);x<=Math.min(W-1,cx+rad);x++){
        const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy);
        if(d>SIGHT)continue;
        if(!site.los([cx,cy],[x,y]))continue;
        if(d<1.7){setv(x,y,1);continue}
        const dot=(dx/d)*fx+(dy/d)*fz;
        const lit=site.lightLevel([x,y],sim.round);
        if(lit!=="dark"&&dot>=0.26)setv(x,y,lit==="lit"?1:0.8);
        if(d<=BEAM&&dot>=0.60)setv(x,y,Math.min(1,0.65+dot*0.4))}}
  for(let i=0;i<vis.length;i++)if(vis[i]>0.25)R.seen[i]=1;
  return vis}
function updateFog(vis){const {data,tex}=R.fog,W=sim.site.w,H=sim.site.h;
  // Once the contract is decided nobody is left to hold a lamp, so the live
  // cone collapses to nothing. Hand the map back instead of cutting to black:
  // remembered ground lifts, and even unwalked ground shows as a faint plan.
  const rest=sim.over?0.62:0.30,unknown=sim.over?0.10:0;
  const lvl=(x,y)=>{if(x<0||y<0||x>=W||y>=H)return unknown;
    const i=y*W+x;return vis[i]>0?vis[i]:(R.seen[i]?rest:unknown)};
  const FW=W*FOGSS,FH=H*FOGSS,inv=1/FOGSS;
  for(let sy=0;sy<FH;sy++){
    // sample the tile grid at subtexel centres, bilinear between tiles
    const wy=(sy+0.5)*inv-0.5,y0=Math.floor(wy),fy=wy-y0;
    for(let sx=0;sx<FW;sx++){
      const wx=(sx+0.5)*inv-0.5,x0=Math.floor(wx),fx=wx-x0;
      const a=lvl(x0,y0),b=lvl(x0+1,y0),c=lvl(x0,y0+1),d=lvl(x0+1,y0+1);
      let v=(a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
      // squeeze the ramp: a tile-wide linear fade reads as smear, an S-curve
      // reads as an edge the light stops at
      v=v<=0?0:(v>=1?1:v*v*(3-2*v));
      data[((FH-1-sy)*FW+sx)*4+3]=Math.round((1-v)*255)}}
  tex.needsUpdate=true}
function seenAt(p){return R.seen&&R.seen[p[1]*sim.site.w+p[0]]}
// The beam you actually read from above: a ground-projected cone, clipped by
// the same visibility texture the fog uses, so light never crosses a wall.
function sectorGeo(radius,halfAngle,seg){
  const pos=[],uv=[];
  for(let i=0;i<seg;i++){
    const a0=-halfAngle+2*halfAngle*i/seg,a1=-halfAngle+2*halfAngle*(i+1)/seg;
    pos.push(0,0,0, Math.sin(a0)*radius,0,Math.cos(a0)*radius,
             Math.sin(a1)*radius,0,Math.cos(a1)*radius);
    uv.push(0,0.5, 1,i/seg, 1,(i+1)/seg)}
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  return g}
const BEAM_VERT=`varying vec2 vUv;varying vec3 vW;
 void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;
  gl_Position=projectionMatrix*viewMatrix*w;}`;
const BEAM_FRAG=`uniform vec3 uColor;uniform float uTime,uInt,uW,uH;
 uniform sampler2D tFog;varying vec2 vUv;varying vec3 vW;
 void main(){
  float d=vUv.x;
  float ang=abs(vUv.y-0.5)*2.0;
  float a=pow(1.0-d,2.7)*0.85;
  a*=pow(1.0-ang,2.2);
  a*=0.88+0.12*sin(uTime*2.3+d*9.0);
  float vis=1.0-texture2D(tFog,vec2(vW.x/uW,1.0-vW.z/uH)).a;
  a*=smoothstep(0.12,0.55,vis);
  gl_FragColor=vec4(uColor*a*uInt,a*uInt);}`;
function makeBeam(){
  const m=new THREE.Mesh(sectorGeo(7.0,0.62,26),
    new THREE.ShaderMaterial({vertexShader:BEAM_VERT,fragmentShader:BEAM_FRAG,
      uniforms:{uColor:{value:new THREE.Color(0xE8C489)},uTime:{value:0},
        uInt:{value:0.62},uW:{value:24},uH:{value:18},tFog:{value:null}},
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending}));
  m.position.y=0.07;m.renderOrder=4;return m}
function buildUnits(){const G=R.unitG;
  while(G.children.length)G.remove(G.children[0]);
  R.units={};
  let ti=0;
  for(const s of sim.squad){
    const w=makeWorker(CLSCOL[s.cls],CLSCOL[s.cls],true);
    const {grp,inner,mats}=w;
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.3,0.4,24),
      new THREE.MeshBasicMaterial({color:0xF2E9D8,transparent:true,
        opacity:0.9,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2;ring.position.y=0.02;ring.visible=false;
    grp.add(ring);
    const tag=makeNameTag(s.name,"#"+CLSCOL[s.cls].toString(16).padStart(6,"0"));
    // stagger the plates: shoulder to shoulder in a doorway they stack
    // instead of colliding into one illegible bar
    tag.position.y=1.24+(ti++)*0.19;grp.add(tag);
    const burden=new THREE.Mesh(new THREE.CapsuleGeometry(0.13,0.3,4,8),
      new THREE.MeshStandardMaterial({color:0xC9C4B8,roughness:0.8}));
    burden.rotation.z=Math.PI/2.3;burden.position.set(0.05,0.86,-0.14);
    burden.castShadow=true;burden.visible=false;inner.add(burden);
    const beam=makeBeam();inner.add(beam);
    R.unitG.add(grp);
    R.units[s.name]={grp,inner,mats,ring,tag,burden,lamp:w.lamp,beam,
      legs:w.legs,arms:w.arms,body:w.body,gait:0,
      dir:Math.PI,pop:0,px:null,pz:null}}
  // ghost: identity per 02 §6 — color, bulk, bearing
  const gv=GHOSTVIS[sim.contract.trueGhost]||{c:0x7FD6B4,s:1,tall:false};
  const gg=new THREE.Group();
  const gm=new THREE.Mesh(new THREE.SphereGeometry(0.3,20,16),
    new THREE.MeshBasicMaterial({color:gv.c,transparent:true,opacity:0.7,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  gm.scale.set(gv.s,gv.s*(gv.tall?1.8:1),gv.s);gg.add(gm);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),
    color:gv.c,transparent:true,opacity:0.5,depthWrite:false,
    blending:THREE.AdditiveBlending}));
  halo.scale.set(1.7*gv.s,1.7*gv.s,1);gg.add(halo);
  gg.userData.motes=[];
  for(let i=0;i<4;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial(
    {map:glowTex(),color:gv.c,transparent:true,opacity:0.6,depthWrite:false,
     blending:THREE.AdditiveBlending}));
    m.scale.set(0.3,0.3,1);gg.add(m);gg.userData.motes.push(m)}
  gg.visible=false;R.unitG.add(gg);R.ghostM=gg;
  // Alpha casualty: same figure, other crew's livery, dead headlamp
  const aw=makeWorker(0xC9C4B8,0xC8564C,false);
  aw.grp.rotation.x=-Math.PI/2;          // lying on their back
  aw.grp.position.y=0.17;
  R.unitG.add(aw.grp);R.alphaM=aw.grp;R.alphaMats=aw.mats;R.alphaInner=aw.inner}
// dynamic per-state sync (called after actions / ghost phases) -------------
function lightFactor(name){const lv=sim.site.lightLevel(
  [Math.floor((ROOMS[name][0]+ROOMS[name][2])/2),
   Math.floor((ROOMS[name][1]+ROOMS[name][3])/2)],sim.round);
  return lv==="lit"?1.0:(lv==="dim"?0.86:0.72)}
function sceneSync(){if(!R||!sim)return;
  const site=sim.site;
  const vis=computeVision();updateFog(vis);
  // objects: hidden until discovered, dimmed once out of the light again
  const VW=site.w;
  for(const k in R.tileObjs){const p=k.split(",").map(Number);
    const i=p[1]*VW+p[0],now=vis[i]>0.05,ever=!!R.seen[i];
    for(const m of R.tileObjs[k]){m.visible=ever;
      if(ever&&m.userData.base&&m.material&&m.material.color)
        m.material.color.copy(m.userData.base).multiplyScalar(now?1:0.62)}}
  for(const dk in R.doors){const p=dk.split(",").map(Number);
    R.doors[dk].hinge.visible=!!R.seen[p[1]*VW+p[0]]}
  // room tint + warm room lights
  for(const[name,mesh]of Object.entries(R.roomFloors)){
    const f=name==="Van"?0.8:lightFactor(name);
    const base=new THREE.Color(ROOMBASE[name]||0xA09884).multiplyScalar(0.88);
    // cold rooms drift blue
    const t=site.temp[name]??13;
    if(t<=8)base.lerp(new THREE.Color(0x7FA0C8),0.35);
    mesh.material.color.copy(base).multiplyScalar(f)}
  for(const name of Object.keys(ROOMS)){
    const wants=name!=="Van"&&site.powered(name)&&
      sim.round>=(site.fixtureDead[name]||0);
    let L=R.roomLights[name];
    if(wants&&!L){const r=ROOMS[name];
      L=new THREE.PointLight(0xDEB884,3.7,7.4,1.7);
      L.position.set((r[0]+r[2])/2+0.5,1.9,(r[1]+r[3])/2+0.5);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.075,10,8),
        new THREE.MeshBasicMaterial({color:0xFFF0CC}));
      L.add(bulb);
      R.lightG.add(L);R.roomLights[name]=L}
    else if(!wants&&L){R.lightG.remove(L);delete R.roomLights[name]}}
  // lantern lights
  if(!R.lanternLs)R.lanternLs=[];
  while(R.lanternLs.length<site.lanterns.length){
    const L=new THREE.PointLight(0xDFA457,5.2,5.8,1.4);
    const flame=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6),
      new THREE.MeshBasicMaterial({color:0xFFD79A}));
    L.add(flame);
    R.lightG.add(L);R.lanternLs.push(L)}
  R.lanternLs.forEach((L,i)=>{const p=site.lanterns[i];
    L.visible=!!p;if(p)L.position.set(p[0]+0.5,0.8,p[1]+0.5)});
  // doors target
  for(const[k,d]of Object.entries(R.doors))
    d.target=site.doorOpen[k]?1:0,
    d.jam=site.jammed.has(k);
  // dynamic overlays: rebuild
  const G=R.dynG;
  while(G.children.length)G.remove(G.children[0]);
  clearHover();
  // room names, once any of the room has been seen
  for(const[rname,rr]of Object.entries(ROOMS)){
    if(rname==="Van")continue;
    let seen=false;
    for(let y=rr[1];y<=rr[3]&&!seen;y++)
      for(let x=rr[0];x<=rr[2];x++)
        if(seenAt([x,y])){seen=true;break}
    if(!seen)continue;
    const m=wordPlane(rname.toUpperCase());
    m.position.set(rr[0]+(rr[2]-rr[0]+1)/2,0.024,rr[1]+(rr[3]-rr[1]+1)/2);
    G.add(m)}
  const flat=(w,d,color,opacity,p,y=0.03)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
      new THREE.MeshBasicMaterial({color,transparent:true,opacity,
        depthWrite:false,side:THREE.DoubleSide}));
    m.rotation.x=-Math.PI/2;m.position.set(p[0]+0.5,y,p[1]+0.5);
    G.add(m);return m};
  // reachable tiles
  if(sel&&sel.mobile()&&!sel.hidden&&sel.ap>0&&!sim.over){
    const limit=sprint?7:(sel.carrying?3:(sel.cls==="Scout"?5:4));
    const blocked=sim.squad.filter(o=>o!==sel&&o.mobile()).map(o=>o.pos);
    for(const k of Object.keys(site.roomOf)){
      const p=k.split(",").map(Number);
      if(!site.walkable(p))continue;
      if(sim.squad.some(o=>o!==sel&&o.mobile()&&o.pos[0]===p[0]&&o.pos[1]===p[1]))continue;
      if(!seenAt(p))continue;
      const path=site.path(sel.pos,p,{blocked});
      if(path&&path.length>0&&path.length<=limit)
        flat(0.92,0.92,sprint?0xC8564C:0xDFA457,0.24,p)}}
  // salt lines
  for(const[k,line]of Object.entries(site.saltLines)){
    const p=k.split(",").map(Number);
    if(!seenAt(p))continue;
    const m=flat(0.9,0.5,0xffffff,line.state==="intact"?0.9:0.35,p,0.02);
    m.material.map=saltTex(line.state!=="intact");m.material.needsUpdate=true;
    if(line.record){const s=makeSprite("◉","#7FD6B4",0.4);
      s.position.set(p[0]+0.82,0.35,p[1]+0.2);G.add(s)}}
  // floor items
  for(const[k,items]of Object.entries(site.floorItems)){
    if(!items.length)continue;const p=k.split(",").map(Number);
    if(!seenAt(p))continue;
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(0.12),
      new THREE.MeshLambertMaterial({color:0xDFA457,emissive:0x6a4d1e}));
    m.position.set(p[0]+0.28,0.14,p[1]+0.7);G.add(m)}
  // markers
  const markers=[["F",FURNACE,"#C8564C"],["B",BREAKER,"#DFA457"]];
  for(const[txt,mp,mc]of[["FURNACE",FURNACE,"#C8564C"],
      ["BREAKER",BREAKER,"#DFA457"]]){
    if(!seenAt(mp))continue;
    const s=makeWord(txt,mc);s.position.set(mp[0]+0.5,0.42,mp[1]+0.5);G.add(s)}
  if(sim.anchorFound&&!sim.anchorConfirmed&&sim.anchorRoom)
    for(const spots of Object.values(ANCHORS))for(const p of spots)
      if(site.room(p)===sim.anchorRoom)markers.push(["?",p,"#7FD6B4"]);
  if(sim.anchorConfirmed)markers.push(["A",sim.contract.anchor,"#7FD6B4"]);
  for(const[t,p,c]of markers){if(!seenAt(p))continue;
    const s=makeSprite(t,c,0.62);
    s.position.set(p[0]+0.5,1.0,p[1]+0.5);s.userData.bob=true;G.add(s)}
  for(const rk of site.rubble){const p=rk.split(",").map(Number);
    if(!seenAt(p))continue;
    const rr2=RNG("rub:"+rk);
    for(let i=0;i<3;i++){
      const s2=0.16+rr2.random()*0.24;
      const m=box(s2,s2*0.6,s2,0x4A443C,null,{roughness:1});
      m.position.set(p[0]+0.2+rr2.random()*0.6,s2*0.3,p[1]+0.2+rr2.random()*0.6);
      m.rotation.y=rr2.random()*3.1;G.add(m)}
    const dustm=new THREE.Mesh(new THREE.PlaneGeometry(1,1),
      new THREE.MeshBasicMaterial({color:0x6A6258,transparent:true,opacity:0.25,
        depthWrite:false}));
    dustm.rotation.x=-Math.PI/2;dustm.position.set(p[0]+0.5,0.03,p[1]+0.5);
    G.add(dustm)}
  for(const[name,r]of Object.entries(ROOMS)){
    if(name!=="Van"&&(site.temp[name]??13)<=8){
      const w=r[2]-r[0]+1,d=r[3]-r[1]+1;
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
        new THREE.MeshBasicMaterial({color:0xBFE8FF,transparent:true,
          opacity:0.07,blending:THREE.AdditiveBlending,depthWrite:false}));
      m.rotation.x=-Math.PI/2;
      m.position.set(r[0]+w/2,0.018,r[1]+d/2);G.add(m)}}
  if(tutMarker)flat(0.96,0.96,0xDFA457,0.35,tutMarker,0.04);
  if(sim.site.furnaceOn){const fl=new THREE.PointLight(0xE07B3A,6.0,5.4);
    fl.position.set(FURNACE[0]+0.5,0.7,FURNACE[1]+0.5);G.add(fl);
    const ember=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8),
      new THREE.MeshBasicMaterial({color:0xFF9A4A}));
    ember.position.copy(fl.position);G.add(ember)}
  // units
  for(const s of sim.squad){const u=R.units[s.name];if(!u)continue;
    const down=s.downed||s.dead;
    u.mats.forEach(m=>{m.opacity=s.hidden?0.35:1});
    u.inner.rotation.x=down?Math.PI/2:0;
    u.inner.position.y=down?0.15:0;
    if(u.ring.visible!==(sel===s)&&sel===s)u.pop=1;
    u.ring.visible=sel===s;
    u.burden.visible=!!s.carrying;
    u.tag.material.opacity=s.hidden?0.4:1}
  SND.updateAmbients();
  // Alpha: lying where they fell — or standing, if something wears them
  const showAlpha=!sim.alpha.rescued&&sim.alpha.carriedBy==null&&
    (seenAt(sim.alpha.pos)||sim.hosted);
  R.alphaM.visible=showAlpha;
  if(showAlpha){
    R.alphaM.rotation.x=sim.hosted?0:-Math.PI/2;
    R.alphaM.position.set(sim.alpha.pos[0]+0.5,sim.hosted?0:0.17,
      sim.alpha.pos[1]+0.5);
    R.alphaMats.forEach(m=>{m.emissive.setHex(sim.hosted?0x5A2E8A:0x000000);
      m.emissiveIntensity=sim.hosted?0.9:0})}}
// per-frame ---------------------------------------------------------------
let lastT=0;
// one bad frame must never kill the loop: catch, count, carry on
function frame(now){requestAnimationFrame(frame);
  try{frameBody(now)}catch(e){
    R&&(R._ferr=(R._ferr||0)+1);
    if(R&&R._ferr===1)console.error("frame error:",e);
    if(R&&R._ferr===3)toast("renderer hiccup — recovering")}}
function frameBody(now){
  if(!R||!sim)return;
  { // camera: ease toward target, apply frustum for current viewport
    const c=R.cam,e=REDUCED?1:0.14;
    c.cx+=(c.tx-c.cx)*e;c.cz+=(c.tz-c.cz)*e;c.half+=(c.th-c.half)*e;
    const aspect=R.W/R.H,cam=R.camera;
    cam.left=-c.half;cam.right=c.half;
    cam.top=c.half/aspect;cam.bottom=-c.half/aspect;
    cam.position.set(c.cx,15,c.cz+16.9);
    cam.lookAt(c.cx,0,c.cz);
    cam.updateProjectionMatrix()}
  // tween positions
  for(const t of tweens){const p=Math.max(0,Math.min(1,(now-t.t0)/t.dur));
    const seg=p*(t.pts.length-1),
      i=Math.max(0,Math.min(t.pts.length-2,Math.floor(seg))),f=seg-i;
    anim[t.name]={x:t.pts[i][0]+(t.pts[i+1][0]-t.pts[i][0])*f,
      y:t.pts[i][1]+(t.pts[i+1][1]-t.pts[i][1])*f}}
  tweens=tweens.filter(t=>now-t.t0<t.dur);
  for(const s of sim.squad){const u=R.units[s.name];if(!u)continue;
    const a=animPos(s.name,s.pos);
    u.grp.position.set(a.x+0.5,0,a.y+0.5);
    let speed=0;
    if(u.px!=null){const dx=a.x-u.px,dz=a.y-u.pz;
      speed=Math.abs(dx)+Math.abs(dz);
      if(speed>0.004)u.dir=Math.atan2(dx,dz)}
    u.px=a.x;u.pz=a.y;
    if(!REDUCED&&u.legs){                       // gait: hips and arms oppose
      u.gait=(u.gait||0)+Math.min(0.9,speed*11);
      const sw=Math.sin(u.gait)*(speed>0.004?0.62:0)
        +(speed>0.004?0:Math.sin(now*0.0016)*0.02);
      u.legs[0].rotation.x=sw;u.legs[1].rotation.x=-sw;
      if(u.arms){u.arms[0].rotation.x=-sw*0.75;u.arms[1].rotation.x=sw*0.75}
      if(u.body)u.body.position.y=0.44+Math.abs(Math.sin(u.gait))*0.018*
        (speed>0.004?1:0)}
    let dd=u.dir-u.inner.rotation.y;
    while(dd>Math.PI)dd-=2*Math.PI;while(dd<-Math.PI)dd+=2*Math.PI;
    u.inner.rotation.y+=dd*(REDUCED?1:0.25);
    if(u.pop>0.001){u.pop*=0.86;
      const sc=1+u.pop*0.25;u.grp.scale.set(sc,sc,sc)}else u.grp.scale.set(1,1,1)}
  // ghost
  const gvis=(sim.hunt&&sim.squad.some(s=>s.mobile()&&!s.hidden&&
    sim.site.los(s.pos,sim.gpos)))||sim.hosted;
  const ga=animPos("ghost",sim.gpos);
  R.ghostM.visible=gvis;
  R.ghostM.position.set(ga.x+0.5,
    0.55+(REDUCED?0:Math.sin(now*0.003)*0.08),ga.y+0.5);
  if(gvis&&!REDUCED){const body=R.ghostM.children[0];
    if(!body.userData.base)body.userData.base=body.scale.clone();
    const b0=body.userData.base;
    body.scale.set(b0.x*(1+Math.sin(now*0.0042)*0.10),
      b0.y*(1+Math.sin(now*0.0031+1.7)*0.12),
      b0.z*(1+Math.sin(now*0.0037+3.1)*0.08));
    R.ghostM.rotation.y=now*0.0004}
  if(gvis&&!REDUCED)R.ghostM.userData.motes.forEach((m,i)=>{
    const a2=now*0.0016+i*Math.PI/2;
    m.position.set(Math.cos(a2)*0.55,0.15+Math.sin(now*0.002+i)*0.2,
      Math.sin(a2)*0.55)});
  R.ghostLight.intensity=gvis?3.0:0;
  R.ghostLight.position.set(ga.x+0.5,0.9,ga.y+0.5);
  // hunt light breathes at the ghost
  if(sim.hunt&&!REDUCED){R.huntLight.intensity=2.2+Math.sin(now*0.006)*1.3;
    R.huntLight.position.set(ga.x+0.5,1.2,ga.y+0.5)}
  else R.huntLight.intensity=sim.hunt?2.6:0;
  // doors ease open/closed
  for(const d of Object.values(R.doors)){
    d.open=d.open??0;const tg=d.target??0;
    d.open+=(tg-d.open)*(REDUCED?1:0.18);
    d.hinge.rotation.y=d.sign*d.open*1.62;
    d.hinge.children[0].material.color.setHex(d.jam?0xB07268:0xffffff)}
  // marker bob
  R.dynG.traverse(o=>{if(o.userData&&o.userData.bob&&!REDUCED)
    o.position.y=1.0+Math.sin(now*0.0028+o.position.x)*0.07});
  if(R.dust&&!REDUCED){R.dust.position.y=Math.sin(now*0.00035)*0.1;
    R.dust.position.x=Math.sin(now*0.00021)*0.35}
  for(const s of sim.squad){const u=R.units[s.name];if(!u||!u.beam)continue;
    const on=s.mobile()&&!s.hidden;
    u.beam.visible=on;
    if(on){const uf=u.beam.material.uniforms;
      uf.uTime.value=now*0.001;
      uf.tFog.value=R.fog?R.fog.tex:null;
      uf.uW.value=sim.site.w;uf.uH.value=sim.site.h;
      uf.uInt.value=(R.q>0?0.62:0.5)*(sel===s?1.15:0.9)}}
  if(!REDUCED)for(const nm in R.roomLights){const L=R.roomLights[nm];
    const f=Math.sin(now*0.011+nm.length*2.1)*Math.sin(now*0.0037+nm.length);
    L.intensity=3.7*(0.86+0.14*f)*(1-0.25*(sim.dread/100))}
  SND.update(now);SND.ambientTick(now);
  // floating world-space popups
  R.pops=(R.pops||[]).filter(p=>{const age=(now-p.t0)/1100;
    if(age>=1){R.fxG2&&R.fxG2.remove(p.spr);R.scene.remove(p.spr);return false}
    p.spr.position.y=p.y0+age*0.85;
    p.spr.material.opacity=age<0.15?age/0.15:1-(age-0.15)/0.85;return true});
  // screen shake
  if(R.shake>0.004){const s=R.shake;
    R.camera.position.x+=(Math.random()-0.5)*s;
    R.camera.position.y+=(Math.random()-0.5)*s*0.5;
    R.shake*=0.86}else R.shake=0;
  // rings
  rings=rings.filter(r=>now-r.t0<900);
  while(R.fxG.children.length)R.fxG.remove(R.fxG.children[0]);
  for(const r of rings){const age=(now-r.t0)/900;
    const col=(r.kind==="strike"||r.kind==="backfire")?0xC8564C:0x7FD6B4;
    const m=new THREE.Mesh(new THREE.RingGeometry(0.2+age*1.6,0.3+age*1.7,28),
      new THREE.MeshBasicMaterial({color:col,transparent:true,
        opacity:(1-age)*0.85,side:THREE.DoubleSide,depthWrite:false,
        blending:THREE.AdditiveBlending}));
    m.rotation.x=-Math.PI/2;
    m.position.set(r.pos[0]+0.5,0.06,r.pos[1]+0.5);
    R.fxG.add(m)}
  renderPost(now)}
// input -------------------------------------------------------------------
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),
  groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const ptrs=new Map();let dragMoved=false,pinch0=null;
function bindInput(el){
  el.addEventListener("pointerdown",e=>{el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY});
    if(ptrs.size===1)dragMoved=false;
    if(ptrs.size===2){const a=[...ptrs.values()];
      pinch0={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),half:R.cam.th}}});
  el.addEventListener("pointermove",e=>{const p=ptrs.get(e.pointerId);
    if(!p){if(e.pointerType==="mouse")hoverAt(e);return}
    const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(ptrs.size===2&&pinch0){const a=[...ptrs.values()];
      const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      R.cam.th=Math.max(4.5,Math.min(13.5,pinch0.half*pinch0.d/Math.max(40,d)));
      dragMoved=true;return}
    if(Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>9)dragMoved=true;
    if(dragMoved&&ptrs.size===1){
      const wpp=(2*R.cam.half)/R.W;
      R.cam.tx=R.cam.cx=Math.max(4,Math.min(20,R.cam.cx-dx*wpp));
      R.cam.tz=R.cam.cz=Math.max(3,Math.min(15.5,R.cam.cz-dy*wpp*1.5))}});
  const up=e=>{const p=ptrs.get(e.pointerId);ptrs.delete(e.pointerId);
    if(ptrs.size<2)pinch0=null;
    if(p&&!dragMoved&&ptrs.size===0)tapAt(e)};
  el.addEventListener("pointerup",up);
  el.addEventListener("pointercancel",e=>{ptrs.delete(e.pointerId);pinch0=null});
  el.addEventListener("wheel",e=>{e.preventDefault();
    R.cam.th=Math.max(4.5,Math.min(13.5,R.cam.th*(e.deltaY>0?1.1:0.9)))},
    {passive:false})}
function tapAt(e){if(!sim||sim.over)return;
  const r=R.renderer.domElement.getBoundingClientRect();
  ndc.x=((e.clientX-r.left)/r.width)*2-1;
  ndc.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,R.camera);
  const hit=new THREE.Vector3();
  if(!ray.ray.intersectPlane(groundPlane,hit))return;
  const p=[Math.floor(hit.x),Math.floor(hit.z)];
  if(p[0]<0||p[1]<0||p[0]>=sim.site.w||p[1]>=sim.site.h)return;
  tapTile(p)}
// desktop nicety: hovering a reachable tile sketches the walk before you
// commit to it — footfall dots along the actual path the move will take
let hoverTile=null;
function clearHover(){hoverTile=null;
  if(R&&R.hoverG)while(R.hoverG.children.length)R.hoverG.remove(R.hoverG.children[0])}
function hoverAt(e){
  if(!sim||sim.over||!R||!sel||!sel.mobile()||sel.hidden||!sel.ap){clearHover();return}
  const r=R.renderer.domElement.getBoundingClientRect();
  ndc.x=((e.clientX-r.left)/r.width)*2-1;
  ndc.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(ndc,R.camera);
  const hit=new THREE.Vector3();
  if(!ray.ray.intersectPlane(groundPlane,hit)){clearHover();return}
  const p=[Math.floor(hit.x),Math.floor(hit.z)];
  if(hoverTile&&hoverTile[0]===p[0]&&hoverTile[1]===p[1])return;
  clearHover();hoverTile=p;
  const site=sim.site;
  if(p[0]<0||p[1]<0||p[0]>=site.w||p[1]>=site.h)return;
  if(!site.walkable(p)||!seenAt(p))return;
  if(!R.hoverG){R.hoverG=new THREE.Group();R.scene.add(R.hoverG)}
  const limit=sprint?7:(sel.carrying?3:(sel.cls==="Scout"?5:4));
  const blocked=sim.squad.filter(o=>o!==sel&&o.mobile()).map(o=>o.pos);
  const path=site.path(sel.pos,p,{blocked});
  if(!path||!path.length||path.length>limit)return;
  const mat=new THREE.MeshBasicMaterial({color:sprint?0xC8564C:0xF2E9D8,
    transparent:true,opacity:0.5,depthWrite:false});
  if(!GEO.hoverDot)GEO.hoverDot=new THREE.CircleGeometry(0.085,10);
  path.forEach((q,i)=>{const m=new THREE.Mesh(GEO.hoverDot,mat);
    m.rotation.x=-Math.PI/2;m.scale.setScalar(i===path.length-1?1.7:1);
    m.position.set(q[0]+0.5,0.052,q[1]+0.5);R.hoverG.add(m)})}
// keyboard: selection, cycling, turn end — documented in the field guide
addEventListener("keydown",e=>{
  if(!sim||!$("#play").classList.contains("on"))return;
  if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if($("#modal").classList.contains("on")){
    if(e.key==="Escape")closeModal();return}
  const k=e.key;
  if(k==="Escape"){
    if($("#drawer").classList.contains("on"))closeDrawer();
    else{sel=null;renderAll()}return}
  if(k==="1"||k==="2"||k==="3"){const s=sim.squad[+k-1];
    if(s&&s.mobile()){sel=s;camFollow(s.pos);renderAll()}return}
  if(k==="Tab"||k===" "){e.preventDefault();
    const mob=sim.squad.filter(s=>s.mobile());if(!mob.length)return;
    sel=mob[(mob.indexOf(sel)+1)%mob.length];camFollow(sel.pos);renderAll();return}
  if(k==="Enter"||k==="e"||k==="E"){
    if(document.activeElement&&document.activeElement.tagName==="BUTTON")return;
    endTurn();return}
  if((k==="h"||k==="H")&&sel&&sel.mobile()){
    act(sel.hidden?sim.actUnhide(sel):sim.actHide(sel));return}
  if((k==="f"||k==="F")&&sel&&sel.mobile()){sprint=!sprint;renderAll()}});
function popup(text,color,p,scale=1){if(!R)return;
  const spr=makeWord(text,color);
  spr.scale.set(2.1*scale,0.4*scale,1);
  spr.position.set(p[0]+0.5,0.9,p[1]+0.5);
  spr.material.opacity=0;
  R.scene.add(spr);
  (R.pops=R.pops||[]).push({spr,t0:performance.now(),y0:0.9})}
function showBanner(text,color){const b=$("#banner");
  $("#bannerTx").textContent=text;
  $("#bannerTx").style.color=color||"var(--hazard)";
  b.classList.remove("show");void b.offsetWidth;b.classList.add("show")}
function flash(){const f=$("#flash");f.classList.add("on");
  setTimeout(()=>f.classList.remove("on"),90)}
function draw(){sceneSync()}
// ================= procedural sound (WebAudio, no assets) =================
const SND={ctx:null,muted:false,_u:0,_hb:0,
 amb:{},fireAud:0,dripAud:0,
 init(){if(this.ctx)return;
  try{
   const C=this.ctx=new(window.AudioContext||window.webkitAudioContext)();
   const master=this.master=C.createGain();
   master.gain.value=0.32;
   // the glue that separates "sound design" from "chip beeps": everything
   // passes through soft tape-style saturation, a bus compressor and gentle
   // EQ shelves before it reaches the hardware
   const hp=C.createBiquadFilter();hp.type="highpass";hp.frequency.value=36;
   const shaper=C.createWaveShaper();
   {const N=1024,curve=new Float32Array(N);
    for(let i=0;i<N;i++){const x=(i/(N-1))*2-1;curve[i]=Math.tanh(x*1.5)/Math.tanh(1.5)}
    shaper.curve=curve;shaper.oversample="2x"}
   const comp=C.createDynamicsCompressor();
   comp.threshold.value=-20;comp.knee.value=14;comp.ratio.value=3.2;
   comp.attack.value=0.004;comp.release.value=0.18;
   const airCut=C.createBiquadFilter();airCut.type="lowpass";
   airCut.frequency.value=13500;airCut.Q.value=0.5;
   master.connect(hp);hp.connect(shaper);shaper.connect(comp);
   comp.connect(airCut);airCut.connect(C.destination);
   // a room to play it in: convolution reverb from exponentially decaying
   // noise — the standard procedural impulse response
   const IRLEN=Math.floor(C.sampleRate*2.1);
   const ir=C.createBuffer(2,IRLEN,C.sampleRate);
   for(let ch=0;ch<2;ch++){const d2=ir.getChannelData(ch);
     for(let i=0;i<IRLEN;i++){const t2=i/IRLEN;
       d2[i]=(Math.random()*2-1)*Math.pow(1-t2,3.2)*(i<400?i/400:1)}}
   const conv=this.conv=C.createConvolver();conv.buffer=ir;
   const wet=this.wet=C.createGain();wet.gain.value=0.4;
   const damp=C.createBiquadFilter();damp.type="lowpass";damp.frequency.value=2200;
   conv.connect(damp);damp.connect(wet);wet.connect(master);
   // dread drone: detuned sines + filtered noise, gain follows the dial
   const g=this.droneG=C.createGain();g.gain.value=0;g.connect(master);
   const o1=this.o1=C.createOscillator();o1.type="sine";o1.frequency.value=47;
   const o2=C.createOscillator();o2.type="sine";o2.frequency.value=47.6;
   const og=C.createGain();og.gain.value=0.5;
   o1.connect(og);o2.connect(og);og.connect(g);
   const nb=C.createBuffer(1,C.sampleRate*2,C.sampleRate);
   const d=nb.getChannelData(0);
   for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
   this.noiseBuf=nb;
   const ns=C.createBufferSource();ns.buffer=nb;ns.loop=true;
   const lp=this.lp=C.createBiquadFilter();lp.type="lowpass";lp.frequency.value=200;
   const ng=C.createGain();ng.gain.value=0.10;
   ns.connect(lp);lp.connect(ng);ng.connect(g);
   // the drone breathes: two very slow LFOs work the filter and the level so
   // the bed is never a frozen tone
   const lfo1=C.createOscillator();lfo1.frequency.value=0.06;
   const lfo1g=C.createGain();lfo1g.gain.value=70;
   lfo1.connect(lfo1g);lfo1g.connect(lp.frequency);
   const lfo2=C.createOscillator();lfo2.frequency.value=0.11;
   const lfo2g=C.createGain();lfo2g.gain.value=0.012;
   lfo2.connect(lfo2g);lfo2g.connect(g.gain);
   lfo1.start();lfo2.start();
   o1.start();o2.start();ns.start();
   if(C.state==="suspended")C.resume();
  }catch(e){this.ctx=null}},
 update(now){const C=this.ctx;if(!C||this.muted||!sim)return;
  if(now-this._u<180)return;this._u=now;
  const dr=sim.dread/100,t=C.currentTime;
  this.droneG.gain.setTargetAtTime(
    (sim.over?0:0.05+dr*0.30+(sim.hunt?0.12:0)),t,0.5);
  this.o1.frequency.setTargetAtTime(45+dr*20,t,0.8);
  this.lp.frequency.setTargetAtTime(170+dr*520,t,0.6);
  // heartbeat while hunting / prelude
  if((sim.hunt||sim.prelude)&&!sim.over&&now>this._hb){
    this._hb=now+(sim.hunt?560:900);
    this.thump(0.09);setTimeout(()=>this.thump(0.055),150)}},
 out(node,pan,wetAmt){const C=this.ctx;let n=node;
  if(C.createStereoPanner){const pn=C.createStereoPanner();
    pn.pan.value=Number.isFinite(pan)?Math.max(-1,Math.min(1,pan)):0;
    n.connect(pn);n=pn}
  n.connect(this.master);
  const w=C.createGain();w.gain.value=wetAmt==null?0.5:wetAmt;
  n.connect(w);w.connect(this.conv)},
 panOf(pos){if(!pos||!R||!R.cam)return 0;
  return Math.max(-1,Math.min(1,(pos[0]+0.5-R.cam.cx)/(R.cam.half*0.9)))},
 osc(freq,dur,type,vol,glide,pan,muffle){const C=this.ctx;
  if(!C||this.muted)return;
  const o=C.createOscillator(),g=C.createGain(),t=C.currentTime;
  o.type=type||"sine";o.frequency.setValueAtTime(freq,t);
  if(glide)o.frequency.exponentialRampToValueAtTime(
    Math.max(20,freq+glide),t+dur);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g);
  let tail=g;
  if(muffle){const f=C.createBiquadFilter();f.type="lowpass";
    f.frequency.value=muffle;g.connect(f);tail=f}
  this.out(tail,pan);
  o.start(t);o.stop(t+dur+0.05)},
 hiss(dur,vol,freq,pan,q){const C=this.ctx;
  if(!C||this.muted)return;
  const s=C.createBufferSource();s.buffer=this.noiseBuf;
  const f=C.createBiquadFilter();f.type="bandpass";
  f.frequency.value=freq||900;f.Q.value=q||0.8;
  const g=C.createGain();const t=C.currentTime;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+0.03);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f);f.connect(g);this.out(g,pan);
  s.start(t);s.stop(t+dur+0.05)},
 // Boots: a heel strike and a toe roll, each a modal impact voiced by the
 // surface — hollow boards, hard tile, dead carpet.
 stepSpec(kind){switch(kind){
  case"tile":return{modes:[[1180,0.5,0.10],[1870,0.32,0.07],[2640,0.2,0.05]],
    noise:[3000,0.5,0.045,2.4],wet:0.65};
  case"stone":return{modes:[[300,0.7,0.09],[620,0.34,0.06],[1150,0.18,0.04]],
    noise:[1500,0.7,0.07,1.1],wet:0.7};
  case"carpet":return{modes:[[150,0.5,0.06],[260,0.2,0.04]],
    noise:[520,0.9,0.075,0.7],wet:0.25};
  case"concrete":return{modes:[[480,0.55,0.07],[980,0.28,0.05]],
    noise:[2100,0.6,0.05,1.6],wet:0.5};
  case"wooddark":
  case"wood":
  default:return{modes:[[176,0.85,0.16,"sine"],[338,0.42,0.11],
    [521,0.25,0.08],[880,0.12,0.05]],noise:[1300,0.45,0.05,1.8],wet:0.5}}},
 step(room,pan){
  const k=(typeof ROOMFLOOR!=="undefined"&&ROOMFLOOR[room])||"wood";
  const spec=this.stepSpec(k);
  const v=0.05*(0.8+Math.random()*0.4);      // no two steps identical
  this.modal(spec,v,pan,0.10);
  setTimeout(()=>this.modal(spec,v*0.55,pan,0.14),58+Math.random()*26)},
 // an ensemble, not a beep: each pitch is a detuned oscillator pair with a
 // shared vibrato, breathed in and out through a moving lowpass
 pad(freqs,dur,vol,pan,o={}){const C=this.ctx;if(!C||this.muted)return;
  const t=C.currentTime,att=o.att||0.12,rel=Math.min(dur*0.6,o.rel||dur*0.45);
  const lp=C.createBiquadFilter();lp.type="lowpass";lp.Q.value=o.q||0.8;
  lp.frequency.setValueAtTime(Math.max(60,o.f0||900),t);
  if(o.f1)lp.frequency.exponentialRampToValueAtTime(Math.max(60,o.f1),t+dur);
  const g=C.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol),t+att);
  g.gain.setValueAtTime(Math.max(0.0002,vol),t+Math.max(att,dur-rel));
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  lp.connect(g);this.out(g,pan,o.wet==null?0.6:o.wet);
  const vib=C.createOscillator();vib.frequency.value=o.vibHz||3.8;
  const vg=C.createGain();vg.gain.value=o.vib==null?1.8:o.vib;
  vib.connect(vg);
  for(const f of freqs)for(const d2 of[-1,1]){
    const os=C.createOscillator();os.type=o.type||"sine";
    os.frequency.value=f*(1+d2*(o.det==null?0.004:o.det));
    vg.connect(os.frequency);
    os.connect(lp);os.start(t);os.stop(t+dur+0.1)}
  vib.start(t);vib.stop(t+dur+0.1)},
 // air moving: looped noise pushed through a travelling bandpass
 sweep(f0,f1,dur,vol,pan,q,o={}){const C=this.ctx;if(!C||this.muted)return;
  const t=C.currentTime;
  const s=C.createBufferSource();s.buffer=this.noiseBuf;s.loop=true;
  const f=C.createBiquadFilter();f.type=o.type||"bandpass";
  f.frequency.setValueAtTime(Math.max(30,f0),t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t+dur);
  f.Q.value=q==null?1.4:q;
  const g=C.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol),t+(o.att||dur*0.55));
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f);f.connect(g);this.out(g,pan,o.wet==null?0.5:o.wet);
  s.start(t);s.stop(t+dur+0.1)},
 // a heart is wet muscle, not a sine blip: pitch-bent low modes + a chest
 // of filtered noise, lub then dub handled by the caller
 thump(vol){this.modal({modes:[[56,1.0,0.16,"sine",0.66],[88,0.42,0.11,"sine",0.7]],
   noise:[140,0.4,0.06,0.6],wet:0.15},vol,0,0.05)},
 // How loud is a thing at that tile for the people actually on site? Uses
 // the sim's own propagation: -1 per tile, -3 per closed door, walls block.
 audibility(pos,noise){if(!sim||!pos)return 0;
  const n=noise||7;
  const heard=sim.site.loudness(pos,n);
  let best=0;
  for(const s of sim.squad){if(!s.mobile())continue;
    const v=heard[s.pos[0]+","+s.pos[1]]||0;if(v>best)best=v}
  return Math.min(1,best/n)},
 // Impacts as a sum of decaying modes plus a noise transient — the standard
 // physically-informed recipe, and far closer to a real surface than a beep.
 modal(spec,vol,pan,spread){const C=this.ctx;
  if(!C||this.muted||!spec||!spec.modes)return;
  // a NaN slipping into an AudioParam kills the node graph for the rest of
  // the shift, so nothing reaches the hardware unvetted
  pan=Number.isFinite(pan)?Math.max(-1,Math.min(1,pan)):0;
  vol=Number.isFinite(vol)?vol:0.05;
  const t=C.currentTime;
  const jitter=1+(Math.random()-0.5)*(spread==null?0.06:spread);
  for(const m of spec.modes){
    const o=C.createOscillator(),g=C.createGain();
    o.type=m[3]||"sine";
    o.frequency.setValueAtTime(m[0]*jitter,t);
    if(m[4])o.frequency.exponentialRampToValueAtTime(
      Math.max(30,m[0]*jitter*m[4]),t+m[2]);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol*m[1]),t+0.004);
    g.gain.exponentialRampToValueAtTime(0.0001,t+m[2]);
    o.connect(g);this.out(g,pan,spec.wet==null?0.5:spec.wet);
    o.start(t);o.stop(t+m[2]+0.05)}
  if(spec.noise)this.hiss(spec.noise[2],vol*spec.noise[1],
    spec.noise[0]*jitter,pan,spec.noise[3]||1.4)},
 bed(id,freq,q,type){const C=this.ctx;
  if(!C)return null;
  if(this.amb[id])return this.amb[id];
  const s=C.createBufferSource();s.buffer=this.noiseBuf;s.loop=true;
  const f=C.createBiquadFilter();f.type=type||"bandpass";
  f.frequency.value=freq;f.Q.value=q||0.7;
  const g=C.createGain();g.gain.value=0;
  s.connect(f);f.connect(g);
  let tail=g,pan=null;
  if(C.createStereoPanner){pan=C.createStereoPanner();g.connect(pan);tail=pan}
  tail.connect(this.master);
  const w=C.createGain();w.gain.value=0.3;tail.connect(w);w.connect(this.conv);
  s.start();
  return this.amb[id]={g,pan,s}},
 hum(id,freq){const C=this.ctx;
  if(!C)return null;
  if(this.amb[id])return this.amb[id];
  const o=C.createOscillator();o.type="sawtooth";o.frequency.value=freq;
  const o2=C.createOscillator();o2.type="sine";o2.frequency.value=freq*2.02;
  const f=C.createBiquadFilter();f.type="lowpass";f.frequency.value=380;
  const g=C.createGain();g.gain.value=0;
  o.connect(f);o2.connect(f);f.connect(g);
  let tail=g,pan=null;
  if(C.createStereoPanner){pan=C.createStereoPanner();g.connect(pan);tail=pan}
  tail.connect(this.master);
  o.start();o2.start();
  return this.amb[id]={g,pan}},
 setAmb(id,gain,pan){const a=this.amb[id];if(!a||!this.ctx)return;
  a.g.gain.setTargetAtTime(this.muted?0:gain,this.ctx.currentTime,0.25);
  if(a.pan)a.pan.pan.value=Math.max(-1,Math.min(1,pan||0))},
 // every ambient bed belongs to an object on the map, never to "the level"
 updateAmbients(){const C=this.ctx;if(!C||!sim)return;
  const site=sim.site;
  this.bed("fire",620,0.8);this.bed("lamp",2600,1.1);
  this.bed("wind",300,0.5);this.hum("mains",50);
  const set=(id,pos,on,vol)=>{
    const a=on?this.audibility(pos,7):0;
    this.setAmb(id,a*vol,this.panOf(pos));
    return a};
  this.fireAud=set("fire",FURNACE,site.furnaceOn,0.30);
  set("mains",BREAKER,site.breakerOn,0.045);
  const lamp=site.lanterns[0];
  set("lamp",lamp||FURNACE,!!lamp,0.05);
  const win=WINDOWS.find(p=>site.windowOpen[p[0]+","+p[1]]);
  set("wind",win||FURNACE,!!win,0.13);
  this.dripAud=this.audibility([20,6],6)},
 // crackles and drips are events, not loops — they only fire when heard
 ambientTick(now){const C=this.ctx;if(!C||this.muted||!sim)return;
  if(this.fireAud>0.08&&now>(this._fire||0)){
    this._fire=now+180+Math.random()*520;
    this.hiss(0.05+Math.random()*0.06,0.02*this.fireAud,
      900+Math.random()*1400,this.panOf(FURNACE),3.0)}
  if(this.dripAud>0.12&&now>(this._drip||0)){
    this._drip=now+2200+Math.random()*3600;
    this.osc(1500,0.05,"sine",0.02*this.dripAud,-900,this.panOf([20,6]));
    setTimeout(()=>this.hiss(0.07,0.012*this.dripAud,2600,
      this.panOf([20,6]),2.0),40)}},
 ghostTone(){const T={hantu:196,demon:104,mare:147,jinn:262,wraith:175,
   yurei:233,poltergeist:311,banshee:392,revenant:131,shade:208,draugr:87,
   dybbuk:156};
  return (sim&&T[sim.contract.trueGhost])||220},
 play(name,pos){const C=this.ctx;if(!C||this.muted)return;
  const pan=this.panOf(pos);
  switch(name){
  case"collapse":this.osc(36,2.0,"sawtooth",0.13,-13,0,320);
    this.osc(53,1.6,"sine",0.09,-18,0,500);
    this.hiss(1.8,0.10,170,0,0.45);
    this.sweep(1400,120,1.6,0.05,0,0.7,{att:0.1});   // dust front rolling out
    for(let i=0;i<7;i++)setTimeout(()=>            // masonry coming down
      this.modal({modes:[[130+Math.random()*220,0.9,0.13],
        [420+Math.random()*300,0.4,0.07]],noise:[900,0.8,0.09,0.8],wet:0.9},
        0.05+Math.random()*0.05,(Math.random()-0.5)*1.4),
      120+i*(160+Math.random()*220));
    break;
  case"tap":this.modal({modes:[[430,0.6,0.05],[760,0.35,0.035],[1240,0.18,0.02]],
    noise:[2100,0.7,0.018,2.4],wet:0.2},0.03,pan,0.1);break;   // felt thock
  case"door":{
    this.hiss(0.36,0.05,230,pan,1.2);                  // dry hinge
    this.osc(148+Math.random()*70,0.34,"sawtooth",0.022,-58,pan,850);
    setTimeout(()=>this.modal({modes:[[2100,0.6,0.03,"square"],
      [3400,0.3,0.02]],noise:[4200,0.8,0.035,3]},0.05,pan),
      300+Math.random()*60);                           // the latch drops
    setTimeout(()=>this.modal({modes:[[95,0.9,0.28],[210,0.4,0.16]],
      noise:[500,0.4,0.07,1]},0.05,pan),330);          // the leaf settles
    break}
  case"ev":{const g0=this.ghostTone();
    // a presence, not a tone: inharmonic partials drifting under a breath
    this.pad([g0,g0*1.5,g0*2.26],0.9,0.02,pan,
      {f0:520,f1:1700,att:0.28,det:0.007,vib:3.2,vibHz:2.7,wet:0.75});
    this.sweep(360,1500,0.7,0.022,pan,3.2,{att:0.25,wet:0.7});break}
  case"al":this.modal({modes:[[72,1.0,0.42],[117,0.5,0.26],[181,0.28,0.15]],
      noise:[260,0.5,0.11,0.8],wet:0.75},0.07,pan,0.06);
    this.sweep(950,210,0.4,0.028,pan,1.1,{att:0.05});break;
  case"prelude":this.sweep(90,850,1.7,0.055,0,1.0,{att:1.2,wet:0.7});
    this.pad([46,61.5],1.9,0.05,0,
      {type:"sawtooth",f0:130,f1:430,att:0.8,det:0.009,vib:1.2,wet:0.6});break;
  case"strike":this.modal({modes:[[92,1.0,0.30],[143,0.6,0.20],
      [268,0.3,0.12]],noise:[700,0.9,0.13,0.9],wet:0.8},0.13,pan);
    this.thump(0.10);break;
  case"down":this.osc(300,0.5,"triangle",0.05,-170,pan,650);
    this.sweep(800,140,0.7,0.03,pan,1.0,{att:0.05});
    setTimeout(()=>this.modal({modes:[[64,1.0,0.4],[102,0.5,0.24]],
      noise:[220,0.6,0.1,0.7],wet:0.7},0.07,pan,0.06),260);   // a body drops
    break;
  case"chant":this.pad([98,147,196.5],1.2,0.032,pan,
      {f0:480,f1:950,att:0.35,det:0.005,vib:2.2,vibHz:2.1,wet:0.8});
    this.sweep(380,720,1.0,0.011,pan,2.2,{att:0.4,wet:0.8});break;
  case"banish":{const g1=this.ghostTone();
    this.sweep(220,2600,1.7,0.05,0,1.6,{att:1.25,wet:0.75});   // the pull
    this.pad([g1,g1*2,g1*3.01,g1*4.02],2.3,0.026,0,
      {f0:750,f1:3200,att:0.5,det:0.004,vib:2.6,wet:0.8});
    setTimeout(()=>this.pad([1174.7,1568],1.5,0.012,0,
      {f0:2400,att:0.3,det:0.003,wet:0.9}),340);               // shimmer on top
    setTimeout(()=>{this.osc(88,1.0,"sine",0.09,-52,0,300);    // the room exhales
      this.modal({modes:[[52,1.0,0.5],[84,0.5,0.3]],
        noise:[160,0.6,0.16,0.6],wet:0.8},0.08,0,0.05)},1450);
    break}
  case"backfire":this.pad([108,114.5],1.1,0.06,0,
      {type:"sawtooth",f0:1100,f1:170,att:0.03,det:0.012,vib:5,vibHz:6.3,wet:0.6});
    this.sweep(1300,140,0.9,0.05,0,0.8,{att:0.04});
    for(let i=0;i<3;i++)setTimeout(()=>this.modal(
      {modes:[[150+Math.random()*260,0.9,0.12],[500+Math.random()*280,0.4,0.06]],
       noise:[1000,0.8,0.08,0.9],wet:0.85},0.045,(Math.random()-0.5)),
      180+i*210);
    break}},
 toggle(){this.muted=!this.muted;
  if(this.master)this.master.gain.value=this.muted?0:0.32;
  return this.muted}};
function sndForLine(l){const m=l.msg;
  if(m.includes("PRELUDE"))return"prelude";
  if(m.includes("STRIKE"))return"strike";
  if(m.includes("IS DOWN")||m.includes("IS GONE"))return"down";
  if(m.includes("BANISHMENT"))return"banish";
  if(m.includes("BACKFIRE"))return"backfire";
  if(m.includes("channel banks"))return"chant";
  if(l.cls==="ev")return"ev";
  if(l.cls==="al")return"al";
  return null}
// ================= game UI (same flows as before) =================
function newContract(forceGhost){const seed=parseInt($("#selSeed").value||"7",10);
  sim=new Sim(seed,$("#selDiff").value,null,forceGhost||null);
  sel=null;sprint=false;rings=[];tweens=[];
  for(const k of Object.keys(anim))delete anim[k];
  $("#formText").textContent="CONTRACT — Medium farmhouse · "+
    $("#selDiff").value.toUpperCase()+"\n\n"+sim.contract.report.join("\n")+
    "\n\nSquad: VANCE (Ritualist) · OKAFOR (Warden) · LIS (Scout)";}
$("#btnNew").onclick=()=>newContract();
function deploy(){if(!sim)newContract();
  sim.startPlayerPhase();
  $("#briefing").classList.remove("on");$("#play").classList.add("on");
  document.body.classList.add("locked");
  SND.init();
  closeDrawer();$("#ticker").innerHTML="";
  init3D();
  camFollow([11,15]);
  renderAll();logFlush()}
$("#btnDeploy").onclick=deploy;
let lastTab="log";
function openDrawer(t){lastTab=t;
  document.querySelectorAll("#side button").forEach(x=>
    x.classList.toggle("on",x.dataset.t===t));
  document.querySelectorAll(".pane").forEach(p=>
    p.classList.toggle("on",p.id===t));
  $("#dtitle").textContent=t==="log"?"SHIFT LOG":
    (t==="journal"?"FIELD JOURNAL":
     (t==="guide"?"FIELD GUIDE":"ALPHA DOSSIER"));
  $("#drawer").classList.add("on");
  if(t==="journal")renderJournal();
  tutCheck()}
function closeDrawer(){$("#drawer").classList.remove("on");
  document.querySelectorAll("#side button").forEach(x=>x.classList.remove("on"))}
document.querySelectorAll("#side button").forEach(b=>b.onclick=()=>{
  if($("#drawer").classList.contains("on")&&lastTab===b.dataset.t)closeDrawer();
  else openDrawer(b.dataset.t)});
$("#dclose").onclick=closeDrawer;
let logShown=0;
function logFlush(){const el=$("#log"),tk=$("#ticker");
  while(logShown<sim.logLines.length){const l=sim.logLines[logShown++];
    const d=document.createElement("div");
    d.innerHTML='<span class="t">R'+String(l.r).padStart(2,"0")+"</span> ";
    const sp=document.createElement("span");sp.textContent=l.msg;
    if(l.cls)sp.className=l.cls;d.appendChild(sp);el.appendChild(d);
    const snd=sndForLine(l);if(snd)SND.play(snd,sim.gpos);
    const t=document.createElement("div");t.textContent=l.msg;
    if(l.cls)t.className=l.cls;tk.appendChild(t);
    while(tk.children.length>3)tk.removeChild(tk.firstChild);
    setTimeout(()=>{t.style.opacity="0";setTimeout(()=>t.remove(),900)},5200)}
  el.scrollTop=el.scrollHeight}
function renderJournal(){const el=$("#journal");el.innerHTML="";
  const j=sim.journal;
  if(!j.entries.length)el.innerHTML='<div style="color:var(--dim)">(no evidence logged yet — tap entries to strike/restore)</div>';
  j.entries.forEach((e,i)=>{const d=document.createElement("div");
    d.className="entry"+(e.struck?" struck":"");
    d.innerHTML='<span class="t">R'+e.turn+"</span><span>["+e.obs+"]</span>"+
      '<span style="flex:1">'+e.text+"</span>"+
      '<span class="st '+(e.state==="Confirmed"?"C":"S")+'">'+e.state+"</span>";
    d.onclick=()=>{if(!e.instrument){j.strike(i);renderJournal()}};
    el.appendChild(d)});
  const live=j.candidates();
  const grid=document.createElement("div");grid.className="cands";
  GKEYS.forEach(g=>{const c=document.createElement("div");
    c.className="cand"+(live.includes(g)?"":" dead")+(j.workingId===g?" wid":"");
    c.textContent=GHOSTS[g].name;
    if(live.includes(g)&&j.workingId!==g)c.onclick=()=>challengeSheet(g);
    grid.appendChild(c)});
  el.appendChild(grid);
  if(!live.length){const w=document.createElement("div");
    w.style.color="var(--blood)";w.style.marginTop="8px";
    w.textContent="!! Inconsistent journal — somebody logged a bad read. Strike suspect testimony.";
    el.appendChild(w)}}
function challengeSheet(g){const old=sim.journal.workingId;
  modal((old?"Challenge the ID":"File the ID"),
    (old?("Current claim: "+GHOSTS[old].name+"\n"):"")+
    "New identification: "+GHOSTS[g].name+"\n\nRite: "+GHOSTS[g].rite.name+
    "\nReagents: "+Object.entries(GHOSTS[g].rite.reag)
      .map(([r,n])=>RNAME[r]+"×"+n).join(", ")+
    "\n\nSign Form 12-A? The Enact will perform this ghost's Rite. "+
    "A wrong call completes as a Backfire.",
    [["Sign Form 12-A",()=>{const[ok,msg]=sim.actChallenge(g);toast(msg);
      closeModal();renderAll();logFlush()},"primary"],["Cancel",closeModal]])}
function modal(title,body,btns){$("#mTitle").textContent=title;
  $("#mBody").textContent=body;
  const row=$("#mRow");row.innerHTML="";
  btns.forEach(([label,fn,cls])=>{const b=document.createElement("button");
    b.textContent=label;if(cls)b.className=cls;b.onclick=fn;row.appendChild(b)});
  $("#modal").classList.add("on")}
function closeModal(){$("#modal").classList.remove("on")}
// Tiles are for walking. Everything you operate is an explicit button in the
// action bar, so nothing fires because a tap landed one tile off.
function adjacent(s){const site=sim.site,out=[];
  if(!s||!s.mobile())return out;
  const near=(p)=>cheb(s.pos,p)<=1;
  for(const[dx,dy]of[[0,0],...D8]){
    const p=[s.pos[0]+dx,s.pos[1]+dy],k=p[0]+","+p[1];
    if(site.kind[k]==="door")out.push({label:(site.doorOpen[k]?"Close":"Open")+
      " door",run:()=>sim.actDoor(s,p)});
    if((site.searchLeft[k]||[]).length)out.push({label:"Search",
      run:()=>sim.actInteract(s,"search",p)});
    if((site.floorItems[k]||[]).length)out.push({
      label:"Pick up "+RNAME[site.floorItems[k][0]],
      run:()=>sim.actPickup(s,p)});
    if(site.saltLines[k]&&site.saltLines[k].record)out.push({label:"Read salt line",
      run:()=>sim.actInteract(s,"salt_check",p)});
    if(sim.anchorFound&&!sim.anchorConfirmed&&site.room(p)===sim.anchorRoom&&
       Object.values(ANCHORS).some(sp=>sp.some(a=>a[0]===p[0]&&a[1]===p[1])))
      out.push({label:"Inspect anchor",run:()=>sim.actInteract(s,"inspect",p)});
  }
  if(near(FURNACE))out.push({label:(site.furnaceOn?"Kill":"Light")+" furnace",
    run:()=>sim.actInteract(s,"furnace",FURNACE)});
  if(near(BREAKER))out.push({label:"Breaker "+(site.breakerOn?"off":"on"),
    run:()=>sim.actInteract(s,"breaker",BREAKER)});
  if(!sim.alpha.rescued&&!sim.hosted&&sim.alpha.carriedBy==null&&
     near(sim.alpha.pos)&&!s.carrying)
    out.push({label:"Shoulder the Alpha",run:()=>sim.actLift(s),primary:true});
  for(const o of sim.squad)
    if(o.downed&&!o.dead&&near(o.pos)&&!s.carrying&&!o.carrying)
      out.push({label:"Carry "+o.name,run:()=>sim.actLift(s)});
  // de-duplicate labels (two identical doors, two searchables, ...)
  const seenL=new Set();
  return out.filter(a=>seenL.has(a.label)?false:(seenL.add(a.label),true))}
function tapTile(p){const site=sim.site;
  const unit=sim.squad.find(s=>s.mobile()&&s.pos[0]===p[0]&&s.pos[1]===p[1]);
  if(unit&&unit!==sel){sel=unit;camFollow(unit.pos);renderAll();return}
  if(!sel||!sel.mobile()){toast("select a specialist first");return}
  if(site.walkable(p)){
    const blocked=sim.squad.filter(o=>o!==sel&&o.mobile()).map(o=>o.pos);
    const plan=site.path(sel.pos,p,{blocked});
    const from=sel.pos.slice();
    const res=sim.actMove(sel,p,sprint);
    if(res[0]&&plan){anim[sel.name]={x:from[0],y:from[1]};
      startWalk(sel.name,[from,...plan],sprint?60:95)}
    if(!res[0]){const ex=explainTile(p);if(ex){toast(ex);return}}
    act(res)}
  else{const ex=explainTile(p);toast(ex||"blocked")}}
function explainTile(p){
  if(p[0]===FURNACE[0]&&p[1]===FURNACE[1])
    return"The FURNACE — stand beside it, then use LIGHT FURNACE in the action bar.";
  if(p[0]===BREAKER[0]&&p[1]===BREAKER[1])
    return"The BREAKER — stand beside it, then use BREAKER OFF/ON in the action bar.";
  if(!sim.alpha.rescued&&!sim.hosted&&sim.alpha.carriedBy==null&&
     sim.alpha.pos[0]===p[0]&&sim.alpha.pos[1]===p[1])
    return"The downed Alpha — stand next to them, then SHOULDER THE ALPHA. You are the extraction.";
  if(sim.anchorConfirmed&&p[0]===sim.contract.anchor[0]&&
     p[1]===sim.contract.anchor[1])
    return"The ANCHOR — stand beside it, PLACE the rite reagents, then CHANNEL.";
  return null}
function act([ok,msg]){toast(msg);
  if(ok){if(/moves|sprints|shoulders|carries/.test(msg)&&sel)
      SND.step(sim.site.room(sel.pos),SND.panOf(sel.pos));
    else SND.play(msg.includes("door")?"door":"tap",sel?sel.pos:null)}
  if(ok)sprint=false;
  // hand the baton on: a specialist out of AP can do nothing more this turn
  if(ok&&sel&&(!sel.mobile()||sel.ap===0)){
    const nxt=sim.squad.find(s=>s.mobile()&&s.ap>0);
    if(nxt&&nxt!==sel){sel=nxt;setTimeout(()=>{if(sel===nxt)camFollow(nxt.pos)},300)}}
  renderAll();logFlush()}
function renderActs(){const el=$("#acts");el.innerHTML="";
  const mk2=(label,fn,opts={})=>{const b=document.createElement("button");
    b.textContent=label;if(opts.cls)b.className=opts.cls;
    if(opts.cost){const c=document.createElement("span");c.className="cost";
      c.textContent=opts.cost;b.appendChild(c)}
    b.disabled=!!opts.dis;b.onclick=fn;el.appendChild(b);return b};
  try{
  if(sel&&sel.mobile()){
    const info=document.createElement("div");info.className="selinfo";
    const mv=sprint?7:(sel.carrying?3:(sel.cls==="Scout"?5:4));
    info.innerHTML="<b>"+sel.name+"</b><span class='ap'>"+
      "◆".repeat(sel.ap)+"◇".repeat(Math.max(0,2-sel.ap))+"</span>"+
      "<span style='color:var(--dim)'>move "+mv+"</span>";
    el.appendChild(info);
    for(const a of adjacent(sel))
      mk2(a.label,()=>act(a.run()),{cls:a.primary?"primary":"on",cost:"1AP"});
    const b=mk2("Sprint",()=>{sprint=!sprint;renderAll()},{cost:"2AP"});
    if(sprint)b.classList.add("on");
    if(sel.hidden)mk2("Slip out",()=>act(sim.actUnhide(sel)),{cost:"1AP"});
    else mk2("Hide",()=>act(sim.actHide(sel)),{cost:"1AP"});
    mk2("Steady",()=>act(sim.actSteady(sel)),{cost:"1AP"});
    const room=sim.site.room(sel.pos);
    if(room in sim.site.fixtureOn)mk2("Light",()=>act(sim.actInteract(sel,"light")),{cost:"1AP"});
    if(sel.items.length)mk2("Place ▾",()=>{
      modal("Place / use item","Choose what "+sel.name+" sets down:",
        sel.items.map(it=>[RNAME[it],()=>{closeModal();act(sim.actPlace(sel,it))}])
        .concat([["Cancel",closeModal]]))},{cost:"1AP"});
    if(sim.site.room(sel.pos)==="Van")mk2("Crate ▾",()=>{
      if(!sim.site.crate)sim.site.crate=CRATE.slice();
      const uniq=[...new Set(sim.site.crate)];
      modal("Van staples crate","Take one item (1 AP):",
        uniq.map(it=>[RNAME[it],()=>{closeModal();act(sim.takeFromCrate(sel,it))}])
        .concat([["Cancel",closeModal]]))},{cost:"1AP"});
    if(sel.carrying)mk2("Lower",()=>act(sim.actLower(sel)),{cost:"1AP"});
    const[ready]=sim.riteReady();
    mk2("Channel",()=>act(sim.actChannel(sel)),{dis:!ready||sel.ap<2,cls:"on",cost:"2AP"});
  }
  }catch(e){console.error("renderActs:",e)}   // End turn must always exist
  const left=sim.squad.filter(s=>s.mobile()).reduce((a,s)=>a+s.ap,0);
  const be=mk2("End turn",endTurn,{cls:"primary",
    cost:left>0?("◆"+left+" left"):null});be.id="btnEnd"}
function endTurn(){if(!sim||sim.over)return;
  sel=null;sprint=false;
  const wasHunt=!!sim.hunt,wasPrelude=sim.prelude,wasBanished=sim.banished,
    prevBanked=sim.banked;
  sim.advance();
  const mob=sim.squad.filter(s=>s.mobile());
  if(mob.length)camFollow([
    mob.reduce((a,s)=>a+s.pos[0],0)/mob.length,
    mob.reduce((a,s)=>a+s.pos[1],0)/mob.length]);
  sim.events.forEach((ev,i)=>setTimeout(()=>{
    rings.push({pos:ev.pos,t0:performance.now(),kind:ev.kind});
    if(ev.kind==="strike"){R.shake=Math.max(R.shake||0,0.5);
      popup("STRIKE","#E06050",ev.pos)}
    if(ev.kind==="backfire"){R.shake=Math.max(R.shake||0,0.7);
      popup("BACKFIRE","#E06050",ev.pos,1.4)}},i*220));
  if(sim.banished&&!wasBanished){flash();
    showBanner("BANISHED","var(--ecto)");
    popup("BANISHED","#7FD6B4",sim.contract.anchor,1.5);
    camFollow(sim.contract.anchor);
    SND.play("banish");
    setTimeout(()=>{showBanner("GET OUT","var(--blood)");
      SND.play("collapse");R.shake=1.1},1500)}
  else if(sim.collapse&&sim.collapse.t>0){
    R.shake=Math.max(R.shake||0,0.55);SND.play("collapse");
    if(sim.outcome==="collapsed")showBanner("THE ROOF GOES","var(--blood)")}
  else if(sim.hunt&&!wasHunt){showBanner("HUNT","var(--blood)");
    R.shake=Math.max(R.shake||0,0.35)}
  else if(sim.prelude&&!wasPrelude)showBanner("PRELUDE","var(--hazard)");
  if(sim.banked>prevBanked&&!sim.banished)
    popup("CHANT "+sim.banked,"#DFA457",sim.contract.anchor);
  if(sim.over&&sim.outcome==="failed")showBanner("SQUAD DOWN","var(--blood)");
  // new turn: put the first specialist who can act in the player's hand
  if(!sim.over){const nxt=sim.squad.find(s=>s.mobile()&&s.ap>0);if(nxt)sel=nxt}
  renderAll();logFlush();
  if(sim.over)setTimeout(showDebrief,600)}
function renderChips(){const el=$("#chips");el.innerHTML="";
  for(const s of sim.squad){const d=document.createElement("div");
    d.className="chip"+(sel===s?" sel":"")+((s.downed||s.dead)?" downed":"");
    const tags=[];
    if(s.dead)tags.push('<span class="warn">DEAD</span>');
    else if(s.downed)tags.push('<span class="warn">DOWN</span>');
    if(s.hidden)tags.push("hidden");if(s.rattled&&s.mobile())tags.push('<span class="warn">RATTLED</span>');
    if(s.carrying)tags.push("carrying "+(s.carrying==="alpha"?"the Alpha":s.carrying));
    const inv=s.items.map(i=>RNAME[i]).join(", ");
    d.innerHTML='<div class="nm"><span>'+s.name+'</span><span class="cls">'+s.cls+"</span></div>"+
      '<span class="ap">'+"◆".repeat(s.ap)+"◇".repeat(Math.max(0,2-s.ap))+"</span>"+
      '<div class="bars"><div class="bar hp"><i style="width:'+(100*Math.max(0,s.hp)/s.maxHp)+'%"></i></div>'+
      '<div class="bar cp"><i style="width:'+s.composure+'%"></i></div></div>'+
      '<div class="tags">'+(tags.join(" · ")||(inv||"—"))+"</div>";
    d.onclick=()=>{sel=(sel===s?null:s);if(sel)camFollow(sel.pos);renderAll()};
    el.appendChild(d)}}
// one line that always answers "what am I supposed to be doing?"
function objectiveText(){
  if(!sim)return["",""];
  if(sim.over)return["Contract closed — read the debrief",""];
  if(sim.collapse){const left=Math.max(0,sim.collapse.limit-sim.collapse.t);
    return["GET OUT — "+(sim.alpha.rescued?"":"shoulder the Alpha, ")+
      "everyone to the van · "+left+" round"+(left===1?"":"s"),"warn"]}
  if(sim.hunt)return["HUNT — hide, break line of sight, or finish the rite","warn"];
  if(sim.prelude)return["PRELUDE — a Hunt follows next round","warn"];
  if(!sim.anchorFound)return["Sweep the house — a hum marks the Anchor's room",""];
  if(!sim.anchorConfirmed)return["Anchor room found — INSPECT the ? markers",""];
  if(!sim.journal.workingId)return["Identify the entity — confirm Tells, file the ID (JNL)",""];
  const[ready,why]=sim.riteReady();
  if(!ready)return["Stage the "+sim.rite().name+" — "+why,""];
  if(sim.banked>0)return["Hold the chant — banked "+sim.banked+"/"+sim.rite().len,""];
  return["Rite staged — stand beside A and CHANNEL",""]}
function renderRail(){$("#round").textContent=sim.round;
  {const[txt,cls]=objectiveText();const ol=$("#objline");
   if(ol){ol.textContent=txt;ol.className=cls}}
  if(sim.collapse){const c=sim.collapse,left=Math.max(0,c.limit-c.t);
    $("#gfill").style.width=(100*left/c.limit)+"%";
    $("#gfill").style.background="linear-gradient(90deg,#C8564C,#E0A050)";
    $("#gval").textContent="COLLAPSE — "+left+" ROUND"+(left===1?"":"S")+" TO GET OUT";
    $("#widlbl").textContent="BANISHED";
    $("#ritelbl").textContent=sim.alpha.rescued?"Alpha aboard":"Alpha still inside";
    $("#vignette").className="hunt";
    return}
  $("#gfill").style.width=sim.dread+"%";
  let pct="";
  if(!sim.hunt&&!sim.prelude){const g=sim.contract.trueGhost;
    const thr=g==="demon"?40:sim.gdef.thr,sub=g==="demon"?30:50;
    if(sim.dread>=thr)pct=" · hunt "+Math.max(0,sim.dread-sub)+"%"}
  $("#gval").textContent="DREAD "+sim.dread+
    (sim.floor?" (floor "+sim.floor+")":"")+pct+
    (sim.prelude?" · PRELUDE":"")+(sim.hunt?" · HUNT":"");
  const w=sim.journal.workingId;
  $("#widlbl").textContent=w?GHOSTS[w].name:"— file the ID";
  const rite=sim.rite();
  $("#ritelbl").textContent=rite?rite.name+" · banked "+sim.banked+
    (sim.anchorConfirmed?"":" · anchor?"):"";
  const v=$("#vignette");
  v.className=sim.hunt?"hunt":(sim.prelude?"prelude":"");
  if(sim.banished)v.className=""}
function renderReport(){$("#report").textContent=sim.contract.report.join("\n")}
// one failing section must not blank the rest of the interface — each part
// renders independently, and the first failure of a kind is surfaced
function renderAll(){
  const part=(name,fn)=>{try{fn()}catch(e){
    console.error(name+":",e);
    if(!renderAll._warned){renderAll._warned=true;
      toast("interface error in "+name+" — "+(e&&e.message||e))}}};
  part("rail",renderRail);part("chips",renderChips);part("acts",renderActs);
  part("report",renderReport);
  part("journal",()=>{if($("#journal").classList.contains("on"))renderJournal()});
  part("anim",syncAnim);part("tutorial",tutCheck);part("layout",layoutHUD);
  part("scene",sceneSync)}
function showDebrief(){const[total,lines]=sim.debrief();
  let body="OUTCOME: "+String(sim.outcome).toUpperCase()+"\n\n"+lines.join("\n")+
    "\n\nPAYOUT: "+total;
  const falses=sim.journal.falseEntries();
  if(falses.length)body+="\n\nFalse entries were:\n"+
    falses.map(e=>"  R"+e.turn+" ["+e.obs+"] "+e.text).join("\n");
  modal("H&V Debrief — Form 9-D",body,[["New contract",()=>{closeModal();
    $("#play").classList.remove("on");$("#briefing").classList.add("on");
    document.body.classList.remove("locked");
    $("#log").innerHTML="";logShown=0;newContract()},"primary"]])}
// tutorial ------------------------------------------------------------
const TUTS=[
 {text:"Welcome to the Bravo Shift, Supervisor. Alpha identified the entity and "+
   "drove away; your crew goes back in. One contract: confirm the entity from its "+
   "behavior, perform its Banishment Rite, and walk everyone out — with the Alpha "+
   "member they left behind.",next:true},
 {text:"Start with the paperwork. Open the DOSSIER tab and read Form 11-R — on a "+
   "training file Farrow's margin notes explain what each logged behavior rules out.",
   sel:'[data-t="report"]',done:()=>lastTab==="report"},
 {text:"Tap LIS's card (or her token on the board). She's your Scout — fastest "+
   "mover, and she passively reads any ghost event within 8 tiles.",sel:"#chips",
   done:()=>sel&&sel.name==="Lis"},
 {text:"Amber tiles are in reach (Move = 1 AP, up to 5 for a Scout). Tap one to "+
   "walk there — tap an adjacent door to swing it open for free.",
   done:()=>sim.squad.some(s=>sim.site.room(s.pos)!=="Van")},
 {text:"Sweep toward the CELLAR, down the hall on the left. The Anchor — the "+
   "object tethering the ghost — announces its room with a hum when you enter.",
   tile:[5,6],done:()=>sim.anchorFound},
 {text:"The hum says the Anchor is in this room. Stand next to the ? markers and "+
   "tap them to Inspect (1 AP) until you confirm the tether.",
   done:()=>sim.anchorConfirmed},
 {text:"Open the JOURNAL. Every observed behavior lands here as a Tell; two "+
   "sightings Confirm it, and the candidate grid dims every ghost the evidence "+
   "rules out. (Panicking specialists can log FALSE Tells — tap an entry to "+
   "strike testimony you don't trust.)",sel:'[data-t="journal"]',
   done:()=>lastTab==="journal"},
 {text:"END THE TURN. The ghost acts in its own phase — you only see what your "+
   "people see or hear (rings). The Dread gauge climbs every round; from 60 it "+
   "shows live Hunt odds. Dread is your clock. (The ? button on the right "+
   "opens the field guide — every map symbol is explained there.)",
   sel:"#btnEnd",done:()=>sim.round>=2},
 {text:"The Hantu's Warming Rite needs heat: reach the furnace F in the mudroom "+
   "and tap it to light it. Watch the rooms warm — and brighten — over the next "+
   "rounds.",tile:[15,3],done:()=>sim.site.furnaceOn},
 {text:"Now stage the Rite: carry Brazier Coals ×2 and Lamp Oil to the Anchor A "+
   "and use PLACE while standing next to it. (Check the squad cards to see who "+
   "carries what.)",done:()=>sim.riteReady()[0]},
 {text:"Everything is staged. Put VANCE (Ritualist — he enacts faster) within one "+
   "tile of A and CHANNEL: it takes his whole turn, and the progress banks next "+
   "round if the chant holds through the ghost's phase.",
   done:()=>sim.banked>=1},
 {text:"Hold the chant. If the gauge flashes PRELUDE, a Hunt follows one round "+
   "later — hide, break line of sight… or finish the rite: a completed banishment "+
   "ends any Hunt instantly. Fair scary: every death traces to a decision.",
   next:true},
 {text:"After the banishment: walk next to the fallen Alpha (the red body), "+
   "tap them to shoulder them, carry them to the van, and walk the whole "+
   "squad out. You are the extraction — H&V pays on delivery.",
   done:()=>sim.over},
 {text:"Training complete. Take a Standard contract next — and when you're ready, "+
   "Veteran: there the report can be wrong, and the real game begins. Trust the "+
   "site, not the paper.",next:true},
];
function tutStart(){$("#selDiff").value="trainee";$("#selSeed").value=3;
  newContract("hantu");deploy();
  document.body.classList.add("tut");
  tut={i:0};tutShow()}
function tutShow(){const t=TUTS[tut.i];if(!t){tutEnd();return}
  $("#tutcard").classList.add("on");
  $("#tutStep").textContent="Training "+(tut.i+1)+" / "+TUTS.length;
  $("#tutText").textContent=t.text;
  document.querySelectorAll(".tut-glow").forEach(e=>e.classList.remove("tut-glow"));
  tutMarker=t.tile||null;
  if(t.tile)camFollow(t.tile);
  if(t.sel){const el=document.querySelector(t.sel);if(el)el.classList.add("tut-glow")}
  const row=$("#tutRow");row.innerHTML="";
  if(t.next||!t.done){const b=document.createElement("button");
    b.className="primary";b.textContent=tut.i===TUTS.length-1?"Finish":"Got it";
    b.onclick=()=>{tut.i++;tutShow()};row.appendChild(b)}
  layoutHUD();requestAnimationFrame(layoutHUD);
  sceneSync()}
function tutCheck(){if(!tut||!sim)return;
  const t=TUTS[tut.i];if(!t)return;
  if(sim.over&&tut.i<TUTS.length-1){tut.i=TUTS.length-1;tutShow();return}
  if(t.done&&t.done()){tut.i++;tutShow()}}
function tutEnd(){tut=null;tutMarker=null;
  document.body.classList.remove("tut");
  $("#tutcard").classList.remove("on");layoutHUD();
  document.querySelectorAll(".tut-glow").forEach(e=>e.classList.remove("tut-glow"));
  if(R&&sim)sceneSync()}
$("#btnMute").onclick=()=>{SND.init();
  $("#btnMute").textContent=SND.toggle()?"SND OFF":"SND ON"};
$("#tutSkip").onclick=tutEnd;
$("#btnTut").onclick=tutStart;
addEventListener("resize",()=>{layoutHUD();
  if(R&&sim&&$("#play").classList.contains("on"))resize3D()});
// any uncaught error becomes a visible line instead of a silent black screen
addEventListener("error",e=>{if(!window._errShown){window._errShown=true;
  try{toast("error: "+(e.message||e.type))}catch(_){}}});
addEventListener("unhandledrejection",e=>{if(!window._errShown){
  window._errShown=true;
  try{toast("error: "+(e.reason&&e.reason.message||e.reason))}catch(_){}}});
window._dbg={get sim(){return sim},get R(){return R},get snd(){return SND},tap:tapTile,end:endTurn,sel:(n)=>{sel=sim.spec(n);renderAll()}};
newContract();
})()}
