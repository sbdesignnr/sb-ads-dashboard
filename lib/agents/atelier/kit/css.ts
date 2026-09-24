// Ateliér kit: CSS základ a CSS modulov. Ručne odladené (nie generované modelom), preto bez
// rozbitých stĺpcov, prekrývania a pretečenia. Téma sa vkladá cez CSS premenné.

export const BASE_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
*{margin:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font-family:var(--font-b),system-ui,sans-serif;font-size:clamp(16px,1.05vw,18px);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;text-rendering:optimizeLegibility}
img,svg{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
p{overflow-wrap:break-word;hyphens:manual}
h1,h2,h3{overflow-wrap:break-word}
.wrap{width:100%;max-width:var(--maxw);margin:0 auto;padding-inline:var(--gutter)}
.eyebrow{font-family:var(--font-b);font-weight:600;font-size:12px;line-height:1.3;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.display{font-family:var(--font-d),var(--font-b),sans-serif;font-weight:var(--dw);line-height:.94;letter-spacing:var(--dt);text-transform:var(--dc);text-wrap:balance}
.display em{font-style:normal;color:var(--accent2);text-decoration:underline;text-decoration-thickness:.07em;text-underline-offset:.14em}
h1.display{font-size:clamp(46px,7.6vw,124px)}
h2.display{font-size:clamp(36px,5.2vw,84px)}
h3.display{font-size:clamp(26px,2.6vw,42px);line-height:1}
.lead{font-size:clamp(18px,1.55vw,23px);line-height:1.5;color:color-mix(in srgb,var(--ink) 82%,transparent);max-width:38em}
.muted{color:var(--muted)}
.num{font-variant-numeric:tabular-nums lining-nums}
.btn{display:inline-flex;align-items:center;gap:.6em;padding:1.05em 1.6em;font:600 14px/1 var(--font-b);letter-spacing:.06em;text-transform:uppercase;border:1.5px solid transparent;border-radius:var(--r);transition:transform .25s cubic-bezier(.2,.8,.2,1),background .25s,color .25s,box-shadow .25s;cursor:pointer}
.btn--primary{background:var(--accent);color:var(--accent-ink)}
.btn--primary:hover{transform:translate(-3px,-3px);box-shadow:5px 5px 0 var(--ink)}
.btn--ghost{border-color:var(--ink);color:var(--ink)}
.btn--ghost:hover{background:var(--ink);color:var(--bg)}
.btn::after{content:"→";transition:transform .25s}
.btn:hover::after{transform:translateX(4px)}
.rule{border:0;border-top:1px solid color-mix(in srgb,var(--ink) 20%,transparent)}
.tag{display:inline-block;padding:.35em .8em;font:600 11px/1.2 var(--font-b);letter-spacing:.12em;text-transform:uppercase;border:1px solid color-mix(in srgb,var(--ink) 30%,transparent);border-radius:var(--r-tag);color:var(--ink)}
.mark{position:absolute;font:600 11px/1 var(--font-b);letter-spacing:.14em;text-transform:uppercase;background:var(--bg);color:var(--ink);padding:.6em .9em}
section{position:relative;padding-block:clamp(60px,8vw,120px)}
.js .reveal{opacity:0;transform:translateY(26px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}
.js .reveal.in{opacity:1;transform:none}
.js .reveal[data-d="1"]{transition-delay:.08s}.js .reveal[data-d="2"]{transition-delay:.16s}.js .reveal[data-d="3"]{transition-delay:.24s}
@media (prefers-reduced-motion:reduce){.js .reveal{opacity:1;transform:none;transition:none}*{animation:none!important}}

/* obrázky a grafika */
.img{position:relative;overflow:hidden;background:var(--surface);border-radius:var(--r)}
.img>img,.img>.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
[data-img="duotone"] .img>img{filter:grayscale(1) contrast(1.08)}
[data-img="duotone"] .img::after{content:"";position:absolute;inset:0;background:var(--accent);mix-blend-mode:multiply;opacity:.42;pointer-events:none}
[data-img="mono-hover"] .img>img{filter:grayscale(1);transition:filter .6s,transform 1.2s cubic-bezier(.2,.7,.2,1)}
[data-img="mono-hover"] .img:hover>img{filter:none;transform:scale(1.03)}
[data-img="warm"] .img>img{filter:saturate(1.08) contrast(1.04) sepia(.12)}
.img>.art{transition:transform 1.4s cubic-bezier(.2,.7,.2,1)}
.js .img.reveal,.js .hero__media.reveal .img{clip-path:inset(0 0 100% 0);transition:clip-path 1.2s cubic-bezier(.7,0,.2,1),opacity .6s}
.js .img.reveal.in,.js .hero__media.reveal.in .img{clip-path:inset(0 0 0 0)}
.img:hover>.art{transform:scale(1.04)}

/* textúry celej stránky */
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0}
[data-texture="grain"] body::before,body[data-texture="grain"]::before{opacity:.07;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");mix-blend-mode:multiply}
body[data-texture="lines"]{background-image:repeating-linear-gradient(0deg,transparent 0 47px,color-mix(in srgb,var(--ink) 6%,transparent) 47px 48px)}
body[data-texture="dots"]{background-image:radial-gradient(color-mix(in srgb,var(--ink) 11%,transparent) 1px,transparent 1px);background-size:22px 22px}
body[data-texture="paper"]::before{opacity:.05;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.04' numOctaves='4'/><feColorMatrix values='0 0 0 0 .4  0 0 0 0 .3  0 0 0 0 .2  0 0 0 .7 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
`;

export const MODULE_CSS = String.raw`
/* hlavička */
.hd{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:saturate(1.2) blur(10px);border-bottom:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}
.hd__in{display:flex;align-items:center;gap:clamp(20px,3vw,48px);min-height:76px}
.hd__logo{display:flex;align-items:center;gap:.7em;font-family:var(--font-d);font-weight:var(--dw);font-size:26px;line-height:1;letter-spacing:var(--dt);text-transform:var(--dc);margin-right:auto}
.hd__logo img{height:38px;width:auto;max-width:160px;object-fit:contain}
.hd nav{display:flex;gap:clamp(16px,2.4vw,36px)}
.hd nav a{font:500 15px/1 var(--font-b);padding-block:8px;position:relative}
.hd nav a::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.5px;background:var(--accent2);transform:scaleX(0);transform-origin:left;transition:transform .3s}
.hd nav a:hover::after{transform:scaleX(1)}
.hd .btn{padding:.9em 1.3em;font-size:12px}
@media (max-width:880px){.hd nav{display:none}}

/* hero */
.hero{padding-top:clamp(40px,6vw,88px)}
.hero__top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:clamp(20px,3vw,40px)}
.hero h1{max-width:14ch}
.hero h1+.lead{margin-top:clamp(22px,2.6vw,36px)}
.hero--poster h1{max-width:16ch}
.hero__row{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,4fr);gap:clamp(24px,5vw,80px);align-items:end;margin-top:clamp(28px,4vw,56px)}
.cta{display:flex;flex-wrap:wrap;gap:14px;margin-top:clamp(24px,3vw,36px)}
.card{border:1px solid color-mix(in srgb,var(--ink) 26%,transparent);padding:clamp(18px,2vw,28px);border-radius:var(--r);background:color-mix(in srgb,var(--bg) 60%,var(--surface))}
.card p{font:500 14px/1.8 var(--font-b)}
.card .eyebrow{display:block;margin-bottom:10px}
.hero__strip{margin-top:clamp(36px,5vw,72px);aspect-ratio:21/9}
.hero__strip .mark{left:0;bottom:0}
.hero__strip .mark+.mark{left:auto;right:0;top:0;bottom:auto}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:clamp(16px,3vw,40px);margin-top:clamp(28px,4vw,52px);padding-top:24px;border-top:1px solid color-mix(in srgb,var(--ink) 22%,transparent)}
.facts strong{display:block;font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(36px,4.4vw,68px);line-height:1;letter-spacing:var(--dt);color:var(--accent2)}
.facts span{display:block;margin-top:8px;font:600 12px/1.4 var(--font-b);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hero--split .hero__grid{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:clamp(28px,6vw,96px);align-items:center}
.hero--split .hero__media{position:relative;justify-self:stretch}
.hero--split .hero__media::before{content:"";position:absolute;inset:24px -24px -24px 24px;background:var(--accent);border-radius:var(--r);opacity:.9}
.hero--split .img{aspect-ratio:4/5;z-index:1}
.hero--split .hero__media .tag{position:absolute;left:-14px;top:28px;z-index:2;background:var(--bg)}
.hero--full{padding:0;min-height:min(92vh,900px);display:grid;align-items:end;color:#fff;isolation:isolate}
.hero--full .hero__bg{position:absolute;inset:0;z-index:-2}
.hero--full .hero__bg>img,.hero--full .hero__bg>.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero--full::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.18) 0%,rgba(0,0,0,.05) 30%,rgba(0,0,0,.72) 100%)}
.hero--full .hero__in{padding-block:clamp(48px,7vw,110px)}
.hero--full .eyebrow,.hero--full .lead{color:rgba(255,255,255,.86)}
.hero--full .display em{color:#fff}
.hero--full .btn--ghost{border-color:#fff;color:#fff}
.hero--full .btn--ghost:hover{background:#fff;color:#111}
.hero--full .facts{border-color:rgba(255,255,255,.3)}
.hero--full .facts strong{color:#fff}.hero--full .facts span{color:rgba(255,255,255,.75)}
.hero--statement .hero__grid{display:grid;grid-template-columns:minmax(0,8fr) minmax(0,4fr);gap:clamp(24px,5vw,72px);align-items:stretch}
.hero--statement .img{min-height:min(52vw,520px)}
@media (max-width:900px){.hero__row,.hero--split .hero__grid,.hero--statement .hero__grid{grid-template-columns:1fr}.hero--split .hero__media{margin-right:24px}.hero__strip{aspect-ratio:4/3}}

/* razítko (rotujúci kruhový nápis) */
.stamp{position:absolute;width:clamp(96px,10vw,148px);height:clamp(96px,10vw,148px);z-index:3}
.stamp svg{width:100%;height:100%;animation:spin 26s linear infinite}
.stamp text{font:700 11.5px var(--font-b);letter-spacing:.2em;text-transform:uppercase;fill:var(--ink)}
.stamp::before{content:"";position:absolute;inset:0;border-radius:50%;background:var(--accent);opacity:.95}
.stamp svg{position:relative}
.stamp text{fill:var(--accent-ink)}
.stamp b{position:absolute;inset:0;display:grid;place-items:center;font:800 clamp(20px,2.2vw,32px)/1 var(--font-d);color:var(--accent-ink);letter-spacing:var(--dt)}
.hero--poster .stamp{right:clamp(0px,2vw,24px);top:clamp(-70px,-5vw,-40px)}
.hero--split .stamp{right:-22px;bottom:-30px}
@keyframes spin{to{transform:rotate(360deg)}}

/* zoznam služieb */
.index__grid{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,8fr);gap:clamp(28px,6vw,96px)}
.index__head{position:sticky;top:110px;align-self:start}
.index__head p{margin-top:20px;max-width:26em;color:var(--muted)}
.index__list{border-top:1px solid color-mix(in srgb,var(--ink) 24%,transparent)}
.index__row{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:clamp(12px,2vw,28px);align-items:start;padding:clamp(22px,2.6vw,36px) 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 24%,transparent);transition:background .3s,padding .3s}
.index__row:hover{background:var(--surface);padding-inline:14px}
.index__n{font:600 13px/1.6 var(--font-b);letter-spacing:.12em;color:var(--muted);padding-top:.5em}
.index__row h3{margin-bottom:8px}
.index__row p{color:var(--muted);max-width:40em}
.index__row .tag{align-self:start;margin-top:.4em}
@media (max-width:900px){.index__grid{grid-template-columns:1fr}.index__head{position:static}.index__row{grid-template-columns:36px minmax(0,1fr)}.index__row .tag{grid-column:2;justify-self:start}}

/* register (ponuky, projekty v riadkoch) */
.reg__head{display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap;margin-bottom:clamp(28px,4vw,56px)}
.reg__list{border-top:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.reg__row{display:grid;grid-template-columns:clamp(72px,9vw,132px) minmax(0,1.5fr) minmax(0,1fr) auto;gap:clamp(14px,2.4vw,40px);align-items:center;padding:clamp(16px,1.8vw,24px) 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 30%,transparent);transition:background .3s,padding .3s}
.reg__row:hover{background:var(--surface);padding-inline:12px}
.reg__thumb{aspect-ratio:4/3}
.reg__title{font:600 clamp(17px,1.5vw,21px)/1.25 var(--font-b)}
.reg__place{color:var(--muted);font-size:15px;margin-top:4px}
.reg__val{display:flex;align-items:baseline;gap:.35em;font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(34px,4.2vw,64px);line-height:1;letter-spacing:var(--dt);color:var(--ink)}
.reg__val small{font:600 13px/1 var(--font-b);letter-spacing:.1em;color:var(--muted)}
.reg__go{font:600 13px/1.3 var(--font-b);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;text-align:right}
.reg__go::after{content:" →"}
.reg__foot{margin-top:28px}
@media (max-width:820px){.reg__row{grid-template-columns:88px minmax(0,1fr);grid-template-areas:"t m" "t v" "g g"}.reg__thumb{grid-area:t}.reg__main{grid-area:m}.reg__valw{grid-area:v}.reg__go{grid-area:g;text-align:left}}

/* galéria */
.gal__head{margin-bottom:clamp(28px,4vw,56px)}
.gal__grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:clamp(12px,1.6vw,24px)}
.gal__it{grid-column:span 4}
.gal__it:nth-child(5n+1){grid-column:span 7}.gal__it:nth-child(5n+2){grid-column:span 5}
.gal__it .img{aspect-ratio:4/3}.gal__it:nth-child(5n+1) .img{aspect-ratio:16/11}.gal__it:nth-child(5n+2) .img{aspect-ratio:4/5}
.gal__it figcaption{display:flex;justify-content:space-between;gap:12px;margin-top:12px;font:600 14px/1.4 var(--font-b)}
.gal__it figcaption span{color:var(--muted);font-weight:500}
@media (max-width:820px){.gal__it,.gal__it:nth-child(n){grid-column:span 12}.gal__it .img,.gal__it:nth-child(n) .img{aspect-ratio:4/3}}

/* postup (kroky) */
.steps__head{margin-bottom:clamp(36px,5vw,72px);max-width:30em}
.steps__list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:clamp(22px,3vw,44px);list-style:none;padding:0;counter-reset:s}
.steps__it{position:relative;padding-top:clamp(84px,9vw,136px);border-top:2px solid var(--ink)}
.steps__it::before{content:"0" counter(s);counter-increment:s;position:absolute;left:0;top:14px;font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(64px,8vw,124px);line-height:.8;color:transparent;-webkit-text-stroke:1.5px var(--ink);letter-spacing:var(--dt)}
.steps__it::after{content:"";position:absolute;left:0;top:-7px;width:12px;height:12px;background:var(--accent);border-radius:50%}
.steps__it h3{margin-bottom:10px}
.steps__it p{color:var(--muted);font-size:16px}

