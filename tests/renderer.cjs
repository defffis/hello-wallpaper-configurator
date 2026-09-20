const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {createCanvas,Path2D,DOMMatrix,loadImage}=require('@napi-rs/canvas');
const root=require('path').resolve(__dirname,'..');
const html=fs.readFileSync(root+'/index.html','utf8');
const els={},stored=new Map(),pending=[];
function element(id='',value='') {return {id,value,checked:false,disabled:false,textContent:'',style:{setProperty(){}},dataset:{},attributes:{},handlers:{},options:[],addEventListener(t,f){(this.handlers[t]??=[]).push(f)},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},append(){},click(){for(const f of this.handlers.click||[])f()},remove(){},showModal(){this.open=true},close(){this.open=false;(this.handlers.close||[]).forEach(f=>f())}};}
for(const tag of html.matchAll(/<(input|select|button|canvas|div|p|strong|dialog|img|a)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=els[tag[2]]=element(tag[2],/\bvalue="([^"]*)"/.exec(tag[0])?.[1]||'');e.checked=/\bchecked\b/.test(tag[0]);}
els.preset.options=['1290x2796','1206x2622','1179x2556','1170x2532','custom'].map(value=>({value}));
const c=createCanvas(1290,2796);c.setAttribute=()=>{};c.toBlob=(cb,mime,q)=>c.encode(mime==='image/jpeg'?'jpeg':'png',Math.round(q*100)).then(b=>cb(new Blob([b],{type:mime})));
els.canvas=c;
const outputs=[...html.matchAll(/<output[^>]*for="([^"]+)"/g)].map(m=>({htmlFor:m[1],textContent:''}));
const context={console,document:{getElementById:id=>els[id],querySelectorAll:q=>q.startsWith('output')?outputs:[],createElement:t=>t==='canvas'?createCanvas(1,1):element(),body:{append(){}}},Path2D,DOMMatrix,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},navigator:{userAgent:'test desktop',platform:'Linux',maxTouchPoints:0},setTimeout,clearTimeout,requestAnimationFrame:f=>{pending.push(f);return pending.length},cancelAnimationFrame(){},Blob,File,URL};
vm.createContext(context);
let source=fs.readFileSync(root+'/app.js','utf8');source=source.replace('updateUI(true);render();\n})();','updateUI(true);render();\nthis.qa={get state(){return state},set(raw){state=sanitize({...state,...raw});updateUI(true);changed();render()},render,makeBlob,filename,hslToHex,get prepared(){return prepared}};\n})();');
vm.runInContext(source,context);const qa=context.qa;
(async()=>{
 let count=0;function check(label,test){test();count++;console.log('PASS '+label)}
 check('Default canvas dimensions',()=>assert.equal(c.width+'x'+c.height,'1290x2796'));
 check('Default output labels',()=>assert.equal(outputs.find(o=>o.htmlFor==='dotSize').textContent,'2.2 px'));

 const base=Buffer.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);
 for(const [key,value] of Object.entries({bg1:'#99aacc',bg2:'#bbccdd',gradient:0,vignette:40,dotSize:4,spacing:28,dotOpacity:20,dotColor:'#222222',textY:60,textX:45,textSize:70,textColor:'#333333',angle:15,stroke:140,textOpacity:40,offsetRows:true,showText:false})){const old=qa.state[key];qa.set({[key]:value});const next=Buffer.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);check('Visible rendering change: '+key,()=>assert(!base.equals(next)));qa.set({[key]:old});}
 for(const [w,h] of [[1290,2796],[1206,2622],[1179,2556],[1170,2532],[640,960],[6000,320]]){qa.set({width:w,height:h});for(const format of ['png','jpeg']){qa.set({format});const b=await qa.makeBlob();const img=await loadImage(Buffer.from(await b.arrayBuffer()));check(`${format} ${w}x${h}`,()=>{assert.equal(img.width,w);assert.equal(img.height,h);assert.equal(b.type,format==='png'?'image/png':'image/jpeg')})}}
 qa.set({width:7000,height:12});check('Clamp 320–6000',()=>{assert.equal(c.width,6000);assert.equal(c.height,320)});
 qa.set({width:640,height:960,text:'Даниил',textColor:'#ffffff',textOpacity:100,showText:true});check('Custom text hint',()=>assert(els.textHint.textContent.includes('только для слова')));
 qa.set({format:'jpeg',quality:10});const low=await qa.makeBlob();qa.set({quality:100});const high=await qa.makeBlob();check('JPEG quality affects output',()=>assert(high.size>low.size));
 for(let i=0;i<40;i++){els.random.click();for(const key of ['bg1','bg2']){const hex=qa.state[key],v=[1,3,5].map(j=>parseInt(hex.slice(j,j+2),16)/255),max=Math.max(...v),min=Math.min(...v),l=(max+min)/2,s=(max-min)/(1-Math.abs(2*l-1));assert(l>=.67&&l<=.86);assert(s>=.32&&s<=.56)}}check('40 pastel randomizations',()=>{});
 els.reset.click();qa.render();check('Reset clears storage and restores all defaults',()=>{assert.equal(stored.size,0);assert.equal(qa.state.text,'hello');assert.equal(qa.state.width,1290);assert.equal(qa.state.bg1,'#7d74f6')});
 console.log(count+' checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
