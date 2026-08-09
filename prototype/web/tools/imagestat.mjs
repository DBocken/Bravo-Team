import fs from 'fs';import zlib from 'zlib';
export function readPNG(path){
  const b=fs.readFileSync(path);let o=8,w=0,h=0,bd=0,ct=0;const idat=[];
  while(o<b.length){const len=b.readUInt32BE(o);const type=b.toString('ascii',o+4,o+8);
    const data=b.subarray(o+8,o+8+len);
    if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);bd=data[8];ct=data[9]}
    else if(type==='IDAT')idat.push(data);
    else if(type==='IEND')break;
    o+=12+len}
  if(bd!==8)throw new Error('bit depth '+bd);
  const ch=({0:1,2:3,4:2,6:4})[ct];if(!ch)throw new Error('colour type '+ct);
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const stride=w*ch,out=Buffer.alloc(h*stride);
  let p=0;
  for(let y=0;y<h;y++){
    const f=raw[p++];const line=raw.subarray(p,p+stride);p+=stride;
    const cur=out.subarray(y*stride,(y+1)*stride);
    const prev=y?out.subarray((y-1)*stride,y*stride):null;
    for(let x=0;x<stride;x++){
      const a=x>=ch?cur[x-ch]:0,bb=prev?prev[x]:0,c=(prev&&x>=ch)?prev[x-ch]:0;
      let v=line[x];
      if(f===1)v+=a;else if(f===2)v+=bb;else if(f===3)v+=(a+bb)>>1;
      else if(f===4){const pa=Math.abs(bb-c),pb=Math.abs(a-c),pc=Math.abs(a+bb-2*c);
        v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c)}
      cur[x]=v&255}}
  return {w,h,ch,data:out}}
export function stats(path,box){
  const {w,h,ch,data}=readPNG(path);
  const x0=box?box[0]:0,y0=box?box[1]:0,x1=box?box[2]:w,y1=box?box[3]:h;
  const bw=x1-x0,bh=y1-y0;
  const L=new Float64Array(bw*bh);let sum=0;
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const i=((y0+y)*w+(x0+x))*ch;
    const l=(data[i]*0.2126+data[i+1]*0.7152+data[i+2]*0.0722)/255;
    L[y*bw+x]=l;sum+=l}
  const mean=sum/(bw*bh);let varsum=0,grad=0;
  for(let y=1;y<bh-1;y++)for(let x=1;x<bw-1;x++){
    const i=y*bw+x;varsum+=(L[i]-mean)**2;
    const gx=L[i+1]-L[i-1],gy=L[i+bw]-L[i-bw];
    grad+=Math.sqrt(gx*gx+gy*gy)}
  const s=Array.from(L).sort((a,b)=>a-b),q=(t)=>s[Math.floor(t*(s.length-1))];
  return {mean:+mean.toFixed(4),rms:+Math.sqrt(varsum/(bw*bh)).toFixed(4),
    sharp:+(grad/((bw-2)*(bh-2))).toFixed(5),
    p05:+q(0.05).toFixed(3),p50:+q(0.5).toFixed(3),p95:+q(0.95).toFixed(3)}}
if(process.argv[2])console.log(JSON.stringify(stats(process.argv[2],
  process.argv[3]?process.argv[3].split(',').map(Number):null)));
