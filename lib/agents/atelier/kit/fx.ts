// Ateliér kit: pohyb a interakcie (ručne napísané, odladené). Všetko sa zapína príznakmi témy,
// rešpektuje prefers-reduced-motion a bez JS je obsah stále viditeľný. V screenshotoch sa trieda
// "js" odstráni, takže sa nič neskrýva.
import type { FxFlags } from "./types";

export const FX_CSS = String.raw`
/* rozdelenie nadpisov na slová */
.js [data-split] .w{display:inline-block;overflow:hidden;vertical-align:top;padding:.04em .02em .12em;margin:-.04em -.02em -.12em}
.js [data-split] .wi{display:inline-block;transform:translateY(112%) rotate(3deg);transition:transform 1.05s cubic-bezier(.16,.9,.2,1) calc(var(--i,0) * 70ms + var(--d,0ms))}
.js [data-split].in .wi{transform:none}
/* úvodná opona */
.ld{display:none}
.js .ld{display:grid;position:fixed;inset:0;z-index:200;place-items:center;background:var(--ink);color:var(--bg);font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(40px,9vw,140px);letter-spacing:var(--dt);text-transform:var(--dc);line-height:1;transition:transform 1.1s cubic-bezier(.8,0,.16,1) .1s}
.js .ld span{display:block;overflow:hidden}
.js .ld span i{display:block;font-style:normal;transform:translateY(100%);animation:ld-in .9s cubic-bezier(.16,.9,.2,1) .15s forwards}
.js .ld.out{transform:translateY(-101%)}
@keyframes ld-in{to{transform:none}}
/* ukazovateľ posunu a vlastný kurzor */
#prog{position:fixed;left:0;top:0;height:3px;width:100%;z-index:150;background:var(--accent);transform:scaleX(0);transform-origin:left;pointer-events:none}
.cur{display:none}
@media (hover:hover) and (pointer:fine){
  .js.has-cur,.js.has-cur a,.js.has-cur button{cursor:none}
  .js.has-cur .cur{display:block;position:fixed;left:0;top:0;z-index:180;pointer-events:none;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;mix-blend-mode:difference;transition:width .25s,height .25s,margin .25s,opacity .3s}
  .js.has-cur .cur.h{width:64px;height:64px;margin:-32px 0 0 -32px}
}
/* svetlo za myšou v hero */
.spot{position:absolute;inset:0;pointer-events:none;z-index:0;background:radial-gradient(520px circle at var(--mx,70%) var(--my,30%),color-mix(in srgb,var(--accent) 22%,transparent),transparent 62%);opacity:0;transition:opacity .6s}
.hero:hover .spot{opacity:1}
[data-par]{will-change:transform}
.tilt{transform-style:preserve-3d;transition:transform .25s ease-out;will-change:transform}
/* horizontálna galéria: predvolene obyčajný posúvací pás; s JS sa pripne a posúva podľa scrollu */
.hs{padding-block:clamp(60px,8vw,120px)}
.hs__stick{display:flex;flex-direction:column;gap:clamp(20px,3vw,44px)}
.hs__head{padding-inline:var(--gutter);max-width:var(--maxw);margin:0 auto;width:100%}
.hs__track{display:flex;gap:clamp(16px,2vw,32px);padding-inline:var(--gutter);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px}
.hs__it{flex:0 0 clamp(260px,38vw,560px);scroll-snap-align:start}
.hs__it .img{aspect-ratio:4/5}
.hs__it figcaption{display:flex;justify-content:space-between;gap:12px;margin-top:12px;font:600 14px/1.4 var(--font-b)}
.hs__it figcaption span{color:var(--muted);font-weight:500}
@media (min-width:821px){
  .hs.on{padding:0;height:var(--hs-h,300vh)}
  .hs.on .hs__stick{position:sticky;top:0;height:100vh;overflow:hidden;justify-content:center}
  .hs.on .hs__track{overflow:visible;width:max-content;scroll-snap-type:none;will-change:transform}
}
`;

