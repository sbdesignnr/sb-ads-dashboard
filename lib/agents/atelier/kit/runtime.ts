// Ateliér: pohybový "runtime" pre stránky písané art directorom od nuly (freeform). Model do
// HTML len dopisuje atribúty (data-reveal, data-split, data-scrub, data-p, data-story …), o
// skutočné animácie sa stará tento odladený kód. Nezávisí od farieb ani písiem stránky.
// Obsah je viditeľný aj bez JS a v screenshotoch (trieda "js" sa tam odstráni).

export const RT_CSS = String.raw`
.js [data-reveal]{opacity:0;transform:translate3d(0,44px,0);transition:opacity .9s ease,transform 1.15s cubic-bezier(.16,.9,.2,1);transition-delay:var(--rd,0ms)}
.js [data-reveal=left]{transform:translate3d(-56px,0,0)}
.js [data-reveal=right]{transform:translate3d(56px,0,0)}
.js [data-reveal=zoom]{transform:scale(.92)}
.js [data-reveal=clip]{opacity:1;transform:none;clip-path:inset(0 0 100% 0);transition:clip-path 1.25s cubic-bezier(.77,0,.18,1);transition-delay:var(--rd,0ms)}
.js [data-reveal=clip-x]{opacity:1;transform:none;clip-path:inset(0 100% 0 0);transition:clip-path 1.25s cubic-bezier(.77,0,.18,1);transition-delay:var(--rd,0ms)}
.js [data-reveal].in{opacity:1;transform:none;clip-path:inset(0 0 0 0)}
.js [data-split] .rw{display:inline-block;overflow:hidden;vertical-align:top;padding:.05em .03em .14em;margin:-.05em -.03em -.14em}
.js [data-split] .rwi{display:inline-block;transform:translateY(115%) rotate(4deg);transition:transform 1.05s cubic-bezier(.16,.9,.2,1) calc(var(--i,0) * 65ms + var(--sd,0ms))}
.js [data-split].in .rwi{transform:none}
.js [data-scrub] .sw{opacity:.16;transition:opacity .25s linear}
.js [data-scrub] .sw.on{opacity:1}
[data-marquee],.rt-mq{overflow:hidden}
.rt-mq-track{display:flex;width:max-content;animation:rt-mq var(--mq,40s) linear infinite}
.rt-mq:hover .rt-mq-track{animation-play-state:paused}
.rt-mq-track>*{flex:none}
@keyframes rt-mq{to{transform:translate3d(-50%,0,0)}}
[data-hscroll] .hs-pin{position:relative}
.js [data-hscroll].on .hs-pin{position:sticky;top:0;height:100vh;overflow:hidden;display:flex;align-items:center}
.js [data-hscroll].on .hs-track{display:flex;flex-wrap:nowrap;width:max-content;will-change:transform;overflow:visible}
[data-hscroll]:not(.on) .hs-track{display:flex;overflow-x:auto;gap:var(--hs-gap,1.5rem);scroll-snap-type:x proximity}
[data-hscroll] .hs-track>*{flex:none}
[data-tilt]{transform-style:preserve-3d;transition:transform .3s ease-out;will-change:transform}
[data-par]{will-change:transform}
#rt-prog{position:fixed;left:0;top:0;height:3px;width:100%;z-index:9998;background:var(--accent,currentColor);transform:scaleX(0);transform-origin:left;pointer-events:none}
.rt-cur{display:none}
@media (hover:hover) and (pointer:fine){
  .js.has-cur,.js.has-cur a,.js.has-cur button,.js.has-cur [data-hover]{cursor:none}
  .js.has-cur .rt-cur{display:grid;place-items:center;position:fixed;left:0;top:0;z-index:9999;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;color:#000;mix-blend-mode:difference;font:600 11px/1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;transition:width .3s cubic-bezier(.16,.9,.2,1),height .3s cubic-bezier(.16,.9,.2,1),margin .3s cubic-bezier(.16,.9,.2,1)}
  .js.has-cur .rt-cur.h{width:72px;height:72px;margin:-36px 0 0 -36px}
  .js.has-cur .rt-cur.l{width:96px;height:96px;margin:-48px 0 0 -48px}
}
.rt-ld{display:none}
.js .rt-ld{display:grid;position:fixed;inset:0;z-index:10000;place-items:center;background:var(--ld-bg,#0b0b0b);color:var(--ld-ink,#fff);transition:transform 1.1s cubic-bezier(.8,0,.16,1) .05s}
.js .rt-ld.out{transform:translateY(-101%)}
@media (prefers-reduced-motion:reduce){.js [data-reveal],.js [data-split] .rwi{transition:none;transform:none;opacity:1;clip-path:none}.rt-mq-track{animation:none}}
`;

