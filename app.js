'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'hello-wallpaper:v1';
  const defaults = Object.freeze({width:1290,height:2796,bg1:'#7d74f6',bg2:'#9b96ff',gradient:55,vignette:12,dotColor:'#ffffff',dotOpacity:65,dotSize:2.2,spacing:18,offsetRows:false,text:'hello',textColor:'#ffffff',textSize:48,textY:72,textX:50,stroke:100,angle:0,textOpacity:100,showText:true,format:'png',quality:95});
  const limits = {width:[320,6000],height:[320,6000],gradient:[0,100],vignette:[0,50],dotOpacity:[0,100],dotSize:[.5,8],spacing:[6,40],textSize:[15,90],textY:[10,92],textX:[5,95],stroke:[60,160],angle:[-25,25],textOpacity:[0,100],quality:[10,100]};
  const palettes = [ ['Purple','#7d74f6','#9b96ff'],['Blue','#91a8d6','#b7c9e8'],['Pink','#e49ab6','#f1bdd0'],['Mint','#8dccbb','#b6e0d3'],['Peach','#e6b09d','#f4d2bd'],['Lavender','#a99cd6','#c7bce8'],['Sky','#8bbce5','#b7d6f0'],['Cream','#e0cfab','#f0e3c9'] ];
  // Hand-prepared continuous Bézier outline, matched to the supplied reference.
  // Coordinates are independent of installed fonts. The source is also in assets/hello.svg.
  const HELLO = 'M 18 199 C 68 179 127 150 153 105 C 180 60 190 12 164 11 C 136 10 120 53 113 93 C 106 131 101 174 92 211 C 108 156 143 112 173 118 C 208 125 171 182 188 202 C 207 225 272 209 307 181 C 340 155 350 117 319 113 C 290 109 266 136 271 173 C 278 218 337 224 380 205 C 424 186 471 107 479 57 C 488 13 465 -4 443 20 C 417 47 400 117 403 169 C 405 203 414 216 441 216 C 485 216 534 164 561 104 C 582 57 594 13 572 11 C 544 6 523 57 515 95 C 507 132 506 170 516 195 C 530 235 581 217 616 179 C 631 163 635 145 653 131 C 674 114 705 118 719 139 C 736 165 721 205 696 215 C 671 225 646 211 643 186 C 640 163 650 136 671 127 C 697 115 716 137 745 129 C 761 125 774 120 782 113';
  const helloPath = new Path2D(HELLO);
  const canvas = $('canvas'), ctx = canvas.getContext('2d', {alpha:false});
  let state = {...defaults}, revision = 0, raf = 0, blobTimer, prepared = null, dialogURL = null, dialogFile = null;
  let tileKey = '', pattern = null;
  const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
  function sanitize(raw) {
    const result = {...defaults};
    for (const key of Object.keys(defaults)) {
      const value = raw?.[key];
      if (limits[key]) { const n = Number(value); if (value !== '' && value != null && Number.isFinite(n)) result[key] = clamp(key==='dotSize'?Math.round(n*10)/10:Math.round(n),...limits[key]); }
      else if (typeof defaults[key] === 'boolean') { if (typeof value === 'boolean') result[key] = value; }
      else if (key === 'text') { if(typeof value==='string') result[key] = value.slice(0,80); }
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
    document.querySelectorAll('output[for]').forEach(out=>{const key=String(out.htmlFor);out.textContent=String(state[key]).toUpperCase() + (key==='angle'?'°':['dotSize','spacing'].includes(key)?' px':limits[key]?'%':'');});
    $('resolution').textContent=`${state.width} × ${state.height} px`;
    $('quality').disabled=state.format!=='jpeg';
    $('stroke').disabled=state.text.trim()!=='hello';
    $('textHint').textContent=state.text.trim()==='hello'?'Apple / iPhone Hello · векторная надпись':'Фирменный стиль Apple Hello доступен только для слова «hello». Другой текст использует рукописный шрифт устройства.';
    $('export').textContent=`Экспортировать ${state.format==='png'?'PNG':'JPEG'}`;
    document.querySelectorAll('[data-palette]').forEach((btn,i)=>btn.setAttribute('aria-pressed',String(state.bg1===palettes[i][1]&&state.bg2===palettes[i][2])));
    canvas.setAttribute('aria-label',`Предпросмотр обоев ${state.width} на ${state.height} пикселей${state.showText&&state.text?`, надпись «${state.text}»`:''}`);
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
      if(s.showText&&s.text.trim()){
        ctx.save();ctx.translate(w*s.textX/100,h*s.textY/100);ctx.rotate(s.angle*Math.PI/180);ctx.globalAlpha=s.textOpacity/100;
        if(s.text.trim()==='hello'){
          const factor=w*s.textSize/100/806;
          ctx.scale(factor,factor);ctx.translate(-400,-116);ctx.strokeStyle=s.textColor;ctx.lineWidth=15*s.stroke/100;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(helloPath);
        } else {
          ctx.fillStyle=s.textColor;ctx.font='160px "Snell Roundhand", "Segoe Script", cursive';ctx.textAlign='center';ctx.textBaseline='middle';
          const measure=Math.max(1,ctx.measureText(s.text).width),factor=Math.min(w*s.textSize/100/measure,h*.25/160);
          ctx.scale(factor,factor);ctx.fillText(s.text,0,0);
        }
        ctx.restore();
      }
      scheduleBlob();
    }catch(error){$('status').textContent='Не удалось отрисовать изображение. Уменьшите разрешение и попробуйте снова.';console.error(error);}
  }
  function changed(save=true) { revision++;prepared=null;clearTimeout(blobTimer);updateUI();if(!raf)raf=requestAnimationFrame(render);if(save)persist(); }
  function mime(){return state.format==='jpeg'?'image/jpeg':'image/png';}
  function filename(){return `hello-wallpaper-${state.width}x${state.height}.${state.format==='jpeg'?'jpg':'png'}`;}
  function makeBlob(){const type=mime(),quality=state.quality/100;return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Браузер не смог создать файл. Попробуйте меньшее разрешение.')),type,quality));}
  const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  // Prepare on mobile in advance, so navigator.share executes directly in the click's activation.
  function scheduleBlob(){clearTimeout(blobTimer);if(!isMobile())return;const v=revision;blobTimer=setTimeout(async()=>{try{const blob=await makeBlob();if(v===revision)prepared={revision:v,file:new File([blob],filename(),{type:blob.type})};}catch{}},450);}
  function canShare(file){try{return !!(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}));}catch{return false;}}
  function releaseDialog(){if(dialogURL)URL.revokeObjectURL(dialogURL);dialogURL=null;dialogFile=null;$('savedImage').removeAttribute('src');}
  function openSave(file){releaseDialog();dialogFile=file;dialogURL=URL.createObjectURL(file);$('savedImage').src=dialogURL;$('openImage').href=dialogURL;$('downloadImage').href=dialogURL;$('downloadImage').download=file.name;$('share').hidden=!canShare(file);if(!$('saveDialog').open)$('saveDialog').showModal();}
  async function share(file){try{await navigator.share({files:[file],title:'Hello wallpaper'});$('status').textContent='Изображение передано в системное меню.';}catch(e){if(e.name!=='AbortError'){openSave(file);$('status').textContent='Выберите другой способ сохранения в открытом окне.';}}}
  function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('status').textContent=`Готово: ${file.name}`;}
  $('export').addEventListener('click',async()=>{
    // Capture current file synchronously; never await before a prepared Web Share call.
    if(isMobile()&&prepared?.revision===revision){const file=prepared.file;if(canShare(file))await share(file);else openSave(file);return;}
    const btn=$('export');btn.disabled=true;$('status').textContent='Готовим изображение…';
    const version=revision,name=filename();
    try{if(raf)cancelAnimationFrame(raf);render();const blob=await makeBlob();const file=new File([blob],name,{type:blob.type});if(isMobile()){if(version===revision)prepared={revision:version,file};openSave(file);$('status').textContent='Изображение готово к сохранению.';}else download(file);}catch(e){$('status').textContent=e.message;}finally{btn.disabled=false;}
  });
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
  updateUI(true);render();
})();
