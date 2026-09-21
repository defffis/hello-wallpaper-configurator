'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'hello-wallpaper:v1';
  const defaults = Object.freeze({width:1290,height:2796,bg1:'#7d74f6',bg2:'#9b96ff',gradient:55,vignette:12,dotColor:'#ffffff',dotOpacity:65,dotSize:2.2,spacing:18,offsetRows:false,text:'hello',textColor:'#ffffff',textSize:48,textY:72,textX:50,stroke:100,angle:0,textOpacity:100,showText:true,format:'png',quality:95,material:'solid',glassDepth:65,animation:'write',duration:2,videoSize:720,videoFormat:'auto'});
  const limits = {width:[320,6000],height:[320,6000],gradient:[0,100],vignette:[0,50],dotOpacity:[0,100],dotSize:[.5,8],spacing:[6,40],textSize:[15,90],textY:[10,92],textX:[5,95],stroke:[60,160],angle:[-25,25],textOpacity:[0,100],quality:[10,100],glassDepth:[10,100],duration:[1,4],videoSize:[480,1080]};
  const palettes = [ ['Purple','#7d74f6','#9b96ff'],['Blue','#91a8d6','#b7c9e8'],['Pink','#e49ab6','#f1bdd0'],['Mint','#8dccbb','#b6e0d3'],['Peach','#e6b09d','#f4d2bd'],['Lavender','#a99cd6','#c7bce8'],['Sky','#8bbce5','#b7d6f0'],['Cream','#e0cfab','#f0e3c9'] ];
  // Hand-prepared continuous Bézier outline, matched to the supplied reference.
  // Coordinates are independent of installed fonts. The source is also in assets/hello.svg.
  const HELLO = 'M 18 199 C 68 179 127 150 153 105 C 180 60 190 12 164 11 C 136 10 120 53 113 93 C 106 131 101 174 92 211 C 108 156 143 112 173 118 C 208 125 171 182 188 202 C 207 225 272 209 307 181 C 340 155 350 117 319 113 C 290 109 266 136 271 173 C 278 218 337 224 380 205 C 424 186 471 107 479 57 C 488 13 465 -4 443 20 C 417 47 400 117 403 169 C 405 203 414 216 441 216 C 485 216 534 164 561 104 C 582 57 594 13 572 11 C 544 6 523 57 515 95 C 507 132 506 170 516 195 C 530 235 581 217 616 179 C 631 163 635 145 653 131 C 674 114 705 118 719 139 C 736 165 721 205 696 215 C 671 225 646 211 643 186 C 640 163 650 136 671 127 C 697 115 716 137 745 129 C 761 125 774 120 782 113';
  const helloPath = new Path2D(HELLO);
  const background=document.createElement('canvas');
  const canvas = $('canvas'), ctx = canvas.getContext('2d', {alpha:false});
  let state = {...defaults}, revision = 0, raf = 0, blobTimer, prepared = null, dialogURL = null, dialogFile = null;
  let tileKey = '', pattern = null, desktopURL = null;
  const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
  function sanitize(raw) {
    const result = {...defaults};
    for (const key of Object.keys(defaults)) {
      const value = raw?.[key];
      if (limits[key]) { const n = Number(value); if (value !== '' && value != null && Number.isFinite(n)) result[key] = clamp(['dotSize','duration'].includes(key)?Math.round(n*10)/10:Math.round(n),...limits[key]); }
      else if (typeof defaults[key] === 'boolean') { if (typeof value === 'boolean') result[key] = value; }
      else if (key === 'text') { if(typeof value==='string') result[key] = value.slice(0,80); }
      else if (['material','animation','videoFormat'].includes(key)) { const options={material:['solid','glass'],animation:['write','fade'],videoFormat:['auto','webm']};if(options[key].includes(value))result[key]=value; }
      else if (key === 'format') { if(value==='png'||value==='jpeg') result[key] = value; }
      else if (typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value)) result[key] = value.toLowerCase();
    }
    return result;
  }
  try { state = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { /* Disabled/corrupt storage must not block editing. */ }
  function persist() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); } catch { $('status').textContent='Браузер не разрешил сохранить настройки. Редактор и экспорт доступны.'; } }
  function updateUI(full=false) {
    if(full) for(const key of Object.keys(defaults)){ if(typeof defaults[key]==='boolean') $(key).checked=state[key]; else $(key).value=state[key]; }
    const preset = `${state.width}x${state.height}`;
    $('preset').value = [...$('preset').options].some(o=>o.value===preset)?preset:'custom';
    document.querySelectorAll('output[for]').forEach(out=>{const key=String(out.htmlFor);out.textContent=String(state[key]).toUpperCase() + (key==='duration'?' с':key==='angle'?'°':['dotSize','spacing'].includes(key)?' px':limits[key]?'%':'');});
    $('resolution').textContent=`${state.width} × ${state.height} px`;
    $('quickGlass').setAttribute('aria-pressed',String(state.material==='glass'));
    $('quickGlass').textContent=state.material==='glass'?'◆ Liquid Glass включён':'◇ Попробовать Liquid Glass';
    $('glassSettings').hidden=state.material!=='glass';
    $('motionHint').textContent=state.text.trim()!=='hello'?'Для своего текста используется плавное появление.':state.animation==='write'?'Надпись пишется одним движением и остаётся на экране.':'Надпись плавно проявляется и остаётся на экране.';
    $('wallpaperShell').style.setProperty('--wallpaper-aspect',state.width/state.height);
    $('wallpaperShell').style.setProperty('--preview-width',state.width>state.height?'100%':'78%');
    $('wallpaperShell').style.setProperty('--preview-max',state.width>state.height?'720px':'420px');
    $('quality').disabled=state.format!=='jpeg';
    $('stroke').disabled=state.text.trim()!=='hello';
    $('textHint').textContent=state.text.trim()==='hello'?'Apple / iPhone Hello · векторная надпись':'Фирменный стиль Apple Hello доступен только для слова «hello». Другой текст использует рукописный шрифт устройства.';
    $('export').textContent=`Экспортировать ${state.format==='png'?'PNG':'JPEG'}`;
    $('quickExport').textContent=`Сохранить ${state.format==='png'?'PNG':'JPEG'}`;
    document.querySelectorAll('[data-palette]').forEach((btn,i)=>btn.setAttribute('aria-pressed',String(state.bg1===palettes[i][1]&&state.bg2===palettes[i][2])));
    updateVideoInfo();
    $('timeline').value=100;$('playState').textContent='Финальный кадр';
    $('previewCanvas').setAttribute('aria-label',`Предпросмотр обоев ${state.width} на ${state.height} пикселей${state.showText&&state.text?`, надпись «${state.text}»`:''}`);
  }
  function rgb(hex) {return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
  function render() {
    raf=0;
    try {
      const s=state,w=s.width,h=s.height;
      if(canvas.width!==w)canvas.width=w;
      if(canvas.height!==h)canvas.height=h;
      const a=rgb(s.bg1),b=rgb(s.bg2),blend=a.map((v,i)=>Math.round(v+(b[i]-v)*s.gradient/100));
      const grad=ctx.createLinearGradient(w*.15,0,w*.8,h);
      grad.addColorStop(0,`rgb(${blend})`);grad.addColorStop(.35,`rgb(${blend})`);grad.addColorStop(1,s.bg1);
      ctx.globalAlpha=1;ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
      if(s.vignette){const g=ctx.createRadialGradient(w*.48,h*.42,Math.min(w,h)*.12,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'#0000');g.addColorStop(1,`rgba(20,12,45,${s.vignette/100})`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
      // A small repeating tile replaces up to a million individual canvas arcs.
      const key=[s.spacing,s.dotSize,s.dotColor,s.offsetRows].join(':');
      if(key!==tileKey||!pattern){
        const tile=document.createElement('canvas'),scale=4,step=s.spacing;
        tile.width=step*scale;tile.height=step*scale*(s.offsetRows?2:1);
        const t=tile.getContext('2d');t.scale(scale,scale);t.fillStyle=s.dotColor;
        // Neighbour copies keep circles seamless even when their radius exceeds half the spacing.
        const rows=s.offsetRows?2:1;
        for(let row=-2;row<rows+2;row++)for(let col=-2;col<3;col++){
          t.beginPath();t.arc(step*(col+.5)+(s.offsetRows&&Math.abs(row%2)?step/2:0),step*(row+.5),s.dotSize,0,Math.PI*2);t.fill();
        }
        pattern=ctx.createPattern(tile,'repeat');pattern.setTransform(new DOMMatrix().scale(1/scale));tileKey=key;
      }
      ctx.globalAlpha=s.dotOpacity/100;ctx.fillStyle=pattern;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
      background.width=w;background.height=h;background.getContext('2d').drawImage(canvas,0,0);
      drawText(ctx,s,1,background);
      renderPreview();
      scheduleBlob();
    }catch(error){$('status').textContent='Не удалось отрисовать изображение. Уменьшите разрешение и попробуйте снова.';console.error(error);}
  }
  // Downsample progressively to prevent moiré in the tiny on-screen dot grid.
  // The original canvas remains untouched at the full export resolution.
  function renderPreview() {
    const preview=$('previewCanvas'),cssWidth=preview.getBoundingClientRect().width;
    if(!cssWidth)return;
    const width=Math.max(1,Math.round(cssWidth*Math.min(window.devicePixelRatio||1,3)));
    const height=Math.max(1,Math.round(width*canvas.height/canvas.width));
    let source=canvas;
    while(source.width>width*2){
      const step=document.createElement('canvas');step.width=Math.max(width,Math.floor(source.width/2));step.height=Math.max(height,Math.round(step.width*canvas.height/canvas.width));
      const sc=step.getContext('2d');sc.imageSmoothingEnabled=true;sc.imageSmoothingQuality='high';sc.drawImage(source,0,0,step.width,step.height);
      if(source!==canvas){source.width=1;source.height=1;}
      source=step;
    }
    preview.width=width;preview.height=height;
    const pc=preview.getContext('2d');pc.imageSmoothingEnabled=true;pc.imageSmoothingQuality='high';pc.drawImage(source,0,0,width,height);
    if(source!==canvas){source.width=1;source.height=1;}
    renderZoom();
  }
  function renderZoom(){
    const dialog=$('previewDialog'),zoom=$('zoomCanvas');
    if(!dialog?.open||!zoom||!canvas.width||!canvas.height)return;
    const aspect=canvas.width/canvas.height,maxW=Math.min((window.innerWidth||1220)*.9,1100),maxH=Math.min((window.innerHeight||1040)*.74,820);
    let cssW=Math.min(maxW,maxH*aspect),cssH=cssW/aspect;
    if(cssH>maxH){cssH=maxH;cssW=cssH*aspect;}
    const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(cssW*dpr)),h=Math.max(1,Math.round(cssH*dpr));
    if(zoom.width!==w)zoom.width=w;if(zoom.height!==h)zoom.height=h;
    zoom.style.width=`${Math.round(cssW)}px`;zoom.style.height=`${Math.round(cssH)}px`;
    const z=zoom.getContext('2d');z.imageSmoothingEnabled=true;z.imageSmoothingQuality='high';z.clearRect(0,0,w,h);z.drawImage(canvas,0,0,w,h);
  }
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>renderPreview()).observe($('previewCanvas').parentElement);
  function changed(save=true) { stopPreview(); revision++;prepared=null;clearTimeout(blobTimer);updateUI();if(!raf)raf=requestAnimationFrame(render);if(save)persist(); }
  function mime(){return state.format==='jpeg'?'image/jpeg':'image/png';}
  function filename(){return `hello-wallpaper-${state.width}x${state.height}.${state.format==='jpeg'?'jpg':'png'}`;}
  function makeBlob(){const type=mime(),quality=state.quality/100;return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Браузер не смог создать файл. Попробуйте меньшее разрешение.')),type,quality));}
  const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  // Prepare on mobile in advance, so navigator.share executes directly in the click's activation.
  function scheduleBlob(){clearTimeout(blobTimer);if(!isMobile())return;const v=revision;blobTimer=setTimeout(async()=>{try{const blob=await makeBlob();if(v===revision)prepared={revision:v,file:new File([blob],filename(),{type:blob.type})};}catch{}},450);}
  function canShare(file){try{return !!(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}));}catch{return false;}}
  function releaseDialog(){if(dialogURL)URL.revokeObjectURL(dialogURL);dialogURL=null;dialogFile=null;$('savedImage').removeAttribute('src');$('savedVideo').pause();$('savedVideo').removeAttribute('src');$('savedVideo').load();}
  function openSave(file){releaseDialog();dialogFile=file;dialogURL=URL.createObjectURL(file);const video=file.type.startsWith('video/');$('savedImage').hidden=video;$('savedVideo').hidden=!video;$(video?'savedVideo':'savedImage').src=dialogURL;$('saveHint').textContent=video?'Сохраните видео или передайте его в приложение для создания Live Photo.':'Сохраните изображение через системное меню или ссылку ниже.';$('openImage').textContent=video?'Открыть видео':'Открыть изображение';$('openImage').href=dialogURL;$('downloadImage').href=dialogURL;$('downloadImage').download=file.name;$('share').hidden=!canShare(file);if(!$('saveDialog').open)$('saveDialog').showModal();}
  async function share(file){try{await navigator.share({files:[file],title:'Hello wallpaper'});$('status').textContent='Файл передан в системное меню.';}catch(e){if(e.name!=='AbortError'){openSave(file);$('status').textContent='Выберите другой способ сохранения в открытом окне.';}}}
  function download(file){if(desktopURL)URL.revokeObjectURL(desktopURL);desktopURL=URL.createObjectURL(file);const a=document.createElement('a');a.href=desktopURL;a.download=file.name;a.textContent=`Скачать ${file.name}`;$('status').textContent='Файл готов. Если загрузка не началась: ';$('status').append(a);a.click();}
  async function exportWallpaper(){
    if($('export').disabled)return;
    stopPreview();
    // Capture current file synchronously; never await before a prepared Web Share call.
    if(isMobile()&&prepared?.revision===revision){const file=prepared.file;if(canShare(file))await share(file);else openSave(file);return;}
    const btn=$('export');btn.disabled=true;$('quickExport').disabled=true;$('status').textContent='Готовим изображение…';
    const version=revision,name=filename();
    try{if(raf)cancelAnimationFrame(raf);render();const blob=await makeBlob();const file=new File([blob],name,{type:blob.type});if(isMobile()){if(version===revision)prepared={revision:version,file};openSave(file);$('status').textContent='Изображение готово к сохранению.';}else download(file);}catch(e){$('status').textContent=e.message;}finally{btn.disabled=false;$('quickExport').disabled=false;}
  }
  $('export').addEventListener('click',exportWallpaper);
  $('quickExport').addEventListener('click',exportWallpaper);
  $('share').addEventListener('click',()=>{if(dialogFile)share(dialogFile);});
  $('closeDialog').addEventListener('click',()=>$('saveDialog').close());
  $('saveDialog').addEventListener('close',releaseDialog);
  for(const key of Object.keys(defaults)){
    $(key).addEventListener('input',()=>{
      const el=$(key);if(limits[key]&&(el.value===''||!Number.isFinite(Number(el.value))))return;
      state=sanitize({...state,[key]:typeof defaults[key]==='boolean'?el.checked:el.value});
      changed();
    });
    if(limits[key])$(key).addEventListener('change',()=>{$(key).value=state[key];});
  }
  $('preset').addEventListener('change',()=>{if($('preset').value==='custom')return;const[w,h]=$('preset').value.split('x').map(Number);state.width=w;state.height=h;updateUI(true);changed();});
  function hslToHex(h,s,l){s/=100;l/=100;const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};return '#'+f(0)+f(8)+f(4);}
  $('random').addEventListener('click',()=>{const h=Math.random()*360;state.bg1=hslToHex(h,38+Math.random()*16,68+Math.random()*10);state.bg2=hslToHex((h+8+Math.random()*18)%360,34+Math.random()*16,76+Math.random()*9);updateUI(true);changed();});
  palettes.forEach(([name,a,b],i)=>{const btn=document.createElement('button');btn.type='button';btn.className='swatch';btn.title=name;btn.setAttribute('aria-label',`Палитра ${name}`);btn.dataset.palette=i;btn.style.setProperty('--swatch',`linear-gradient(135deg,${a},${b})`);btn.addEventListener('click',()=>{state.bg1=a;state.bg2=b;updateUI(true);changed();});$('palettes').append(btn);});
  $('reset').addEventListener('click',()=>{state={...defaults};try{localStorage.removeItem(STORAGE_KEY);}catch{}updateUI(true);changed(false);$('status').textContent='Настройки сброшены.';});
  // Sample the continuous cubic path by arc length: one pen stroke, never a loop.
  const penPoints=[];
  {const nums=HELLO.match(/-?\d+(?:\.\d+)?/g).map(Number);let x=nums[0],y=nums[1],distance=0;penPoints.push([x,y,0]);
    for(let i=2;i<nums.length;i+=6){const [a,b,c,d,e,f]=nums.slice(i,i+6),ox=x,oy=y;
      for(let j=1;j<=32;j++){const t=j/32,u=1-t,nx=u*u*u*ox+3*u*u*t*a+3*u*t*t*c+t*t*t*e,ny=u*u*u*oy+3*u*u*t*b+3*u*t*t*d+t*t*t*f;distance+=Math.hypot(nx-x,ny-y);penPoints.push([nx,ny,distance]);x=nx;y=ny;}
    }
  }
  function partialHello(progress){if(progress>=1)return helloPath;const path=new Path2D(),end=penPoints.at(-1)[2]*progress;path.moveTo(...penPoints[0].slice(0,2));
    for(let i=1;i<penPoints.length;i++){const p=penPoints[i],prev=penPoints[i-1];if(p[2]>end){const k=(end-prev[2])/(p[2]-prev[2]);path.lineTo(prev[0]+(p[0]-prev[0])*k,prev[1]+(p[1]-prev[1])*k);break;}path.lineTo(p[0],p[1]);}return path;
  }
  function surface(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;}
  function drawText(target,s,progress=1,backdrop){
    if(!s.showText||!s.text.trim()||progress<=0||s.textOpacity<=0)return;
    const writing=s.text.trim()==='hello'&&s.animation==='write',alpha=s.textOpacity/100*(writing?1:progress),path=partialHello(writing?progress:1);
    const hello=s.text.trim()==='hello',factor=s.width*s.textSize/100/806,angle=s.angle*Math.PI/180;
    function shape(c,color,lineScale=1){c.fillStyle=color;c.strokeStyle=color;c.lineCap='round';c.lineJoin='round';
      if(hello){c.scale(factor,factor);c.translate(-400,-116);c.lineWidth=(s.material==='glass'?36:15)*s.stroke/100*lineScale;c.stroke(path);}
      else{c.font='160px "Snell Roundhand", "Segoe Script", cursive';c.textAlign='center';c.textBaseline='middle';const scale=Math.min(s.width*s.textSize/100/Math.max(1,c.measureText(s.text).width),s.height*.25/160);c.scale(scale,scale);c.fillText(s.text,0,0);}
    }
    target.save();target.globalAlpha=alpha;target.translate(s.width*s.textX/100,s.height*s.textY/100);target.rotate(angle);
    if(s.material!=='glass'){shape(target,s.textColor);target.restore();return;}
    // Render only the text bounds, keeping high-resolution exports within reasonable memory.
    const pad=Math.max(12,factor*32),lw=Math.ceil(s.width*s.textSize/100+pad*2),lh=Math.ceil((hello?factor*245:s.height*.38)+pad*2);
    const mask=surface(lw,lh),m=mask.getContext('2d');m.translate(lw/2,lh/2);shape(m,'#fff');
    const glass=surface(lw,lh),g=glass.getContext('2d'),depth=s.glassDepth/100;
    // Liquid Glass is built as an optical stack: magnified content, softened content,
    // directional caustics, colour dispersion, and a narrow moving-light reflection.
    // The background is sampled instead of replaced by an opaque translucent fill.
    function sampleBackdrop(c,scale,dx,dy,opacity=1){c.save();c.globalAlpha=opacity;c.translate(lw/2+dx,lh/2+dy);c.scale(scale,scale);c.rotate(-angle);c.translate(-s.width*s.textX/100,-s.height*s.textY/100);c.drawImage(backdrop,0,0);c.restore();}
    const opticalScale=1.018+depth*.052,shift=Math.max(.45,factor*(.8+depth*2.7));
    sampleBackdrop(g,opticalScale,-shift*.32,-shift*.22);
    // A few faint offset samples approximate the soft scattering of thick glass
    // without blurring the wallpaper outside the letterform.
    for(const [dx,dy] of [[shift,0],[-shift,0],[0,shift],[0,-shift]])sampleBackdrop(g,opticalScale,dx*.38,dy*.38,.055+depth*.025);
    g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);
    // Keep the chosen tint uniform across the whole word. Dark colours need more
    // optical density or the backdrop would overpower them and turn letters blue.
    const tintRgb=rgb(s.textColor),tintLum=(tintRgb[0]*.2126+tintRgb[1]*.7152+tintRgb[2]*.0722)/255;
    g.globalCompositeOperation='source-atop';g.globalAlpha=.075+depth*.105+(1-tintLum)*(.28+depth*.18);g.fillStyle=s.textColor;g.fillRect(0,0,lw,lh);g.globalAlpha=1;g.globalCompositeOperation='source-over';

    const edge=surface(lw,lh),e=edge.getContext('2d'),bevel=Math.max(.85,factor*(1.8+depth*3.4));
    function rim(dx,dy,color,mode='source-over'){
      e.clearRect(0,0,lw,lh);e.globalCompositeOperation='source-over';e.drawImage(mask,0,0);e.globalCompositeOperation='destination-out';e.drawImage(mask,dx,dy);e.globalCompositeOperation='source-in';e.fillStyle=color;e.fillRect(0,0,lw,lh);g.globalCompositeOperation=mode;g.drawImage(edge,0,0);g.globalCompositeOperation='source-over';
    }
    // Opposing dark/light borders make the stroke refract instead of looking embossed.
    rim(-bevel,-bevel,`rgba(10,25,64,${.24+depth*.26})`,'multiply');
    rim(bevel,bevel,`rgba(255,255,255,${.64+depth*.32})`,'screen');
    // Cyan/violet separation is subtle, but gives bright edges the prismatic quality
    // visible in Apple's layered material on colourful content.
    const dispersion=(.045+depth*.055)*(.18+tintLum*.82);
    rim(bevel*.44,-bevel*.2,`rgba(105,246,255,${dispersion})`,'screen');
    rim(-bevel*.42,bevel*.18,`rgba(148,126,255,${dispersion*.72})`,'screen');

    // Reuse the edge buffer for the specular core to keep large exports memory-safe.
    e.clearRect(0,0,lw,lh);e.globalCompositeOperation='source-over';e.save();e.translate(lw/2,lh/2);e.globalAlpha=hello?1:.34;shape(e,'#fff',hello ? .34 : 1);e.restore();e.globalAlpha=1;e.globalCompositeOperation='source-in';
    const gleam=e.createLinearGradient(0,0,0,lh);gleam.addColorStop(0,'rgba(255,255,255,.28)');gleam.addColorStop(.35,`rgba(255,255,255,${.38+depth*.2})`);gleam.addColorStop(.68,`rgba(255,255,255,${.3+depth*.16})`);gleam.addColorStop(1,'rgba(255,255,255,.24)');e.fillStyle=gleam;e.fillRect(0,0,lw,lh);g.globalCompositeOperation='screen';g.drawImage(edge,0,0);g.globalCompositeOperation='source-over';

    target.shadowColor=`rgba(13,24,60,${.18+depth*.18})`;target.shadowBlur=Math.max(1,factor*(3+depth*5));target.shadowOffsetX=factor*depth*1.2;target.shadowOffsetY=factor*(1.5+depth*3.2);target.drawImage(glass,-lw/2,-lh/2);target.restore();
    mask.width=glass.width=edge.width=1;
  }
  let playing=0,previewStart=0,exporting=false,cancelRecording=null;
  const totalDuration=()=>state.duration+.8;
  function motionProgress(seconds,s=state){const t=clamp((seconds-.2)/s.duration,0,1);return t*t*(3-2*t);}
  const LIVE_DURATION=1;
  function liveMotionProgress(seconds){const t=clamp(seconds/(LIVE_DURATION*.5),0,1);return t*t*(3-2*t);}
  function stopPreview(){if(playing)cancelAnimationFrame(playing);playing=0;$('play').textContent='▶ Проиграть один раз';}
  function motionFrame(seconds){const c=$('previewCanvas'),pc=c.getContext('2d');pc.globalAlpha=1;pc.drawImage(background,0,0,c.width,c.height);const s={...state,width:c.width,height:c.height};drawText(pc,s,motionProgress(seconds),c);$('timeline').value=Math.round(seconds/totalDuration()*100);$('playState').textContent=seconds>=totalDuration()?'Финальный кадр · без повтора':`${seconds.toFixed(1)} / ${totalDuration().toFixed(1)} с`;}
  $('quickGlass').addEventListener('click',()=>{state.material=state.material==='glass'?'solid':'glass';updateUI(true);changed();});
  $('zoomPreview').addEventListener('click',()=>{if(!$('previewDialog').open)$('previewDialog').showModal();renderZoom();});
  $('closePreview').addEventListener('click',()=>$('previewDialog').close());
  $('previewDialog').addEventListener('click',event=>{if(event.target===$('previewDialog'))$('previewDialog').close();});
  window.addEventListener?.('resize',renderZoom,{passive:true});
  $('play').addEventListener('click',()=>{if(exporting)return;if(playing){stopPreview();renderPreview();$('timeline').value=100;$('playState').textContent='Финальный кадр';return;}if(raf){cancelAnimationFrame(raf);render();}previewStart=performance.now();$('play').textContent='■ Остановить';const frame=now=>{const t=Math.min(totalDuration(),(now-previewStart)/1000);motionFrame(t);if(t<totalDuration())playing=requestAnimationFrame(frame);else stopPreview();};playing=requestAnimationFrame(frame);});
  $('timeline').addEventListener('input',()=>{stopPreview();motionFrame(Number($('timeline').value)/100*totalDuration());});
  function videoDimensions(s){const scale=Math.min(1,s.videoSize/Math.min(s.width,s.height),2560/Math.max(s.width,s.height));return {width:Math.max(2,Math.round(s.width*scale/2)*2),height:Math.max(2,Math.round(s.height*scale/2)*2)};}
  function firstSupported(types){if(typeof MediaRecorder==='undefined')return null;return types.find(type=>MediaRecorder.isTypeSupported(type))||null;}
  function mp4Type(){return firstSupported(['video/mp4;codecs=hvc1.1.6.L123.B0','video/mp4;codecs=hvc1','video/mp4;codecs=hevc','video/mp4;codecs=avc1.42E01E','video/mp4']);}
  function videoType(){return state.videoFormat==='webm'?firstSupported(['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']):firstSupported(['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']);}
  function updateVideoInfo(){
    const d=videoDimensions(state),type=videoType(),nativeType=mp4Type();
    $('videoInfo').textContent=type?`${d.width} × ${d.height} px · до 30 кадров/с · ≈${totalDuration().toFixed(1)} с · ${type.includes('mp4')?'MP4':'WebM (MP4 недоступен в этом режиме)'}`:'Этот браузер не поддерживает запись видео. Попробуйте современный Safari, Chrome или Edge.';
    $('exportVideo').disabled=!type||!state.showText||!state.text.trim();
    $('exportLivePhoto').disabled=!nativeType||!state.showText||!state.text.trim();
    $('livePhotoHint').textContent=nativeType?'Формат как у рабочего Live Photo: связанная пара HEIC + MOV с общим Content Identifier. Для MOV сначала используется HEVC/H.265, если браузер умеет его записывать; иначе H.264. Анимация длится около 1 с, без обратного движения.':'Для Live Photo нужен браузер, который умеет записывать HEVC/H.264 в MP4 (обычно Safari, новый Chrome или Edge).';
  }
  async function recordAnimation(type,message='Записываем анимацию. Оставьте эту вкладку открытой…',profile='standard'){
    stopPreview();if(raf)cancelAnimationFrame(raf);render();
    const frozen={...state},dims=videoDimensions(frozen),duration=profile==='live'?LIVE_DURATION:frozen.duration+.8,video=surface(dims.width,dims.height),v=video.getContext('2d',{alpha:false}),bg=surface(dims.width,dims.height);bg.getContext('2d').drawImage(background,0,0,dims.width,dims.height);
    const s={...frozen,...dims},locks=[...document.querySelectorAll('input,select,button')].filter(el=>el.id!=='cancelVideo').map(el=>[el,el.disabled]);locks.forEach(([el])=>el.disabled=true);
    $('cancelVideo').hidden=false;$('videoProgress').hidden=false;$('videoProgress').value=0;$('videoStatus').textContent=message;
    let stream,recorder,tick=0,watchdog;
    try{
      if(!video.captureStream)throw new Error('Запись canvas недоступна. Попробуйте другой браузер.');
      v.drawImage(bg,0,0);stream=video.captureStream(profile==='live'?60:30);recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:Math.min(20000000,dims.width*dims.height*5)});
      const chunks=[];
      const blob=await new Promise((resolve,reject)=>{
        let cancelled=false,settled=false;const fail=error=>{if(settled)return;settled=true;cancelled=true;cancelAnimationFrame(tick);if(recorder.state!=='inactive')recorder.stop();reject(error);};
        cancelRecording=()=>fail(new Error('Запись отменена. Настройки сохранены.'));
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>fail(new Error('Браузер не смог записать видео. Выберите 480p или WebM и повторите.'));
        recorder.onstop=()=>{if(cancelled||settled)return;settled=true;const result=new Blob(chunks,{type:recorder.mimeType||type});result.size?resolve(result):reject(new Error('Видео пустое. Попробуйте меньший размер.'));};
        recorder.onstart=()=>{const started=performance.now();function frame(now){if(cancelled)return;const elapsed=Math.min(duration,(now-started)/1000),progress=profile==='live'?liveMotionProgress(elapsed):motionProgress(elapsed,s);v.drawImage(bg,0,0);drawText(v,s,progress,bg);$('videoProgress').value=Math.round(Math.min(1,elapsed/duration)*100);if(elapsed<duration)tick=requestAnimationFrame(frame);else recorder.stop();}tick=requestAnimationFrame(frame);};
        watchdog=setTimeout(()=>fail(new Error('Запись прервана по времени. Снизьте размер видео и повторите.')),(duration+20)*1000);recorder.start();
      });
      return {blob,dims,frozen};
    }finally{
      clearTimeout(watchdog);cancelAnimationFrame(tick);if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(track=>track.stop());video.width=bg.width=1;cancelRecording=null;locks.forEach(([el,disabled])=>el.disabled=disabled);$('cancelVideo').hidden=true;$('videoProgress').hidden=true;renderPreview();
    }
  }
  async function exportVideo(){
    if(exporting)return;const type=videoType();if(!type)return;exporting=true;
    try{
      const {blob,dims}=await recordAnimation(type),ext=blob.type.includes('mp4')?'mp4':'webm',file=new File([blob],`hello-live-${dims.width}x${dims.height}.${ext}`,{type:blob.type});
      if(isMobile())openSave(file);else download(file);
      $('videoStatus').textContent=`Готово: ${ext.toUpperCase()}, ${dims.width} × ${dims.height}. Одно появление, финальный кадр удерживается.`;
    }catch(e){$('videoStatus').textContent=e.message;}
    finally{exporting=false;updateVideoInfo();}
  }
  const enc={encode:s=>Uint8Array.from(s,c=>c.charCodeAt(0)&255)};
  const bytes=(...parts)=>{const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
  const be16=n=>Uint8Array.of((n>>>8)&255,n&255);
  const be32=n=>Uint8Array.of((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);
  const readU32=(view,at)=>view.getUint32(at,false);
  function qtBox(type,payload){const t=typeof type==='string'?enc.encode(type):type;return bytes(be32(payload.length+8),t,payload);}
  function jpegWithContentIdentifier(blob,identifier){
    return blob.arrayBuffer().then(buffer=>{
      const src=new Uint8Array(buffer);if(src[0]!==0xff||src[1]!==0xd8)throw new Error('Не удалось подготовить JPEG для Live Photo.');
      const id=enc.encode(identifier+'\0'),valueOffset=32,maker=bytes(enc.encode('Apple iOS\0'),Uint8Array.of(0,1),enc.encode('MM'),be16(1),be16(0x0011),be16(2),be32(id.length),be32(valueOffset),be32(0),id);
      const exifIfdOffset=26,makerOffset=44,tiff=bytes(enc.encode('MM'),be16(0x002a),be32(8),be16(1),be16(0x8769),be16(4),be32(1),be32(exifIfdOffset),be32(0),be16(1),be16(0x927c),be16(7),be32(maker.length),be32(makerOffset),be32(0),maker);
      const payload=bytes(enc.encode('Exif\0\0'),tiff),segment=bytes(Uint8Array.of(0xff,0xe1),be16(payload.length+2),payload);
      return new Blob([src.slice(0,2),segment,src.slice(2)],{type:'image/jpeg'});
    });
  }
  const hexBytes=hex=>Uint8Array.from(hex.match(/../g)||[],part=>parseInt(part,16));
  const fullBox=(version=0,flags=0)=>Uint8Array.of(version,(flags>>>16)&255,(flags>>>8)&255,flags&255);
  const unityMatrix=hexBytes('000100000000000000000000000000000001000000000000000000000000000040000000');
  function movieMeta(identifier){
    const hdlr=hexBytes('0000002268646c7200000000000000006d6474610000000000000000000000000000'),contentKey=enc.encode('com.apple.quicktime.content.identifier');
    const contentEntry=bytes(be32(4+4+contentKey.length),enc.encode('mdta'),contentKey),keys=qtBox('keys',bytes(fullBox(),be32(1),contentEntry));
    const contentData=qtBox('data',bytes(be32(1),be32(0),enc.encode(identifier))),contentItem=qtBox(Uint8Array.of(0,0,0,1),contentData),ilst=qtBox('ilst',contentItem);
    return qtBox('meta',bytes(hdlr,keys,ilst));
  }
  function boxType(data,at){return String.fromCharCode(...data.slice(at+4,at+8));}
  function readBox(data,at,end=data.length){
    if(at+8>end)return null;const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let size=readU32(view,at),header=8;
    if(size===1){if(at+16>end)return null;const big=view.getBigUint64(at+8,false);if(big>BigInt(Number.MAX_SAFE_INTEGER))return null;size=Number(big);header=16;}else if(size===0)size=end-at;
    if(size<header||at+size>end)return null;return {at,size,header,end:at+size,type:boxType(data,at)};
  }
  function childBoxes(data,start,end){const out=[];for(let at=start;at+8<=end;){const b=readBox(data,at,end);if(!b)break;out.push(b);at=b.end;}return out;}
  function findTopBox(data,type){for(const b of childBoxes(data,0,data.length))if(b.type===type)return b;return null;}
  function movieInfo(data,moov){
    const view=new DataView(data.buffer,data.byteOffset,data.byteLength),children=childBoxes(data,moov.at+moov.header,moov.end),mvhd=children.find(b=>b.type==='mvhd');
    if(!mvhd)throw new Error('В MP4 отсутствует mvhd.');
    const version=data[mvhd.at+8],timescale=readU32(view,mvhd.at+(version===1?28:20));if(!timescale)throw new Error('Некорректный timescale MP4.');
    let maxTrackId=0;
    for(const trak of children.filter(b=>b.type==='trak')){const tkhd=childBoxes(data,trak.at+trak.header,trak.end).find(b=>b.type==='tkhd');if(!tkhd)continue;const v=data[tkhd.at+8],id=readU32(view,tkhd.at+(v===1?28:20));maxTrackId=Math.max(maxTrackId,id);}
    return {mvhd,timescale,trackId:maxTrackId+1};
  }
  function stillImageTrack(trackId,movieTimescale,stillTimeSeconds,sampleOffset){
    const metadataTimescale=600,stillMovie=Math.max(0,Math.round(stillTimeSeconds*movieTimescale)),segment=Math.max(1,Math.round(movieTimescale/metadataTimescale)),trackDuration=stillMovie+segment;
    const tkhd=qtBox('tkhd',bytes(fullBox(0,0x0f),be32(0),be32(0),be32(trackId),be32(0),be32(trackDuration),new Uint8Array(8),be16(0),be16(0),be16(0),be16(0),unityMatrix,be32(0),be32(0)));
    const elst=qtBox('elst',bytes(fullBox(),be32(2),be32(stillMovie),be32(0xffffffff),be16(1),be16(0),be32(segment),be32(0),be16(1),be16(0))),edts=qtBox('edts',elst);
    const mdhd=qtBox('mdhd',bytes(fullBox(),be32(0),be32(0),be32(metadataTimescale),be32(1),be16(0x55c4),be16(0)));
    const hdlrMeta=hexBytes('0000003468646c72000000006d686c726d6574616170706c000000010000000013436f7265204d65646961204d65746164617461');
    const gmhd=hexBytes('00000020676d686400000018676d696e00000000004080008000800000000000');
    const hdlrData=hexBytes('0000003868646c720000000064686c72616c69736170706c000000000000000017436f7265204d6564696120446174612048616e646c6572');
    const dinf=hexBytes('0000002464696e660000001c6472656600000000000000010000000c616c697300000001');
    const keyd=qtBox('keyd',bytes(enc.encode('mdta'),enc.encode('com.apple.quicktime.still-image-time'))),transformKeyd=qtBox('keyd',bytes(enc.encode('mdta'),enc.encode('com.apple.quicktime.live-photo-still-image-transform'))),dtyp=qtBox('dtyp',bytes(be32(0),be32(0x41))),transformDtyp=qtBox('dtyp',bytes(be32(0),be32(0x53)));
    const keyEntry=bytes(be32(8+keyd.length+dtyp.length),be32(1),keyd,dtyp),transformEntry=bytes(be32(8+transformKeyd.length+transformDtyp.length),be32(2),transformKeyd,transformDtyp),keys=qtBox('keys',bytes(keyEntry,transformEntry));
    const mebx=bytes(be32(8+8+keys.length),enc.encode('mebx'),new Uint8Array(6),be16(1),keys);
    const stsd=qtBox('stsd',bytes(fullBox(),be32(1),mebx)),stts=qtBox('stts',bytes(fullBox(),be32(1),be32(1),be32(1)));
    const stsc=qtBox('stsc',bytes(fullBox(),be32(1),be32(1),be32(1),be32(1))),stsz=qtBox('stsz',bytes(fullBox(),be32(89),be32(1))),stco=qtBox('stco',bytes(fullBox(),be32(1),be32(sampleOffset)));
    const stbl=qtBox('stbl',bytes(stsd,stts,stsc,stsz,stco)),minf=qtBox('minf',bytes(gmhd,hdlrData,dinf,stbl)),mdia=qtBox('mdia',bytes(mdhd,hdlrMeta,minf));
    return qtBox('trak',bytes(tkhd,edts,mdia));
  }
  function patchChunkOffsets(data,moov,delta){
    const view=new DataView(data.buffer,data.byteOffset,data.byteLength),containers=new Set(['moov','trak','mdia','minf','stbl']);
    function walk(start,end){
      for(const b of childBoxes(data,start,end)){
        if(b.type==='stco'){const count=readU32(view,b.at+12);for(let n=0;n<count;n++){const p=b.at+16+n*4,value=readU32(view,p);if(value>=moov.end)view.setUint32(p,value+delta,false);}}
        else if(b.type==='co64'){const count=readU32(view,b.at+12);for(let n=0;n<count;n++){const p=b.at+16+n*8,value=view.getBigUint64(p,false);if(value>=BigInt(moov.end))view.setBigUint64(p,value+BigInt(delta),false);}}
        if(containers.has(b.type))walk(b.at+b.header,b.end);
      }
    }
    walk(moov.at+moov.header,moov.end);
  }
  async function movWithContentIdentifier(blob,identifier,stillTimeSeconds){
    const src=new Uint8Array(await blob.arrayBuffer()),moov=findTopBox(src,'moov');if(!moov)throw new Error('Не удалось найти структуру MOV/MP4 для Live Photo.');
    const info=movieInfo(src,moov),meta=movieMeta(identifier),placeholder=stillImageTrack(info.trackId,info.timescale,stillTimeSeconds,0),delta=meta.length+placeholder.length;
    const identity64=hexBytes('3ff00000000000000000000000000000000000000000000000000000000000003ff00000000000000000000000000000000000000000000000000000000000003ff0000000000000'),sample=bytes(be32(9),be32(1),Uint8Array.of(0xff),be32(80),be32(2),identity64),sampleOffset=src.length+delta+8,track=stillImageTrack(info.trackId,info.timescale,stillTimeSeconds,sampleOffset),copy=src.slice();
    patchChunkOffsets(copy,moov,delta);
    const ftyp=findTopBox(copy,'ftyp'),quickTimeBrand=enc.encode('qt  ');if(ftyp){copy.set(quickTimeBrand,ftyp.at+8);for(let at=ftyp.at+16;at+4<=ftyp.end;at+=4)copy.set(quickTimeBrand,at);}
    const view=new DataView(copy.buffer,copy.byteOffset,copy.byteLength);
    if(readU32(view,moov.at)===1)view.setBigUint64(moov.at+8,BigInt(moov.size+delta),false);else view.setUint32(moov.at,moov.size+delta,false);
    view.setUint32(info.mvhd.end-4,info.trackId+1,false);
    return new Blob([copy.slice(0,moov.end),track,meta,copy.slice(moov.end),qtBox('mdat',sample)],{type:'video/quicktime'});
  }

  let heicModulePromise=null;
  function loadHeicModule(){
    if(heicModulePromise)return heicModulePromise;
    heicModulePromise=new Promise((resolve,reject)=>{
      const init=()=>{
        try{
          if(typeof globalThis.__init__ELHEIF_MODULE!=='function')throw new Error('HEIC-кодировщик не загрузился.');
          const module={};module.onRuntimeInitialized=()=>resolve(module);globalThis.__init__ELHEIF_MODULE(module);
        }catch(error){reject(error);}
      };
      if(typeof globalThis.__init__ELHEIF_MODULE==='function'){init();return;}
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/elheif@0.1.0/pkg/elheif-wasm.js';script.async=true;script.crossOrigin='anonymous';script.onload=init;script.onerror=()=>reject(new Error('Не удалось загрузить HEIC-кодировщик. Проверьте подключение к интернету.'));document.head.appendChild(script);
    });
    return heicModulePromise;
  }
  const readSized=(data,at,size)=>{let value=0n;for(let i=0;i<size;i++)value=(value<<8n)|BigInt(data[at+i]);if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Слишком большой HEIC-файл.');return Number(value);};
  const beSized=(value,size)=>{let n=BigInt(value),out=new Uint8Array(size);for(let i=size-1;i>=0;i--){out[i]=Number(n&255n);n>>=8n;}return out;};
  function parseHeifIloc(data,b){
    const version=data[b.at+8],flags=(data[b.at+9]<<16)|(data[b.at+10]<<8)|data[b.at+11];let at=b.at+12;
    const first=data[at++],second=data[at++],offsetSize=first>>4,lengthSize=first&15,baseOffsetSize=second>>4,indexSize=(version===1||version===2)?second&15:0,countSize=version<2?2:4,itemIdSize=version<2?2:4,itemCount=readSized(data,at,countSize);at+=countSize;const items=[];
    for(let n=0;n<itemCount;n++){
      const itemId=readSized(data,at,itemIdSize);at+=itemIdSize;let method=0;if(version===1||version===2){method=readSized(data,at,2)&15;at+=2;}const dataRef=readSized(data,at,2);at+=2;const base=baseOffsetSize?readSized(data,at,baseOffsetSize):0;at+=baseOffsetSize;const extentCount=readSized(data,at,2);at+=2;const extents=[];
      for(let e=0;e<extentCount;e++){let index=0;if((version===1||version===2)&&indexSize){index=readSized(data,at,indexSize);at+=indexSize;}const offset=offsetSize?readSized(data,at,offsetSize):0;at+=offsetSize;const length=lengthSize?readSized(data,at,lengthSize):0;at+=lengthSize;extents.push({index,offset,length});}
      items.push({itemId,method,dataRef,base,extents});
    }
    return {version,flags,offsetSize,lengthSize,baseOffsetSize,indexSize,itemIdSize,items};
  }
  function buildHeifIloc(info,items){
    const parts=[Uint8Array.of((info.offsetSize<<4)|info.lengthSize,(info.baseOffsetSize<<4)|((info.version===1||info.version===2)?info.indexSize:0)),beSized(items.length,info.version<2?2:4)];
    for(const item of items){
      parts.push(beSized(item.itemId,info.itemIdSize));if(info.version===1||info.version===2)parts.push(be16(item.method&15));parts.push(be16(item.dataRef));if(info.baseOffsetSize)parts.push(beSized(item.base,info.baseOffsetSize));parts.push(be16(item.extents.length));
      for(const extent of item.extents){if((info.version===1||info.version===2)&&info.indexSize)parts.push(beSized(extent.index,info.indexSize));if(info.offsetSize)parts.push(beSized(extent.offset,info.offsetSize));if(info.lengthSize)parts.push(beSized(extent.length,info.lengthSize));}
    }
    return qtBox('iloc',bytes(fullBox(info.version,info.flags),...parts));
  }
  function heifExifEntry(itemId){
    const version=itemId<=65535?2:3,itemBytes=version===2?be16(itemId):be32(itemId);return qtBox('infe',bytes(fullBox(version),itemBytes,be16(0),enc.encode('Exif'),Uint8Array.of(0)));
  }
  function addHeifIinf(data,b,itemId){
    const version=data[b.at+8],flags=(data[b.at+9]<<16)|(data[b.at+10]<<8)|data[b.at+11],countSize=version===0?2:4,at=b.at+12,count=readSized(data,at,countSize);
    return qtBox('iinf',bytes(fullBox(version,flags),beSized(count+1,countSize),data.slice(at+countSize,b.end),heifExifEntry(itemId)));
  }
  function buildHeifIref(data,b,itemId,primaryId){
    const version=b?data[b.at+8]:0,flags=b?((data[b.at+9]<<16)|(data[b.at+10]<<8)|data[b.at+11]):0,idSize=version===0?2:4,existing=b?data.slice(b.at+12,b.end):new Uint8Array(0),cdsc=qtBox('cdsc',bytes(beSized(itemId,idSize),be16(1),beSized(primaryId,idSize)));
    return qtBox('iref',bytes(fullBox(version,flags),existing,cdsc));
  }
  function livePhotoExif(identifier){
    const id=enc.encode(identifier+'\0'),maker=bytes(enc.encode('Apple iOS\0'),Uint8Array.of(0,1),enc.encode('MM'),be16(1),be16(0x0011),be16(2),be32(id.length),be32(32),be32(0),id);
    const tiff=bytes(enc.encode('MM'),be16(0x002a),be32(8),be16(1),be16(0x8769),be16(4),be32(1),be32(26),be32(0),be16(2),be16(0x9000),be16(7),be32(4),enc.encode('0221'),be16(0x927c),be16(7),be32(maker.length),be32(56),be32(0),maker);
    return bytes(be32(6),enc.encode('Exif\0\0'),tiff,Uint8Array.of(0));
  }
  function heicWithContentIdentifier(raw,identifier){
    const src=raw instanceof Uint8Array?raw:new Uint8Array(raw),meta=findTopBox(src,'meta');if(!meta)throw new Error('HEIC не содержит meta box.');
    const metaVersion=src[meta.at+8],metaFlags=(src[meta.at+9]<<16)|(src[meta.at+10]<<8)|src[meta.at+11],children=childBoxes(src,meta.at+meta.header+4,meta.end),pitm=children.find(b=>b.type==='pitm'),iinf=children.find(b=>b.type==='iinf'),ilocBox=children.find(b=>b.type==='iloc'),irefBox=children.find(b=>b.type==='iref');if(!pitm||!iinf||!ilocBox)throw new Error('HEIC имеет неподдерживаемую структуру.');
    const pitmVersion=src[pitm.at+8],primaryId=readSized(src,pitm.at+12,pitmVersion===0?2:4),iloc=parseHeifIloc(src,ilocBox),newId=Math.max(...iloc.items.map(item=>item.itemId))+1,exif=livePhotoExif(identifier),newIinf=addHeifIinf(src,iinf,newId),newIref=buildHeifIref(src,irefBox,newId,primaryId);
    const makeItems=(shift,newOffset)=>[...iloc.items.map(item=>({...item,extents:item.extents.map(extent=>({...extent,offset:item.method===0&&extent.offset>=meta.end?extent.offset+shift:extent.offset}))})),{itemId:newId,method:0,dataRef:0,base:0,extents:[{index:0,offset:newOffset,length:exif.length}]}];
    const makeMeta=ilocBytes=>{const parts=[];let insertedIref=false;for(const child of children){if(child.type==='iinf'){parts.push(newIinf);if(!irefBox){parts.push(newIref);insertedIref=true;}}else if(child.type==='iref'){parts.push(newIref);insertedIref=true;}else if(child.type==='iloc')parts.push(ilocBytes);else parts.push(src.slice(child.at,child.end));}if(!insertedIref)parts.push(newIref);return qtBox('meta',bytes(fullBox(metaVersion,metaFlags),...parts));};
    const initialMeta=makeMeta(buildHeifIloc(iloc,makeItems(0,0))),delta=initialMeta.length-meta.size,exifOffset=src.length+delta+8,finalMeta=makeMeta(buildHeifIloc(iloc,makeItems(delta,exifOffset)));
    return bytes(src.slice(0,meta.at),finalMeta,src.slice(meta.end),qtBox('mdat',exif));
  }
  async function liveStillHeic(frozen,identifier){
    const stillCanvas=surface(frozen.width,frozen.height),ctx=stillCanvas.getContext('2d',{alpha:false,willReadFrequently:true}),bg=surface(frozen.width,frozen.height);bg.getContext('2d').drawImage(background,0,0,frozen.width,frozen.height);ctx.drawImage(bg,0,0);drawText(ctx,frozen,1,bg);
    try{
      $('videoStatus').textContent='Кодируем финальный кадр в HEIC…';const module=await loadHeicModule(),image=ctx.getImageData(0,0,stillCanvas.width,stillCanvas.height),rgba=new Uint8Array(image.data.buffer,image.data.byteOffset,image.data.byteLength),result=module.jsEncodeImage(rgba,stillCanvas.width,stillCanvas.height);if(!result||result.err)throw new Error(result?.err||'HEIC-кодировщик вернул пустой результат.');const encoded=new Uint8Array(result.data);return new Blob([heicWithContentIdentifier(encoded.slice(),identifier)],{type:'image/heic'});
    }finally{stillCanvas.width=bg.width=1;}
  }
  let crcTable=null;
  function crc32(data){if(!crcTable){crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}}let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  async function zipFiles(files){
    const locals=[],centrals=[];let offset=0,centralSize=0;const now=new Date(),dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
    for(const file of files){const data=new Uint8Array(await file.arrayBuffer()),name=enc.encode(file.name),crc=crc32(data),local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,dosTime,true);lv.setUint16(12,dosDate,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);local.set(name,30);locals.push(local,data);
      const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,dosTime,true);cv.setUint16(14,dosDate,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);centrals.push(central);offset+=local.length+data.length;centralSize+=central.length;}
    const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
    return new Blob([...locals,...centrals,end],{type:'application/zip'});
  }
  function uuid(){return (globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16);})).toUpperCase();}
  async function exportLivePhoto(){
    if(exporting)return;const type=mp4Type();if(!type){$('videoStatus').textContent='Live Photo требует MP4/H.264. Откройте сайт в Safari, новом Chrome или Edge.';return;}exporting=true;
    try{
      const {blob:rawVideo,dims,frozen}=await recordAnimation(type,'Готовим живые обои: записываем однократную анимацию…','live');
      const identifier=uuid(),stillTime=.5,still=await liveStillHeic(frozen,identifier),movie=await movWithContentIdentifier(rawVideo,identifier,stillTime),base=`LIVE_${identifier.replaceAll('-','').slice(0,12)}`;
      const photoFile=new File([still],base+'.HEIC',{type:'image/heic'}),movieFile=new File([movie],base+'.MOV',{type:'video/quicktime'});
      if(isMobile()&&navigator.share&&navigator.canShare&&navigator.canShare({files:[photoFile,movieFile]})){
        try{await navigator.share({files:[photoFile,movieFile],title:'Hello Live Photo'});$('videoStatus').textContent='Готово: HEIC + MOV с общим Content Identifier. Передайте оба файла в PhotoSync вместе.';return;}catch(e){if(e.name==='AbortError'){$('videoStatus').textContent='Экспорт Live Photo отменён.';return;}}
      }
      const archive=await zipFiles([photoFile,movieFile]),zip=new File([archive],`hello-live-photo-${dims.width}x${dims.height}.zip`,{type:'application/zip'});download(zip);
      $('videoStatus').textContent='Готово: ZIP содержит связанную пару HEIC + MOV. Распакуйте архив и импортируйте оба файла вместе.';
    }catch(e){$('videoStatus').textContent=e.message;}
    finally{exporting=false;updateVideoInfo();}
  }
  $('exportVideo').addEventListener('click',exportVideo);$('exportLivePhoto').addEventListener('click',exportLivePhoto);$('cancelVideo').addEventListener('click',()=>cancelRecording?.());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPreview();cancelRecording?.();}});

  updateUI(true);render();
})();