/* recenzie / citát */
.q__grid{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,8fr);gap:clamp(28px,6vw,96px);align-items:center}
.q__rate strong{display:block;font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(88px,13vw,200px);line-height:.85;letter-spacing:var(--dt);color:var(--accent2)}
.q__rate span{display:block;margin-top:14px}
.q blockquote{border-left:4px solid var(--accent);padding-left:clamp(20px,3vw,44px)}
.q blockquote p{font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(26px,3.2vw,50px);line-height:1.08;letter-spacing:var(--dt);text-wrap:balance}
.q blockquote footer{margin-top:22px}
@media (max-width:900px){.q__grid{grid-template-columns:1fr}}

/* čísla */
.stats{padding-block:clamp(48px,6vw,90px);background:var(--ink);color:var(--bg)}
.stats__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.stats__it{padding:12px clamp(16px,2.6vw,40px);border-left:1px solid color-mix(in srgb,var(--bg) 26%,transparent)}
.stats__it:first-child{border-left:0;padding-left:0}
.stats__it strong{display:block;font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(48px,6.6vw,104px);line-height:.95;letter-spacing:var(--dt);color:var(--bg)}
.stats__it span{display:block;margin-top:10px;font:600 12px/1.4 var(--font-b);letter-spacing:.14em;text-transform:uppercase;opacity:.75}