export const RT_JS = String.raw`
(function(){
var d=document,de=d.documentElement,W=window;
var reduce=W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches;
var $=function(s,r){return [].slice.call((r||d).querySelectorAll(s))};
de.classList.add('js');
/* formuláre v ukážke nič neodosielajú */
d.addEventListener('submit',function(e){e.preventDefault();var f=e.target;f.setAttribute('data-sent','1');var b=f.querySelector('button,[type=submit]');if(b&&!b.getAttribute('data-orig')){b.setAttribute('data-orig',b.textContent);b.textContent='Ďakujeme (ukážka)'}});
/* odhalenie prvkov + stagger */
$('[data-stagger]').forEach(function(p){$('[data-reveal]',p).forEach(function(c,i){c.style.setProperty('--rd',(i*90)+'ms')})});
$('[data-delay]').forEach(function(el){el.style.setProperty('--rd',(parseInt(el.getAttribute('data-delay'),10)||0)+'ms')});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
$('[data-reveal],[data-split]').forEach(function(el){io.observe(el)});
/* nadpisy po slovách (zachová vnorené značky) */
$('[data-split]').forEach(function(el){var i=0;el.style.setProperty('--sd',(parseInt(el.getAttribute('data-delay'),10)||0)+'ms');(function walk(n){[].slice.call(n.childNodes).forEach(function(c){if(c.nodeType===3){var f=d.createDocumentFragment();c.textContent.split(/(\s+)/).forEach(function(t){if(!t)return;if(/^\s+$/.test(t)){f.appendChild(d.createTextNode(' '));return}var w=d.createElement('span');w.className='rw';var x=d.createElement('span');x.className='rwi';x.style.setProperty('--i',i++);x.textContent=t;w.appendChild(x);f.appendChild(w)});n.replaceChild(f,c)}else if(c.nodeType===1&&!/^(svg|img|br)$/i.test(c.tagName)){walk(c)}})})(el)});
/* text sa rozsvieti podľa scrollu */
var scrubs=$('[data-scrub]').map(function(el){var ws=[];(function walk(n){[].slice.call(n.childNodes).forEach(function(c){if(c.nodeType===3){var f=d.createDocumentFragment();c.textContent.split(/(\s+)/).forEach(function(t){if(!t)return;if(/^\s+$/.test(t)){f.appendChild(d.createTextNode(' '));return}var s=d.createElement('span');s.className='sw';s.textContent=t;ws.push(s);f.appendChild(s)});n.replaceChild(f,c)}else if(c.nodeType===1){walk(c)}})})(el);return{el:el,ws:ws}});
/* číslice sa rozbehnú */
if(!reduce){var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;cio.unobserve(e.target);var el=e.target,txt=el.textContent,m=txt.match(/(\d(?:[\d\s.,]*\d)?)/);if(!m)return;var raw=m[1],num=parseFloat(raw.replace(/\s/g,'').replace(',','.'));if(!isFinite(num)||num>1e7)return;var dec=(raw.split(/[.,]/)[1]||'').length,sep=/\s/.test(raw)?' ':'',t0=null,dur=1600;function f(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/dur),v=num*(1-Math.pow(1-p,3));var s=v.toFixed(dec);if(sep){var a=s.split('.');a[0]=a[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ');s=a.join('.')}s=s.replace('.',/,/.test(raw)?',':'.');el.textContent=txt.replace(raw,s);if(p<1)requestAnimationFrame(f)}requestAnimationFrame(f)})},{threshold:.6});$('[data-count]').forEach(function(el){cio.observe(el)})}
/* bežiaci pás */
$('[data-marquee]').forEach(function(el){var t=document.createElement('div');t.className='rt-mq-track';var kids=[].slice.call(el.childNodes);kids.forEach(function(k){t.appendChild(k)});var g=t.cloneNode(true);g.setAttribute('aria-hidden','true');[].slice.call(g.childNodes).forEach(function(c){t.appendChild(c)});el.appendChild(t);el.classList.add('rt-mq');var sp=parseFloat(el.getAttribute('data-marquee'))||40;t.style.setProperty('--mq',sp+'s')});
/* horizontálna galéria pripnutá pri scrolle */
var hs=$('[data-hscroll]');
function hsSetup(){hs.forEach(function(s){var tr=s.querySelector('.hs-track');if(!tr)return;if(reduce||W.innerWidth<=820){s.classList.remove('on');s.style.height='';return}s.classList.add('on');s.style.height=(tr.scrollWidth-W.innerWidth+W.innerHeight)+'px'})}
/* scroll: pokrok stránky, paralaxa, --p (prechod cez obrazovku), --sp (pripnuté sekcie) */
var pg=null,pars=reduce?[]:$('[data-par]'),ps=reduce?[]:$('[data-p]'),stories=reduce?[]:$('[data-story]'),ticking=false;
if(d.body&&d.body.hasAttribute('data-progress')){pg=d.createElement('div');pg.id='rt-prog';d.body.appendChild(pg)}
function clamp(v){return Math.max(0,Math.min(1,v))}
function frame(){ticking=false;var y=W.scrollY||de.scrollTop,vh=W.innerHeight;
var h=de.scrollHeight-vh;var sp=h>0?clamp(y/h):0;de.style.setProperty('--page',sp.toFixed(4));if(pg)pg.style.transform='scaleX('+sp+')';
pars.forEach(function(el){var r=el.getBoundingClientRect();if(r.bottom<-300||r.top>vh+300)return;var s=parseFloat(el.getAttribute('data-par'))||.12;el.style.transform='translate3d(0,'+((r.top+r.height/2-vh/2)*-s).toFixed(1)+'px,0)'});
ps.forEach(function(el){var r=el.getBoundingClientRect();if(r.bottom<-100||r.top>vh+100)return;el.style.setProperty('--p',clamp((vh-r.top)/(vh+r.height)).toFixed(4))});
stories.forEach(function(el){var r=el.getBoundingClientRect(),tot=el.offsetHeight-vh;if(r.bottom<-100||r.top>vh+100)return;el.style.setProperty('--sp',clamp(-r.top/(tot>0?tot:1)).toFixed(4))});
hs.forEach(function(s){if(!s.classList.contains('on'))return;var tr=s.querySelector('.hs-track');if(!tr)return;var r=s.getBoundingClientRect(),tot=s.offsetHeight-vh,p=clamp(-r.top/(tot||1));tr.style.transform='translate3d('+(-p*(tr.scrollWidth-W.innerWidth)).toFixed(1)+'px,0,0)'});
scrubs.forEach(function(s){var r=s.el.getBoundingClientRect();if(r.bottom<-50||r.top>vh)return;var p=clamp((vh*.88-r.top)/(vh*.55+r.height*.6)),n=Math.round(p*s.ws.length);s.ws.forEach(function(w,i){w.classList.toggle('on',i<n)})})}
function req(){if(!ticking){ticking=true;requestAnimationFrame(frame)}}
W.addEventListener('scroll',req,{passive:true});
W.addEventListener('resize',function(){hsSetup();req()});
W.addEventListener('load',function(){hsSetup();req()});
hsSetup();req();
/* magnetické prvky, náklon, svetlo, kurzor */
var fine=W.matchMedia&&W.matchMedia('(hover:hover) and (pointer:fine)').matches;
if(fine&&!reduce){
$('[data-magnetic]').forEach(function(b){b.addEventListener('pointermove',function(e){var r=b.getBoundingClientRect();b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.25).toFixed(1)+'px,'+((e.clientY-r.top-r.height/2)*.35).toFixed(1)+'px)'});b.addEventListener('pointerleave',function(){b.style.transform=''})});
$('[data-tilt]').forEach(function(t){t.addEventListener('pointermove',function(e){var r=t.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;t.style.transform='perspective(900px) rotateY('+(x*9).toFixed(2)+'deg) rotateX('+(-y*9).toFixed(2)+'deg)'});t.addEventListener('pointerleave',function(){t.style.transform=''})});
$('[data-spot]').forEach(function(s){s.addEventListener('pointermove',function(e){var r=s.getBoundingClientRect();s.style.setProperty('--mx',(e.clientX-r.left)+'px');s.style.setProperty('--my',(e.clientY-r.top)+'px')})});
if(d.body&&d.body.hasAttribute('data-cursor')){var c=d.createElement('div');c.className='rt-cur';d.body.appendChild(c);de.classList.add('has-cur');var x=0,y=0,tx=0,ty=0;W.addEventListener('pointermove',function(e){tx=e.clientX;ty=e.clientY},{passive:true});(function loop(){x+=(tx-x)*.22;y+=(ty-y)*.22;c.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';requestAnimationFrame(loop)})();d.addEventListener('pointerover',function(e){var t=e.target.closest&&e.target.closest('a,button,[data-hover],[data-cursor-label]');var lab=t&&t.getAttribute('data-cursor-label');c.classList.toggle('h',!!t&&!lab);c.classList.toggle('l',!!lab);c.textContent=lab||''})}
}
/* úvodná opona */
var ld=d.querySelector('.rt-ld');if(ld){setTimeout(function(){ld.classList.add('out')},1250);setTimeout(function(){ld.remove()},2500)}
})();
`;