export const FX_JS = String.raw`
(function(){
var d=document,de=d.documentElement,W=window;
var reduce=W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches;
var F=(de.getAttribute('data-fx')||'').split(' ');
function on(k){return F.indexOf(k)>-1&&!reduce}
de.classList.add('js');
var $=function(s,r){return [].slice.call((r||d).querySelectorAll(s))};
/* odhalenie prvkov */
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.14,rootMargin:'0px 0px -6% 0px'});
$('.reveal,[data-split]').forEach(function(el){io.observe(el)});
/* nadpisy po slovách (zachová vnorené <em>) */
if(on('split')){$('[data-split]').forEach(function(el){var i=0;(function walk(n){[].slice.call(n.childNodes).forEach(function(c){if(c.nodeType===3){var f=d.createDocumentFragment();c.textContent.split(/(\s+)/).forEach(function(t){if(!t)return;if(/^\s+$/.test(t)){f.appendChild(d.createTextNode(' '));return}var w=d.createElement('span');w.className='w';var x=d.createElement('span');x.className='wi';x.style.setProperty('--i',i++);x.textContent=t;w.appendChild(x);f.appendChild(w)});n.replaceChild(f,c)}else if(c.nodeType===1){walk(c)}})})(el);io.observe(el)})}
else{$('[data-split]').forEach(function(el){el.classList.add('in')})}
/* číslice sa rozbehnú */
if(on('counters')){var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;cio.unobserve(e.target);var el=e.target,txt=el.textContent,m=txt.match(/(\d(?:[\d\s.,]*\d)?)/);if(!m)return;var raw=m[1],num=parseFloat(raw.replace(/\s/g,'').replace(',','.'));if(!isFinite(num)||num>1e7)return;var dec=(raw.split(/[.,]/)[1]||'').length,sep=/\s/.test(raw)?' ':'',t0=null,dur=1400;function f(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/dur),v=num*(1-Math.pow(1-p,3));var s=v.toFixed(dec);if(sep){var a=s.split('.');a[0]=a[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ');s=a.join('.')}s=s.replace('.',/,/.test(raw)?',':'.');el.textContent=txt.replace(raw,s);if(p<1)requestAnimationFrame(f)}requestAnimationFrame(f)})},{threshold:.6});$('[data-count]').forEach(function(el){cio.observe(el)})}
/* posun, paralaxa, horizontálna galéria */
var pg=d.getElementById('prog'),pars=on('parallax')?$('[data-par]'):[],hs=on('parallax')?$('.hs'):[],ticking=false;
function hsSetup(){hs.forEach(function(s){var tr=$('.hs__track',s)[0];if(!tr)return;if(W.innerWidth<=820){s.classList.remove('on');s.style.removeProperty('--hs-h');return}s.classList.add('on');s.style.setProperty('--hs-h',(tr.scrollWidth-W.innerWidth+W.innerHeight)+'px')})}
function frame(){ticking=false;var y=W.scrollY||de.scrollTop,vh=W.innerHeight;
if(pg){var h=de.scrollHeight-vh;pg.style.transform='scaleX('+(h>0?Math.min(1,y/h):0)+')'}
pars.forEach(function(el){var r=el.getBoundingClientRect();if(r.bottom<-200||r.top>vh+200)return;var s=parseFloat(el.getAttribute('data-par'))||.12;el.style.transform='translate3d(0,'+((r.top+r.height/2-vh/2)*-s).toFixed(1)+'px,0)'});
hs.forEach(function(s){if(W.innerWidth<=820||!s.classList.contains('on'))return;var tr=$('.hs__track',s)[0];if(!tr)return;var r=s.getBoundingClientRect(),tot=s.offsetHeight-vh,p=Math.max(0,Math.min(1,-r.top/(tot||1)));tr.style.transform='translate3d('+(-p*(tr.scrollWidth-W.innerWidth)).toFixed(1)+'px,0,0)'})}
function req(){if(!ticking){ticking=true;requestAnimationFrame(frame)}}
if(!reduce){W.addEventListener('scroll',req,{passive:true});W.addEventListener('resize',function(){hsSetup();req()});hsSetup();req();W.addEventListener('load',function(){hsSetup();req()})}
/* magnetické tlačidlá */
if(on('magnetic')&&W.matchMedia('(hover:hover)').matches){$('.btn').forEach(function(b){b.addEventListener('pointermove',function(e){var r=b.getBoundingClientRect();b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.22).toFixed(1)+'px,'+((e.clientY-r.top-r.height/2)*.3).toFixed(1)+'px)'});b.addEventListener('pointerleave',function(){b.style.transform=''})})}
/* kurzor */
if(on('cursor')&&W.matchMedia('(hover:hover) and (pointer:fine)').matches){var c=d.createElement('div');c.className='cur';d.body.appendChild(c);de.classList.add('has-cur');W.addEventListener('pointermove',function(e){c.style.transform='translate('+e.clientX+'px,'+e.clientY+'px)'},{passive:true});d.addEventListener('pointerover',function(e){c.classList.toggle('h',!!(e.target.closest&&e.target.closest('a,button,.btn,[data-hover]')))})}
/* svetlo v hero */
if(on('spotlight')){$('.hero').forEach(function(h){h.addEventListener('pointermove',function(e){var r=h.getBoundingClientRect();h.style.setProperty('--mx',(e.clientX-r.left)+'px');h.style.setProperty('--my',(e.clientY-r.top)+'px')})})}
/* náklon kariet */
if(on('tilt')&&W.matchMedia('(hover:hover)').matches){$('.tilt').forEach(function(t){t.addEventListener('pointermove',function(e){var r=t.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;t.style.transform='perspective(900px) rotateY('+(x*8).toFixed(2)+'deg) rotateX('+(-y*8).toFixed(2)+'deg)'});t.addEventListener('pointerleave',function(){t.style.transform=''})})}
/* opona */
var ld=d.querySelector('.ld');if(ld){setTimeout(function(){ld.classList.add('out')},1150);setTimeout(function(){ld.remove()},2400)}
})();
`;

export function fxAttr(f: FxFlags | undefined): string {
  const flags: string[] = [];
  const x = { split: true, parallax: true, counters: true, progress: true, ...(f ?? {}) };
  for (const [k, v] of Object.entries(x)) if (v) flags.push(k);
  return flags.join(" ");
}