/* o nás */
.about__grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(28px,6vw,96px);align-items:start}
.about__pull{margin-top:28px;padding-top:24px;border-top:2px solid var(--accent);font:500 clamp(18px,1.6vw,24px)/1.4 var(--font-d);letter-spacing:var(--dt)}
.about__body p+p{margin-top:1.1em}
.about__body .img{aspect-ratio:16/10;margin-top:clamp(24px,3vw,40px)}
@media (max-width:900px){.about__grid{grid-template-columns:1fr}}

/* tím */
.team__list{border-top:1px solid color-mix(in srgb,var(--ink) 30%,transparent);margin-top:clamp(28px,4vw,56px)}
.team__row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.2fr);gap:clamp(14px,2.4vw,40px);align-items:baseline;padding:clamp(18px,2vw,28px) 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.team__row h3{font-size:clamp(24px,2.4vw,36px)}
.team__row .role{color:var(--muted)}
.team__row a{display:block;font-weight:600}
@media (max-width:820px){.team__row{grid-template-columns:1fr;gap:4px}}

/* ticker */
.ticker{padding:0;overflow:hidden;border-block:1.5px solid var(--ink);background:var(--accent);color:var(--accent-ink)}
.ticker__t{display:flex;width:max-content;animation:tick 46s linear infinite}
.ticker__t span{display:inline-flex;align-items:center;gap:clamp(24px,3vw,48px);padding:clamp(14px,1.8vw,24px) clamp(12px,1.5vw,24px);font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(24px,3.4vw,52px);line-height:1;letter-spacing:var(--dt);text-transform:uppercase;white-space:nowrap}
.ticker__t span::after{content:"✦";font-size:.5em}
@keyframes tick{to{transform:translateX(-50%)}}

/* FAQ */
.faq__list{margin-top:clamp(24px,3vw,48px);border-top:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.faq details{border-bottom:1px solid color-mix(in srgb,var(--ink) 30%,transparent);padding:clamp(16px,2vw,26px) 0}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:20px;font:600 clamp(18px,1.7vw,24px)/1.3 var(--font-b)}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:1.4em;line-height:1;transition:transform .3s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{margin-top:12px;color:var(--muted);max-width:44em}

/* výzva */
.cta-band{background:var(--accent);color:var(--accent-ink);overflow:hidden}
.cta-band .wrap{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:clamp(24px,5vw,80px);align-items:end}
.cta-band h2{max-width:14ch}
.cta-band .lead{color:color-mix(in srgb,var(--accent-ink) 85%,transparent);margin-top:18px}
.cta-band .btn{background:var(--accent-ink);color:var(--accent)}
.cta-band .btn:hover{box-shadow:5px 5px 0 var(--ink)}
@media (max-width:820px){.cta-band .wrap{grid-template-columns:1fr}}

/* kontakt */
.contact__grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(28px,6vw,96px)}
.contact dl{margin-top:clamp(20px,3vw,36px);border-top:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.contact dl>div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:16px;padding:16px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.contact dt{font:600 12px/1.8 var(--font-b);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.contact dd{font-weight:500}
.contact dd a{border-bottom:1.5px solid var(--accent2)}
.form{background:var(--surface);padding:clamp(22px,3vw,44px);border-radius:var(--r)}
.form h3{margin-bottom:22px}
.form label{display:block;margin-bottom:16px;font:600 12px/1.4 var(--font-b);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.form input,.form textarea{display:block;width:100%;margin-top:6px;padding:14px 16px;font:400 16px/1.4 var(--font-b);color:var(--ink);background:var(--bg);border:1.5px solid color-mix(in srgb,var(--ink) 34%,transparent);border-radius:var(--r);transition:border-color .2s}
.form input:focus,.form textarea:focus{outline:none;border-color:var(--accent)}
.form .btn{margin-top:8px}
@media (max-width:900px){.contact__grid{grid-template-columns:1fr}.contact dl>div{grid-template-columns:92px minmax(0,1fr)}}

/* pätička */
.ft{padding-block:clamp(48px,6vw,88px) 28px;background:var(--ink);color:var(--bg)}
.ft__mark{font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(56px,13vw,220px);line-height:.85;letter-spacing:var(--dt);text-transform:var(--dc);overflow-wrap:anywhere;opacity:.96}
.ft__cols{display:flex;flex-wrap:wrap;justify-content:space-between;gap:24px;margin-top:clamp(28px,4vw,56px);padding-top:24px;border-top:1px solid color-mix(in srgb,var(--bg) 26%,transparent);font-size:15px}
.ft__cols a{border-bottom:1px solid color-mix(in srgb,var(--bg) 40%,transparent)}
.ft__credit{margin-top:28px;font:500 12px/1.4 var(--font-b);letter-spacing:.1em;opacity:.6}
`;
