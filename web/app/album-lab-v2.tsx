'use client';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import './album-lab.css';
import './refinements.css';
import './lab-v2.css';
type Mode = 'any' | 'all';
type Metric = 'brightness' | 'contrast' | 'saturation' | 'detail' | 'entropy' | 'warmth' | 'colorfulness' | 'symmetry' | 'darkRatio' | 'lightRatio' | 'hue';
type SortKey = 'year' | 'userRating' | 'communityRating' | 'ratingCount' | 'title' | 'hue';
type Album = {
    id: string;
    title: string;
    artist: string;
    year: number | null;
    releaseDate?: string | null;
    userRating: number | null;
    communityRating: number | null;
    ratingCount: number;
    releaseType: string;
    language: string | null;
    durationSeconds: number | null;
    ranks: {
        position: number;
        scope: string;
        year: number | null;
    }[];
    genres: string[];
    descriptors: string[];
    cover: string;
    trackCount: number;
    avgTrackSeconds: number | null;
    visual: Record<Exclude<Metric, 'hue'>, number> & {
        dominant: {
            hex: string;
            weight: number;
            h: number;
            s: number;
            l: number;
        };
        accent?: {
            hex: string;
            weight: number;
            h: number;
            s: number;
            l: number;
        };
        palette: {
            hex: string;
            weight: number;
            h: number;
            s: number;
            l: number;
        }[];
        chromaticHue?: number;
        hueDiversity?: number;
    };
    url: string | null;
};
const tabs = ['总览', '流派星系', '标签语义', '时长与评分', '年代演化', '封面视觉', '主题篮子', '专辑档案', '关系漫游'];
const colors = ['#d8ff38', '#ff654c', '#6680ff', '#f4bd35', '#8e6bff', '#35cda0', '#ff84bd'];
const choiceColors = ['#f0b6ad', '#b8c9ef', '#c8b6e8', '#b9d9ca', '#efd39c', '#e6b9d1', '#b9d7df'];
const names: Record<Metric, string> = { brightness: '亮度', contrast: '明暗对比', saturation: '饱和度', detail: '细节密度', entropy: '视觉熵', warmth: '色温', colorfulness: '色彩丰富度', symmetry: '水平对称', darkRatio: '暗部占比', lightRatio: '亮部占比', hue: '主题色相' };
const metrics = Object.keys(names) as Metric[];
const accent = (a: Album) => a.visual.accent ?? a.visual.palette.find(c => c.s >= 22 && c.l >= 12 && c.l <= 88) ?? a.visual.dominant;
const hue = (a: Album) => accent(a).h;
const value = (a: Album, m: Metric) => m === 'hue' ? hue(a) / 3.6 : a.visual[m];
const count = (xs: string[]) => Object.entries(xs.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]) as [
    string,
    number
][];
const match = (v: string[], s: string[], m: Mode) => !s.length || (m === 'all' ? s.every(x => v.includes(x)) : s.some(x => v.includes(x)));
function recolorPaper(e: React.PointerEvent<HTMLElement>) {
    const button = (e.target as HTMLElement).closest('button');
    if (!button?.closest('.choiceCloud,.filters,.timelineTools,.sorter,.axes,.viewSwitch,.tagTools,.genreDirectory,.basketDirectory')) return;
    const current = button.style.getPropertyValue('--choice-color');
    const choices = choiceColors.filter(color => color !== current);
    button.style.setProperty('--choice-color', choices[Math.floor(Math.random() * choices.length)]);
}
function AmbientBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current, gl = canvas?.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
        if (!canvas || !gl) return;
        const vertexSource = `attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
        const fragmentSource = `precision mediump float;varying vec2 uv;uniform float aspect;uniform float colorLightness;uniform float colorChroma;uniform vec2 centers[4];
vec3 oklabToSrgb(vec3 c){float l=c.x+.3963377774*c.y+.2158037573*c.z,m=c.x-.1055613458*c.y-.0638541728*c.z,s=c.x-.0894841775*c.y-1.291485548*c.z;l=l*l*l;m=m*m*m;s=s*s*s;vec3 rgb=vec3(4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s);vec3 lo=12.92*rgb,hi=1.055*pow(max(rgb,vec3(0.)),vec3(1./2.4))-.055;return clamp(mix(lo,hi,step(vec3(.0031308),rgb)),0.,1.);}
float field(vec2 point,vec2 center,vec2 radius){vec2 d=(point-center)/radius;return exp(-2.35*dot(d,d));}
void main(){vec2 q=vec2(uv.x*aspect,uv.y);vec3 base=mix(vec3(.9138,-.0213,-.0404),vec3(.9134,.0511,-.0073),smoothstep(0.,1.,uv.x*.65+uv.y*.35));vec3 c0=vec3(colorLightness,colorChroma*vec2(-.4255,-.9049)),c1=vec3(colorLightness,colorChroma*vec2(.9975,-.0712)),c2=vec3(colorLightness,colorChroma*vec2(-.0792,.9969)),c3=vec3(colorLightness,colorChroma*vec2(-.9620,.2730));float w0=field(q,centers[0],vec2(.48*aspect,.43)),w1=field(q,centers[1],vec2(.52*aspect,.39)),w2=field(q,centers[2],vec2(.45*aspect,.46)),w3=field(q,centers[3],vec2(.54*aspect,.38));float bw=.72,total=bw+w0+w1+w2+w3;float lightness=(base.x*bw+colorLightness*(w0+w1+w2+w3))/total;vec2 hueVector=(base.yz*bw+c0.yz*w0+c1.yz*w1+c2.yz*w2+c3.yz*w3)/total;float chroma=(length(base.yz)*bw+colorChroma*(w0+w1+w2+w3))/total;float hueLength=length(hueVector);vec2 ab=hueLength>.0001?hueVector*(chroma/hueLength):vec2(0.);gl_FragColor=vec4(oklabToSrgb(vec3(lightness,ab)),1.);}`;
        const compile = (type: number, source: string) => { const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader); return shader; };
        const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource), program = gl.createProgram()!;
        gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.useProgram(program);
        const buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const aspectLocation = gl.getUniformLocation(program, 'aspect'), centersLocation = gl.getUniformLocation(program, 'centers[0]');
        const backgroundStyle = getComputedStyle(canvas), lightnessValue = Number.parseFloat(backgroundStyle.getPropertyValue('--ambient-lightness')) || .84, chromaValue = Number.parseFloat(backgroundStyle.getPropertyValue('--ambient-chroma')) || .16;
        gl.uniform1f(gl.getUniformLocation(program, 'colorLightness'), lightnessValue); gl.uniform1f(gl.getUniformLocation(program, 'colorChroma'), chromaValue);
        const mobile = matchMedia('(pointer: coarse)').matches, targetFps = mobile ? 30 : 60;
        const desktopPixels = Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio, 1.25), baseMaxDimension = mobile ? 1080 : Math.min(2560, desktopPixels);
        const centers = new Float32Array(8);
        let frame = 0, previous = 0, lastRaf = 0, sampleTime = 0, sampleCount = 0, quality = 1, start = performance.now(), active = !document.hidden;
        const resize = () => { const width = innerWidth, height = innerHeight, limit = baseMaxDimension * quality, scale = Math.min(devicePixelRatio, limit / Math.max(width, height)); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale)); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; gl.viewport(0, 0, canvas.width, canvas.height); };
        const render = (now: number) => { const t = (now - start) / 1000, a = canvas.width / canvas.height; centers.set([(.5+.31*Math.sin(t*.61))*a,.5+.30*Math.cos(t*.47),(.5+.32*Math.cos(t*.43+1.7))*a,.5+.29*Math.sin(t*.57+.4),(.5+.30*Math.sin(t*.53+3.1))*a,.5+.31*Math.cos(t*.39+2),(.5+.33*Math.cos(t*.49+4.4))*a,.5+.28*Math.sin(t*.45+3.6)]); gl.uniform1f(aspectLocation, a); gl.uniform2fv(centersLocation, centers); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
        const draw = (now: number) => { if (!active) return; frame = requestAnimationFrame(draw); if (lastRaf) { sampleTime += now - lastRaf; sampleCount++; } lastRaf = now; if (!mobile && sampleCount >= 120) { const average = sampleTime / sampleCount, next = average > 20 ? Math.max(.55, quality - .1) : average < 17 ? Math.min(1, quality + .05) : quality; sampleTime = 0; sampleCount = 0; if (next !== quality) { quality = next; resize(); } } if (now - previous < 1000 / targetFps - 1) return; previous = now; render(now); };
        const motion = matchMedia('(prefers-reduced-motion: reduce)');
        const visibility = () => { active = !document.hidden; cancelAnimationFrame(frame); if (active) { start = performance.now(); previous = 0; lastRaf = 0; sampleTime = 0; sampleCount = 0; if (motion.matches) render(start); else frame = requestAnimationFrame(draw); } };
        resize(); addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
        render(start); if (!motion.matches) frame = requestAnimationFrame(draw);
        return () => { active = false; cancelAnimationFrame(frame); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); };
    }, []);
    return <canvas ref={canvasRef} className="ambientBackground" aria-hidden="true"/>;
}
export default function AlbumLab() {
    const [all, setAll] = useState<Album[]>([]), [tab, setTab] = useState(0), [ready, setReady] = useState(false), [focus, setFocus] = useState<Album | null>(null), [filtersOpen, setFiltersOpen] = useState(false), [tabsCollapsed, setTabsCollapsed] = useState(false), [portraitMenuOpen, setPortraitMenuOpen] = useState(false);
    const restoreMenuControls=useRef<null|(()=>void)>(null);
    const [q, setQ] = useState(''), [gs, setGs] = useState<string[]>([]), [ts, setTs] = useState<string[]>([]), [gm, setGm] = useState<Mode>('any'), [tm, setTm] = useState<Mode>('any'), [sorts,setSorts]=useState<SortKey[]>([]);
    useEffect(() => {
        let cancelled = false;
        const saved = Number(localStorage.getItem('chroma-tab'));
        const restoredTab = Number.isInteger(saved) && saved >= 0 && saved < 8 ? saved : 0;
        fetch('/data/albums.json')
            .then(response => {
                if (!response.ok) throw new Error(`Album data request failed: ${response.status}`);
                return response.json() as Promise<Album[]>;
            })
            .then(albums => {
                if (cancelled) return;
                setTab(restoredTab);
                setAll(albums);
                requestAnimationFrame(() => setReady(true));
            })
            .catch(error => {
                console.error(error);
                if (!cancelled) setReady(true);
            });
        return () => { cancelled = true; };
    }, []);
    useEffect(() => {
        let touchY = 0;
        const portrait = window.matchMedia('(orientation: portrait)');
        const changeForDirection = (down: boolean) => {
            if (!portrait.matches || filtersOpen || window.scrollY < 72) setTabsCollapsed(false);
            else setTabsCollapsed(down);
        };
        const onWheel = (event: WheelEvent) => { if (Math.abs(event.deltaY) > 4) changeForDirection(event.deltaY > 0); };
        const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
        const onTouchMove = (event: TouchEvent) => { const y = event.touches[0]?.clientY ?? touchY; if (Math.abs(y - touchY) > 10) { changeForDirection(y < touchY); touchY = y; } };
        const onScroll = () => { if (window.scrollY < 72) setTabsCollapsed(false); };
        const onOrientation = () => { if (!portrait.matches) setTabsCollapsed(false); };
        window.addEventListener('wheel', onWheel, { passive: true });
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        portrait.addEventListener('change', onOrientation);
        return () => { window.removeEventListener('wheel', onWheel); window.removeEventListener('touchstart', onTouchStart); window.removeEventListener('touchmove', onTouchMove); window.removeEventListener('scroll', onScroll); portrait.removeEventListener('change', onOrientation); };
    }, [filtersOpen]);
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPortraitMenuOpen(false); };
        const onChapter = (event: MouseEvent) => { if ((event.target as HTMLElement).closest('.genreDirectory button,.basketDirectory button')) setPortraitMenuOpen(false); };
        window.addEventListener('keydown', onKey);
        document.addEventListener('click', onChapter);
        return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', onChapter); };
    }, []);
    useEffect(() => {
        if(!window.matchMedia('(orientation: portrait)').matches)return;
        const host=document.getElementById('portrait-menu-layer');
        if(!host)return;
        const moved=[...document.querySelectorAll<HTMLElement>('.pageSurface .tagTools:not(.basketTools),.pageSurface .viewSwitch,.pageSurface .timelineTools,.pageSurface .axes,.pageSurface .sorter,.pageSurface .genreDirectory,.pageSurface .basketDirectory,.pageSurface .basketTools')].map(node=>{
            const marker=document.createComment('menu-control');
            node.parentNode?.insertBefore(marker,node);
            host.appendChild(node);
            return{node,marker};
        });
        const restore=()=>moved.forEach(({node,marker})=>{if(marker.parentNode)marker.parentNode.insertBefore(node,marker);marker.remove();});
        restoreMenuControls.current=restore;
        return()=>{restore();if(restoreMenuControls.current===restore)restoreMenuControls.current=null;};
    },[tab]);
    const chooseTab = (n: number) => { if (n === 8) { window.location.assign('/relations'); return; } restoreMenuControls.current?.(); restoreMenuControls.current=null; startTransition(() => setTab(n)); setTabsCollapsed(false); setPortraitMenuOpen(false); window.scrollTo({top: 0}); localStorage.setItem('chroma-tab', String(n)); };
    const handlePageClick = (event: React.MouseEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('.genreDirectory button,.basketDirectory button')) setPortraitMenuOpen(false);
    };
    const genres = useMemo(() => count(all.flatMap(a => [...new Set(a.genres)])), [all]);
    const tags = useMemo(() => count(all.flatMap(a => [...new Set(a.descriptors)])), [all]);
    const data = useMemo(() => all.filter(a => match(a.genres, gs, gm) && match(a.descriptors, ts, tm) && (!q || `${a.title} ${a.artist}`.toLowerCase().includes(q.toLowerCase()))), [all, gs, ts, gm, tm, q]);
    return <main className={portraitMenuOpen ? 'portraitMenuOpen' : ''} onClick={handlePageClick} onPointerDown={recolorPaper}><AmbientBackground/><div className={`pageSurface ${ready ? 'ready' : 'loading'}`}><div className={'topChrome ' + (tabsCollapsed ? 'tabsCollapsed' : '')}><header><b>◉ CHROMA <small>MUSIC DATA ATLAS</small></b><nav>{tabs.map((x, i) => <button className={tab === i ? 'active' : ''} onClick={() => chooseTab(i)} key={x}>{String(i).padStart(2, '0')} <b>{x}</b></button>)}</nav><span>{data.length} / {all.length} ALBUMS</span><button className="filterButton" onClick={() => setFiltersOpen(!filtersOpen)}>筛选 · {gs.length + ts.length} {filtersOpen ? '−' : '＋'}</button></header>
    <aside className={'filters ' + (filtersOpen ? 'open' : '')}><div><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索专辑 / 艺术家"/><button onClick={() => setQ('')}>清空搜索</button></div><Group title="流派" list={genres} sel={gs} set={setGs} mode={gm} setMode={setGm}/><Group title="标签" list={tags} sel={ts} set={setTs} mode={tm} setMode={setTm}/></aside></div>
    <section className={tab === 0 ? 'overviewSection' : tab >= 3 && tab <= 5 ? 'chartSection' : undefined}><Title n={tab} title={tabs[tab]}/>{tab === 0 && <Home data={data} go={chooseTab} open={setFocus}/>} {tab === 1 && <Genres data={data} list={genres} sel={gs} set={setGs} mode={gm} setMode={setGm} open={setFocus} sorts={sorts} setSorts={setSorts}/>} {tab === 2 && <Tags data={data} list={tags} sel={ts} set={setTs} mode={tm} setMode={setTm} open={setFocus} sorts={sorts} setSorts={setSorts}/>} {tab === 3 && <ScatterOverview data={data} open={setFocus}/>} {tab === 4 && <Timeline data={data} genres={genres} tags={tags} open={setFocus}/>} {tab === 5 && <Visual data={data} open={setFocus}/>} {tab === 6 && <BasketView data={data} open={setFocus} sorts={sorts} setSorts={setSorts}/>} {tab === 7 && <Grid data={data} open={setFocus} sorts={sorts} setSorts={setSorts}/>}</section></div>
    <div id="portrait-menu-layer" className="portraitMenuLayer"/>
    {tab > 0 && <button className="portraitMenuButton" aria-label={portraitMenuOpen ? '关闭页面菜单' : '打开页面菜单'} aria-expanded={portraitMenuOpen} onClick={() => setPortraitMenuOpen(open => !open)}><i/><i/><i/></button>}
    {focus && <Detail a={focus} close={() => setFocus(null)}/>}</main>;
}
function Title({ n, title }: {
    n: number;
    title: string;
}) { return <div className="title"><small>0{n} / DATA VIEW</small><h1>{title}</h1><p>当前结果与顶部全局筛选实时联动，点击封面可查看专辑详情。</p></div>; }
function Group({ title, list, sel, set, mode, setMode }: {
    title: string;
    list: [
        string,
        number
    ][];
    sel: string[];
    set: (x: string[]) => void;
    mode: Mode;
    setMode: (x: Mode) => void;
}) { return <fieldset><legend><b>{title}</b><span>{sel.length ? `已选 ${sel.length}` : '全部'}</span><i><button className={mode === 'any' ? 'active' : ''} onClick={() => setMode('any')}>并集</button><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>交集</button></i><button onClick={() => set([])}>清空{title}</button></legend><div>{list.map(([x, n]) => <button className={sel.includes(x) ? 'active' : ''} onClick={() => set(sel.includes(x) ? sel.filter(v => v !== x) : [...sel, x])} key={x}>{x}<sup>{n}</sup></button>)}</div></fieldset>; }
function Home({ data, go, open }: {
    data: Album[];
    go: (n: number) => void;
    open: (a: Album) => void;
}) {
    const [draw,setDraw]=useState(0), [coverLayout,setCoverLayout]=useState({columns:9,size:0});
    const coverGrid=useRef<HTMLDivElement>(null);
    const sample = useMemo(() => [...data].sort((a,b)=>hash01(a.id,draw+101)-hash01(b.id,draw+101)), [data,draw]);
    useEffect(()=>{
        const grid=coverGrid.current;
        if(!grid)return;
        const orientation=window.matchMedia('(orientation: landscape)');
        const measure=()=>{
            if(!orientation.matches){setCoverLayout(current=>current.size?{columns:9,size:0}:current);return;}
            const style=getComputedStyle(grid), gap=parseFloat(style.rowGap)||4, rows=8;
            const size=Math.max(1,(grid.clientHeight-gap*(rows-1)-2)/rows);
            const columns=Math.max(1,Math.floor((grid.clientWidth+gap)/(size+gap)));
            setCoverLayout(current=>current.columns===columns&&Math.abs(current.size-size)<.1?current:{columns,size});
        };
        const observer=new ResizeObserver(measure);
        observer.observe(grid);
        orientation.addEventListener('change',measure);
        return()=>{observer.disconnect();orientation.removeEventListener('change',measure);};
    },[]);
    const landscapeGridStyle = coverLayout.size ? {
        '--cover-size':`${coverLayout.size}px`,
        '--cover-columns':coverLayout.columns
    } as React.CSSProperties : undefined;
    return <div className="home"><article><b>{data.length}</b><span>张专辑等待探索 · 点击封面查看详情</span><button className="redraw" onClick={()=>setDraw(n=>n+1)}>↻ 重抽</button><div ref={coverGrid} style={landscapeGridStyle}>{sample.slice(0,coverLayout.size?coverLayout.columns*8:undefined).map(a => <button key={a.id} onClick={() => open(a)} aria-label={`查看 ${a.title}`}><img src={a.cover} alt=""/></button>)}</div></article>{[1, 2, 3, 4, 5, 6, 7, 8].map(i => <button key={i} onClick={() => go(i)} style={{ '--card-tint': colors[i % colors.length] } as React.CSSProperties}><b>0{i}</b><h2>{tabs[i]}</h2><span>{i === 8 ? '全屏打开 →' : '进入视图 →'}</span></button>)}</div>;
}
function cloudStyle(key: string) { let n = 2166136261; for (const c of key)
    n = Math.imul(n ^ c.charCodeAt(0), 16777619); const r = (shift: number) => ((n >>> shift) & 255) / 255; return { fontSize: `${12 + r(0) * 5}px`, transform: `rotate(${(-2.8 + r(8) * 5.6).toFixed(1)}deg)`, '--choice-color': choiceColors[(n >>> 16) % choiceColors.length] } as React.CSSProperties; }
function ChoiceCloud({ list, sel, set, limit = 120 }: {
    list: [
        string,
        number
    ][];
    sel: string[];
    set: (x: string[]) => void;
    limit?: number;
}) { return <div className="choiceCloud">{list.slice(0, limit).map(([x, n]) => <button style={cloudStyle(x)} className={sel.includes(x) ? 'active' : ''} onClick={() => set(sel.includes(x) ? sel.filter(v => v !== x) : [...sel, x])} key={x}>{x}<sup>{n}</sup></button>)}</div>; }
function Genres({ data, list, sel, set, mode, setMode, open, sorts, setSorts }: {
    data: Album[];
    list: [
        string,
        number
    ][];
    sel: string[];
    set: (x: string[]) => void;
    mode: Mode;
    setMode: (x: Mode) => void;
    open: (a: Album) => void;
    sorts: SortKey[];
    setSorts: (sorts: SortKey[]) => void;
}) { const [optionsExpanded, setOptionsExpanded] = useState(false), [gridExpanded, setGridExpanded] = useState(false), [active,setActive]=useState(0), sections=[['genre-options','流派选项'],['genre-baskets','流派篮子'],['genre-results','筛选结果']], baskets=list.map(([g])=>({genre:g,albums:data.filter(a=>a.genres.includes(g))})).filter(b=>b.albums.length), toggleGenre=(g:string)=>set(sel.includes(g)?sel.filter(x=>x!==g):[...sel,g]), jump=(id:string,i:number)=>{setActive(i);document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}; return <div className="genrePage"><nav className="genreDirectory" aria-label="流派星系章节">{sections.map(([id,label],i)=><button className={active===i?'active':''} onClick={()=>jump(id,i)} key={id}>{label}</button>)}</nav><div className="tagTools paperRail"><button className={mode === 'any' ? 'active' : ''} onClick={() => setMode('any')}>并集</button><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>交集</button><button onClick={() => set([])}>清空流派</button></div><div id="genre-options" className="expandStage"><ChoiceCloud list={list} sel={sel} set={set} limit={optionsExpanded ? list.length : 72}/><button className={`expandButton ${optionsExpanded ? 'expanded' : ''}`} onClick={() => setOptionsExpanded(!optionsExpanded)}>{optionsExpanded ? '收起选项 ↑' : '展开全部流派 ↓'}</button></div><div id="genre-baskets" className="basketStage"><div className="genreGrid">{baskets.slice(0, gridExpanded ? baskets.length : 48).map(({genre:g,albums}, i) => { const selected=sel.includes(g); return <article key={g} role="button" tabIndex={0} aria-pressed={selected} className={selected?'active':''} onClick={()=>toggleGenre(g)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleGenre(g)}}} style={{ '--basket-tint': colors[i % colors.length] } as React.CSSProperties}><h2>{g}</h2><span>{albums.length} 张</span><div>{albums.slice(0, 24).map(a => <button onClick={e => {e.stopPropagation();open(a)}} key={a.id}><img src={a.cover} alt=""/></button>)}</div></article>})}</div><button className={`expandButton gridToggle ${gridExpanded ? 'expanded' : ''}`} onClick={() => setGridExpanded(!gridExpanded)}>{gridExpanded ? '折叠流派篮子 ↑' : `展开全部流派篮子 · ${baskets.length} ↓`}</button></div><div id="genre-results"><ResultGrid data={data} open={open} sorts={sorts} setSorts={setSorts}/></div></div>; }
function Tags({ data, list, sel, set, mode, setMode, open, sorts, setSorts }: {
    data: Album[];
    list: [
        string,
        number
    ][];
    sel: string[];
    set: (x: string[]) => void;
    mode: Mode;
    setMode: (x: Mode) => void;
    open: (a: Album) => void;
    sorts: SortKey[];
    setSorts: (sorts: SortKey[]) => void;
}) { const shown = data.filter(a => match(a.descriptors, sel, mode)), [expanded, setExpanded] = useState(false), [active,setActive]=useState(0), sections=[['tag-options','标签选项'],['tag-results','筛选结果'],['tag-matrix','年代矩阵']], jump=(id:string,i:number)=>{setActive(i);document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}; return <div className="tagPage"><nav className="genreDirectory" aria-label="标签语义章节">{sections.map(([id,label],i)=><button className={active===i?'active':''} onClick={()=>jump(id,i)} key={id}>{label}</button>)}</nav><div className="tagTools paperRail"><button className={mode === 'any' ? 'active' : ''} onClick={() => setMode('any')}>并集</button><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>交集</button><button onClick={() => set([])}>清空标签</button></div><div id="tag-options" className="expandStage"><ChoiceCloud list={list} sel={sel} set={set} limit={expanded ? list.length : 72}/><button className={`expandButton ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(!expanded)}>{expanded ? '收起标签 ↑' : `展开全部标签 · ${list.length} ↓`}</button></div><div id="tag-results"><ResultGrid data={shown} open={open} sorts={sorts} setSorts={setSorts}/></div><div id="tag-matrix"><TagMatrix data={data} list={list}/></div></div>; }
function ResultGrid({ data, open, sorts, setSorts }: {
    data: Album[];
    open: (a: Album) => void;
    sorts: SortKey[];
    setSorts: (sorts: SortKey[]) => void;
}) { return <div className="resultBlock"><h2>筛选结果 · {data.length} 张</h2><Grid data={data} open={open} sorts={sorts} setSorts={setSorts}/></div>; }
function TagMatrix({ data, list }: {
    data: Album[];
    list: [
        string,
        number
    ][];
}) { const years = data.flatMap(a => a.year ? [a.year] : []), start = Math.floor(Math.min(...years) / 5) * 5, end = Math.floor(Math.max(...years) / 5) * 5, periods = [] as number[]; for (let y = start; y <= end; y += 5)
    if (data.some(a => a.year && a.year >= y && a.year < y + 5))
        periods.push(y); return <div className="matrix" style={{ gridTemplateColumns: `150px repeat(${periods.length},minmax(58px,1fr))` }}><i />{periods.map(y => <b key={y}>{y}–{y + 4}</b>)}{list.slice(0, 16).map(([t]) => <div key={t}><span>{t}</span>{periods.map(y => { const n = data.filter(a => a.descriptors.includes(t) && a.year && a.year >= y && a.year < y + 5).length; return <i key={y} style={{ opacity: .12 + Math.min(.88, n / 5) }}>{n || ''}</i>; })}</div>)}</div>; }
function Ticks({ axis, values, format = (n: number) => String(n) }: {
    axis: 'x' | 'y';
    values: number[];
    format?: (n: number) => string;
}) { return <div className={'ticks ticks-' + axis}>{values.map((v, i) => <span key={i} style={axis === 'x' ? { left: `${i / (values.length - 1) * 100}%` } : { bottom: `${i / (values.length - 1) * 100}%` }}>{format(v)}</span>)}</div>; }
function ScatterOverview({ data, open }: { data: Album[]; open: (a: Album) => void; }) {
    const [view, setView] = useState<'duration' | 'ratings'>('duration');
    const extent=(xs:number[])=>xs.length?[Math.min(...xs),Math.max(...xs)]:[0,1], norm=(n:number,[lo,hi]:number[])=>hi===lo?50:3+(n-lo)/(hi-lo)*94, tickValues=([lo,hi]:number[])=>Array.from({length:6},(_,i)=>lo+(hi-lo)*i/5);
    const duration=data.filter(a=>a.avgTrackSeconds&&a.trackCount>0), ratings=data.filter(a=>a.userRating&&a.communityRating);
    const dx=extent(duration.map(a=>Math.log10(a.avgTrackSeconds!))),dy=extent(duration.map(a=>Math.log10(a.trackCount+1))),rx=extent(ratings.map(a=>a.communityRating!)),ry=extent(ratings.map(a=>a.userRating!));
    return <><div className="viewSwitch"><button className={view === 'duration' ? 'active' : ''} onClick={() => setView('duration')}>时长地形</button><button className={view === 'ratings' ? 'active' : ''} onClick={() => setView('ratings')}>评分关系</button></div><div className="plot chartPlot animatedPlot"><span className="axisY">{view==='duration'?'曲目数量 →':'个人评分 →'}</span><span className="axisX">{view==='duration'?'平均单曲时长 →':'RYM 社区评分 →'}</span>{view==='duration'?<><Ticks axis="x" values={tickValues(dx)} format={n=>{const seconds=Math.pow(10,n);return seconds<60?`${Math.round(seconds)}秒`:`${Math.round(seconds/60)}分`}}/><Ticks axis="y" values={tickValues(dy)} format={n=>String(Math.max(0,Math.round(Math.pow(10,n)-1)))}/></>:<><Ticks axis="x" values={tickValues(rx)} format={n=>n.toFixed(1)}/><Ticks axis="y" values={tickValues(ry)} format={n=>n.toFixed(1)}/></>}{data.map(a=>{const valid=view==='duration'?Boolean(a.avgTrackSeconds&&a.trackCount>0):Boolean(a.userRating&&a.communityRating),left=view==='duration'&&a.avgTrackSeconds?norm(Math.log10(a.avgTrackSeconds),dx):a.communityRating?norm(a.communityRating,rx):50,bottom=view==='duration'&&a.trackCount?norm(Math.log10(a.trackCount+1),dy):a.userRating?norm(a.userRating,ry):50;return <button className={valid?'':'plotHidden'} title={a.title} onClick={()=>open(a)} key={a.id} style={{left:`${left}%`,bottom:`${bottom}%`}}><img src={a.cover} alt=""/></button>})}</div><p className="chartNote">两种视图均先归一到 3–97% 的统一画布坐标；切换时同一专辑保持同一 DOM 节点并平滑迁移。</p></>;
}
function Duration({ data, open }: {
    data: Album[];
    open: (a: Album) => void;
}) { const d = data.filter(a => a.avgTrackSeconds && a.trackCount > 0), xs = d.map(a => a.avgTrackSeconds || 0), xmin = Math.min(...xs), xmax = Math.max(...xs), lxmin = Math.log10(xmin), lxmax = Math.log10(xmax), tracks = d.map(a => a.trackCount), ymin = Math.min(...tracks), ymax = Math.max(...tracks), lymin = Math.log10(ymin + 1), lymax = Math.log10(ymax + 1), xpos = (n: number) => (Math.log10(n) - lxmin) / Math.max(.001, lxmax - lxmin) * 94 + 3, ypos = (n: number) => (Math.log10(n + 1) - lymin) / Math.max(.001, lymax - lymin) * 94 + 3, xt = [30, 60, 120, 180, 300, 600, 1200, 1800, 3600].filter(n => n >= xmin && n <= xmax), yt = [1, 2, 5, 10, 20, 50, 100, 200, 500].filter(n => n >= ymin && n <= ymax); return <div className="plot chartPlot"><span className="axisY">曲目数量 →<small>对数位置，刻度仍为实际曲目数</small></span><span className="axisX">平均单曲时长 →<small>对数位置，刻度为实际时长</small></span><div className="logTicks logTicksX">{xt.map(n => <span key={n} style={{ left: `${(Math.log10(n) - lxmin) / Math.max(.001, lxmax - lxmin) * 100}%` }}>{n < 60 ? `${n}秒` : `${Math.round(n / 60)}分`}</span>)}</div><div className="logTicks">{yt.map(n => <span key={n} style={{ bottom: `${(Math.log10(n + 1) - lymin) / Math.max(.001, lymax - lymin) * 100}%` }}>{n}</span>)}</div>{d.map(a => <button title={`${a.title} · ${a.trackCount} 首`} onClick={() => open(a)} key={a.id} style={{ left: `${xpos(a.avgTrackSeconds || 0)}%`, bottom: `${ypos(a.trackCount)}%` }}><img src={a.cover} alt=""/></button>)}</div>; }
function Ratings({ data, open }: {
    data: Album[];
    open: (a: Album) => void;
}) { const d = data.filter(a => a.userRating && a.communityRating), xs = d.map(a => a.communityRating!), ys = d.map(a => a.userRating!), xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys), ticks = (a: number, b: number) => Array.from({ length: 6 }, (_, i) => a + (b - a) * i / 5); return <div className="plot chartPlot"><span className="axisY">个人评分 →</span><span className="axisX">RYM 社区评分 →</span><Ticks axis="x" values={ticks(xmin, xmax)} format={n => n.toFixed(1)}/><Ticks axis="y" values={ticks(ymin, ymax)} format={n => n.toFixed(1)}/>{d.map(a => <button title={`${a.title} · 个人 ${a.userRating} / RYM ${a.communityRating}`} onClick={() => open(a)} key={a.id} style={{ left: `${(a.communityRating! - xmin) / (xmax - xmin) * 94 + 3}%`, bottom: `${(a.userRating! - ymin) / (ymax - ymin) * 94 + 3}%` }}><img src={a.cover} alt=""/></button>)}</div>; }
function greedyCover(data: Album[], options: [
    string,
    number
][], type: 'genres' | 'tags') { const uncovered = new Set(data.map(a => a.id)), out: string[] = []; while (uncovered.size && out.length < 7) {
    let best = '', gain = 0;
    for (const [key] of options) {
        if (out.includes(key))
            continue;
        const n = data.filter(a => uncovered.has(a.id) && (type === 'genres' ? a.genres : a.descriptors).includes(key)).length;
        if (n > gain) {
            gain = n;
            best = key;
        }
    }
    if (!best || !gain)
        break;
    out.push(best);
    data.forEach(a => { if ((type === 'genres' ? a.genres : a.descriptors).includes(best))
        uncovered.delete(a.id); });
} return out; }
function Timeline({ data, genres, tags, open }: {
    data: Album[];
    genres: [
        string,
        number
    ][];
    tags: [
        string,
        number
    ][];
    open: (a: Album) => void;
}) { const [type, setType] = useState<'genres' | 'tags'>('genres'), [keys, setKeys] = useState<string[] | null>(null), [more, setMore] = useState(false), options = type === 'genres' ? genres : tags, defaults = useMemo(() => greedyCover(data, options, type), [data, options, type]), shownKeys=keys??defaults, changeType=(next:'genres'|'tags')=>{setType(next);setKeys(null)}; return <><div className="timelineNote"><b>逐年 · 对数厚度河流图</b><span>每年一组；纵轴以 log(1 + 数量) 展开窄色带，悬停可查看该年对应类别的专辑。</span></div><div className="timelineTools"><button className={type === 'genres' ? 'active' : ''} onClick={() => changeType('genres')}>按流派</button><button className={type === 'tags' ? 'active' : ''} onClick={() => changeType('tags')}>按标签</button>{options.slice(0, more ? options.length : 24).map(([x]) => <button className={shownKeys.includes(x) ? 'picked' : ''} onClick={() => setKeys(s => {const current=s??defaults; return current.includes(x) ? current.filter(v => v !== x) : current.length < 7 ? [...current, x] : [...current.slice(0,6),x]})} key={x}>{x}</button>)}<button onClick={() => setMore(!more)}>{more ? '收起' : '更多类别 ＋'}</button></div><StreamArea data={data} keys={shownKeys} type={type} open={open}/></>; }
function smoothPath(points: [number, number][], move = 'M') {
    if (!points.length) return '';
    if (points.length < 3) return `${move}${points.map(p => p.join(',')).join(' L')}`;
    let d = `${move}${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
        d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
    }
    return d;
}
function StreamArea({ data, keys, type, open }: {
    data: Album[];
    keys: string[];
    type: 'genres' | 'tags';
    open: (a: Album) => void;
}) { const [tip, setTip] = useState<{year:number;key:string;albums:Album[];x:number;y:number}|null>(null), years = data.flatMap(a => a.year ? [a.year] : []); if (!years.length || !keys.length)
    return <div className="area stream emptyStream">暂无可绘制的年代数据</div>; const start = Math.min(...years), end = Math.max(...years), periods = Array.from({length:end-start+1},(_,i)=>start+i), series = periods.map(year => { const albums = data.filter(a => a.year === year); return {albums, values:keys.map(key => albums.filter(a => (type === 'genres' ? a.genres : a.descriptors).includes(key)).length)}; }), transformed = series.map(s => s.values.map(n => Math.log1p(n))), max = Math.max(1, ...transformed.map(v => v.reduce((sum,n)=>sum+n,0))), width = 1000, height = 620, xAt = (i: number) => 35 + i * (width - 60) / Math.max(1, periods.length - 1), yAt = (values: number[], keyIndex: number, top: boolean) => { const total = values.reduce((sum, n) => sum + n, 0), before = values.slice(0, keyIndex + (top ? 1 : 0)).reduce((sum, n) => sum + n, 0); return height / 2 + (total / 2 - before) * ((height - 55) / max); }, pathFor = (keyIndex: number) => { const upper = transformed.map((values, i) => [xAt(i), yAt(values, keyIndex, true)] as [number,number]), lower = [...transformed].reverse().map((values, reverseIndex) => { const i = transformed.length - 1 - reverseIndex; return [xAt(i), yAt(values, keyIndex, false)] as [number,number]; }); return `${smoothPath(upper)} ${smoothPath(lower, 'L')} Z`; }, labelYears=periods.filter((_,i)=>i%Math.max(1,Math.ceil(periods.length/12))===0); return <div className="area stream" onMouseLeave={()=>setTip(null)} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect(), px=(e.clientX-r.left)/r.width*width, py=(e.clientY-r.top)/r.height*height, si=Math.max(0,Math.min(periods.length-1,Math.round((px-35)/(width-60)*(periods.length-1)))), values=transformed[si]; let ki=0; for(;ki<keys.length;ki++) if(py>=yAt(values,ki,true)&&py<=yAt(values,ki,false)) break; if(ki>=keys.length){setTip(null);return;} const key=keys[ki], albums=series[si].albums.filter(a=>(type==='genres'?a.genres:a.descriptors).includes(key)); setTip({year:periods[si],key,albums,x:e.clientX-r.left,y:e.clientY-r.top});}}><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="年代演化河流图">{keys.map((key, i) => <path key={key} d={pathFor(i)} fill={colors[i] + 'e6'}/>)}</svg><div className="streamYears">{labelYears.map(year=><span key={year} style={{left:`${(year-start)/Math.max(1,end-start)*100}%`}}>{year}</span>)}</div><span className="rawScale">对数纵轴 · 峰值 {Math.max(...series.map(s=>s.values.reduce((a,b)=>a+b,0)))} 张</span>{tip&&<aside style={{left:Math.min(tip.x,innerWidth-290),top:Math.max(45,tip.y-45)}}><b>{tip.year} · {tip.key}</b><span>{tip.albums.length} 张专辑</span><div>{tip.albums.slice(0,10).map(a=><button onClick={()=>open(a)} key={a.id}><img src={a.cover} alt=""/></button>)}</div></aside>}</div>; }
function StreamAreaLegacy({ data, keys, type, open }: {
    data: Album[];
    keys: string[];
    type: 'genres' | 'tags';
    open: (a: Album) => void;
}) { const ref = useRef<HTMLCanvasElement>(null), years = data.flatMap(a => a.year ? [a.year] : []), start = Math.floor(Math.min(...years) / 5) * 5, end = Math.floor(Math.max(...years) / 5) * 5, periods = [] as number[]; for (let y = start; y <= end; y += 5)
    if (data.some(a => a.year && a.year >= y && a.year < y + 5))
        periods.push(y); const series = periods.map(y => { const a = data.filter(x => x.year && x.year >= y && x.year < y + 5); return { y, a, v: keys.map(k => a.filter(x => (type === 'genres' ? x.genres : x.descriptors).includes(k)).length) }; }), max = Math.max(1, ...series.map(s => s.v.reduce((a, b) => a + b, 0))); useEffect(() => { const c = ref.current; if (!c || !periods.length)
    return; const w = c.clientWidth, h = c.clientHeight, z = devicePixelRatio; c.width = w * z; c.height = h * z; const x = c.getContext('2d')!; x.scale(z, z); x.clearRect(0, 0, w, h); keys.forEach((_, ki) => { x.beginPath(); series.forEach((s, i) => { const total = s.v.reduce((a, b) => a + b, 0), before = s.v.slice(0, ki).reduce((a, b) => a + b, 0), px = 45 + i * (w - 70) / Math.max(1, series.length - 1), py = h / 2 + (total / 2 - before - s.v[ki]) * ((h - 80) / max); i ? x.lineTo(px, py) : x.moveTo(px, py); }); [...series].reverse().forEach((s, j) => { const i = series.length - 1 - j, total = s.v.reduce((a, b) => a + b, 0), before = s.v.slice(0, ki + 1).reduce((a, b) => a + b, 0), px = 45 + i * (w - 70) / Math.max(1, series.length - 1), py = h / 2 + (total / 2 - before) * ((h - 80) / max); x.lineTo(px, py); }); x.closePath(); x.fillStyle = colors[ki] + 'd9'; x.fill(); }); x.fillStyle = '#333'; x.font = '10px Arial'; periods.forEach((y, i) => x.fillText(String(y), 28 + i * (w - 70) / Math.max(1, periods.length - 1), h - 12)); }, [data, keys, type]); return <div className="area stream"><canvas ref={ref}/><span className="rawScale">峰值叠加数量 {max}</span></div>; }
function Visual({ data, open }: {
    data: Album[];
    open: (a: Album) => void;
}) {
    const [x, setX] = useState<Metric>('hue'), [y, setY] = useState<Metric>('detail'), [axesOpen, setAxesOpen] = useState(false);
    const spreadMetrics = new Set<Metric>(['hue', 'entropy', 'detail', 'symmetry']);
    const ordered = useMemo(() => new Map(metrics.map(m => {
        const albums = [...data].sort((a, b) => value(a, m) - value(b, m));
        const ranks = new Map<string, number>();
        if (m === 'hue') {
            albums.forEach((album, index) => ranks.set(album.id, index));
            return [m, {albums, ranks}] as const;
        }
        for (let start = 0; start < albums.length;) {
            let end = start + 1;
            while (end < albums.length && value(albums[end], m) === value(albums[start], m)) end++;
            const rank = (start + end - 1) / 2;
            for (let i = start; i < end; i++) ranks.set(albums[i].id, rank);
            start = end;
        }
        return [m, { albums, ranks }] as const;
    })), [data]);
    const extent = (m: Metric) => {
        if (m === 'hue') return [0, 360];
        if (!data.length) return [0, 100];
        return [Math.min(...data.map(a => value(a, m))), Math.max(...data.map(a => value(a, m)))];
    };
    const ticks = (m: Metric) => {
        if (spreadMetrics.has(m)) {
            const albums = ordered.get(m)?.albums || [];
            if (!albums.length) return m === 'hue' ? [0, 72, 144, 216, 288, 360] : [0, 20, 40, 60, 80, 100];
            return Array.from({length: 6}, (_, i) => value(albums[Math.min(albums.length - 1, Math.round(i * (albums.length - 1) / 5))], m));
        }
        const [lo, hi] = extent(m);
        return Array.from({length: 6}, (_, i) => lo + (hi - lo) * i / 5);
    };
    const pos = (a: Album, m: Metric) => {
        if (spreadMetrics.has(m)) {
            const rank = ordered.get(m)?.ranks.get(a.id) ?? 0;
            return rank / Math.max(1, data.length - 1) * 94 + 3;
        }
        const [lo, hi] = extent(m), v = value(a, m);
        return hi === lo ? 50 : (v - lo) / (hi - lo) * 94 + 3;
    };
    const format = (m: Metric, n: number) => m === 'hue' ? `${Math.round(n)}°` : n.toFixed(1);
    return <><div className={`axes ${axesOpen ? 'open' : 'collapsed'}`}><button className="axesToggle" aria-expanded={axesOpen} onClick={() => setAxesOpen(v => !v)}><b>坐标选项</b><span>{axesOpen ? '−' : '+'}</span></button><div><b>Y 纵轴</b>{metrics.map(m => <button className={y === m ? 'active' : ''} onClick={() => setY(m)} key={m}>{names[m]}</button>)}</div><button className="axesSwap" onClick={() => { const t = x; setX(y); setY(t); }}>⇄</button><div><b>X 横轴</b>{metrics.map(m => <button className={x === m ? 'active' : ''} onClick={() => setX(m)} key={m}>{names[m]}</button>)}</div></div><div className="plot covers chartPlot"><span className="axisY">{names[y]} →</span><span className="axisX">{names[x]} →</span><Ticks axis="x" values={ticks(x)} format={n => format(x, n)}/><Ticks axis="y" values={ticks(y)} format={n => format(y, n)}/>{data.map(a => <button title={`${a.title} · ${names[x]} ${format(x, value(a, x))} / ${names[y]} ${format(y, value(a, y))}`} onClick={() => open(a)} key={a.id} style={{left: `${pos(a, x)}%`, bottom: `${pos(a, y)}%`}}><img src={a.cover} alt=""/></button>)}</div></>;
}
type ClusterKey = Metric | 'year' | 'userRating' | 'communityRating' | 'ratingCount' | 'duration' | 'trackCount' | 'avgTrack' | 'rank' | 'genres' | 'descriptors' | 'artist' | 'language' | 'releaseType';
const clusterOptions: [ClusterKey,string,string][] = [
    ['year','发行年份','档案'],['userRating','个人评分','评分'],['communityRating','RYM 评分','评分'],['ratingCount','评分人数（对数）','评分'],['duration','总时长','结构'],['trackCount','曲目数','结构'],['avgTrack','平均曲长','结构'],['rank','最佳榜单排名（对数）','衍生'],
    ...metrics.map(m => [m,names[m],'封面视觉'] as [ClusterKey,string,string]),
    ['genres','流派集合','语义'],['descriptors','描述标签集合','语义'],['artist','艺术家','档案'],['language','语言','档案'],['releaseType','发行类型','档案']
];
const defaultCluster: ClusterKey[] = ['year','userRating','communityRating','ratingCount','duration','trackCount','brightness','contrast','saturation','detail','warmth','colorfulness','hue','genres','descriptors'];
function hash01(s:string, salt:number){let h=2166136261^salt;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return((h>>>0)%10007)/10007;}
function rawCluster(a:Album,k:ClusterKey){if((metrics as string[]).includes(k))return value(a,k as Metric);if(k==='year')return a.year||0;if(k==='userRating')return a.userRating||0;if(k==='communityRating')return a.communityRating||0;if(k==='ratingCount')return Math.log1p(a.ratingCount);if(k==='duration')return a.durationSeconds||0;if(k==='trackCount')return a.trackCount;if(k==='avgTrack')return a.avgTrackSeconds||0;if(k==='rank')return Math.log1p(Math.min(...a.ranks.map(r=>r.position),99999));const xs=k==='genres'?a.genres:k==='descriptors'?a.descriptors:[String((a as unknown as Record<string,unknown>)[k]||'未知')];return [0,1,2].map(s=>xs.length?xs.reduce((n,x)=>n+hash01(x,s),0)/xs.length:0);}
function Explore({data,open}:{data:Album[];open:(a:Album)=>void}){
    const [panel,setPanel]=useState<'walk'|'metrics'>('walk'),[mode,setMode]=useState<'2d'|'3d'>('2d'),[selected,setSelected]=useState<ClusterKey[]>(defaultCluster),[focus,setFocus]=useState<Album|null>(null),[rotation,setRotation]=useState(24);
    const sample=useMemo(()=>[...data].sort((a,b)=>b.ratingCount-a.ratingCount).filter((_,i)=>i<180||i%Math.max(1,Math.floor(data.length/90))===0).slice(0,240),[data]);
    const graph=useMemo(()=>{if(!sample.length)return{nodes:[] as {a:Album;x:number;y:number;z:number}[],edges:[] as [number,number][]};const stats=new Map<ClusterKey,[number,number]>();selected.forEach(k=>{const vs=sample.flatMap(a=>{const v=rawCluster(a,k);return Array.isArray(v)?[]:[v]});stats.set(k,[Math.min(...vs),Math.max(...vs)]);});const vectors=sample.map(a=>selected.flatMap(k=>{const v=rawCluster(a,k);if(Array.isArray(v))return v;const [lo,hi]=stats.get(k)!;return[(v-lo)/Math.max(.001,hi-lo)];}));const dist=(i:number,j:number)=>Math.sqrt(vectors[i].reduce((n,v,k)=>n+(v-vectors[j][k])**2,0)/Math.max(1,vectors[i].length));const edges:[number,number][]=[];vectors.forEach((_,i)=>{vectors.map((_,j)=>[j,i===j?Infinity:dist(i,j)] as [number,number]).sort((a,b)=>a[1]-b[1]).slice(0,3).forEach(([j])=>{if(i<j)edges.push([i,j]);});});const nodes=sample.map((a,i)=>{const v=vectors[i];return{a,x:v.reduce((n,x,k)=>n+(x-.5)*Math.sin(k*2.17+1),0)*70+(hash01(a.id,7)-.5)*20,y:v.reduce((n,x,k)=>n+(x-.5)*Math.cos(k*1.73+2),0)*70+(hash01(a.id,8)-.5)*20,z:v.reduce((n,x,k)=>n+(x-.5)*Math.sin(k*.91+4),0)*45};});for(let t=0;t<90;t++){const fx=nodes.map(()=>0),fy=nodes.map(()=>0);for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,d2=Math.max(80,dx*dx+dy*dy),f=32/d2;fx[i]-=dx*f;fy[i]-=dy*f;fx[j]+=dx*f;fy[j]+=dy*f;}edges.forEach(([i,j])=>{const dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,d=Math.max(1,Math.hypot(dx,dy)),f=(d-34)*.004;fx[i]+=dx/d*f;fy[i]+=dy/d*f;fx[j]-=dx/d*f;fy[j]-=dy/d*f;});nodes.forEach((n,i)=>{n.x=(n.x+fx[i])*.995;n.y=(n.y+fy[i])*.995;});}return{nodes,edges};},[sample,selected]);
    const projected=useMemo(()=>{const rad=rotation*Math.PI/180,pts=graph.nodes.map(n=>{const rx=n.x*Math.cos(rad)-n.z*Math.sin(rad),z=n.x*Math.sin(rad)+n.z*Math.cos(rad);return{...n,px:rx,py:n.y,z:mode==='3d'?z:0};}),xs=pts.map(n=>n.px),ys=pts.map(n=>n.py),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);return pts.map(n=>({...n,left:5+(n.px-loX)/Math.max(1,hiX-loX)*90,top:5+(n.py-loY)/Math.max(1,hiY-loY)*90}));},[graph,mode,rotation]);
    const toggle=(k:ClusterKey)=>setSelected(s=>s.includes(k)?(s.length>1?s.filter(x=>x!==k):s):[...s,k]);return <div className="explore"><div className="exploreTabs"><button className={panel==='walk'?'active':''} onClick={()=>setPanel('walk')}>关系漫游</button><button className={panel==='metrics'?'active':''} onClick={()=>setPanel('metrics')}>聚类指标 · {selected.length}</button></div>{panel==='metrics'?<div className="clusterConfig"><header><div><b>决定“相似”的属性</b><span>数值先标准化，类别集合按稳定哈希向量比较；改动后力图立即重算。</span></div><button onClick={()=>setSelected(defaultCluster)}>恢复推荐组合</button></header>{[...new Set(clusterOptions.map(x=>x[2]))].map(group=><section key={group}><h3>{group}</h3><div>{clusterOptions.filter(x=>x[2]===group).map(([k,n])=><button className={selected.includes(k)?'active':''} onClick={()=>toggle(k)} key={k}><i/>{n}</button>)}</div></section>)}</div>:<><div className="exploreBar"><div><button className={mode==='2d'?'active':''} onClick={()=>setMode('2d')}>二维</button><button className={mode==='3d'?'active':''} onClick={()=>setMode('3d')}>三维</button></div>{mode==='3d'&&<label>旋转视角 <input type="range" min="-70" max="70" value={rotation} onChange={e=>setRotation(+e.target.value)}/></label>}<span>{sample.length} 个节点 · 每张连接 3 个最近邻</span></div><div className={'forceWorld '+mode}><svg>{graph.edges.map(([i,j],k)=><line key={k} x1={`${projected[i]?.left}%`} y1={`${projected[i]?.top}%`} x2={`${projected[j]?.left}%`} y2={`${projected[j]?.top}%`}/>)}</svg>{projected.map(n=>{const active=focus?.id===n.a.id,scale=mode==='3d'?Math.max(.62,1+n.z/260):1;return <button className={active?'active':''} style={{left:`${n.left}%`,top:`${n.top}%`,transform:`translate(-50%,-50%) scale(${active?scale*1.45:scale})`,zIndex:Math.round(n.z+200),opacity:mode==='3d'?Math.max(.48,.78+n.z/240):1}} onClick={()=>setFocus(n.a)} onDoubleClick={()=>open(n.a)} key={n.a.id}><img src={n.a.cover} alt=""/><b>{n.a.title}</b></button>})}{focus&&<aside><button onClick={()=>setFocus(null)}>×</button><img src={focus.cover} alt=""/><small>{focus.year} · {focus.genres.slice(0,2).join(' / ')}</small><h2>{focus.title}</h2><h3>{focus.artist}</h3><p>{focus.descriptors.slice(0,6).join(' · ')}</p><button onClick={()=>open(focus)}>打开专辑档案 →</button></aside>}</div></>}</div>;
}
const visualBasketDefs: [
    string,
    string,
    (a: Album) => boolean
][] = [['多色碰撞', '#f4bd35', a => (a.visual.hueDiversity || 0) >= 3], ['红色主题', '#ef5548', a => hue(a) < 18 || hue(a) >= 342], ['橙黄主题', '#e9b72f', a => hue(a) >= 18 && hue(a) < 60], ['绿色主题', '#48b878', a => hue(a) >= 60 && hue(a) < 165], ['蓝色主题', '#4d7de0', a => hue(a) >= 165 && hue(a) < 255], ['紫粉主题', '#b868c7', a => hue(a) >= 255 && hue(a) < 342], ['高密度', '#7256b8', a => a.visual.detail >= 18], ['极简留白', '#dedbd0', a => a.visual.detail < 4 && a.visual.brightness > 55], ['感知低饱和', '#a8a69e', a => a.visual.saturation < 18], ['鲜明主色', '#fa725b', a => accent(a).s >= 62 && accent(a).weight >= .04], ['深色封面', '#282b35', a => a.visual.darkRatio > 55], ['明亮封面', '#f5d96b', a => a.visual.lightRatio > 30], ['高对称', '#65baa3', a => a.visual.symmetry > 82], ['强反差', '#ff765f', a=>a.visual.contrast>68], ['柔和低反差','#9cbad0',a=>a.visual.contrast<28], ['高视觉熵','#795bd0',a=>a.visual.entropy>72], ['暖色倾向','#e99b44',a=>a.visual.warmth>64], ['冷色倾向','#55a9dc',a=>a.visual.warmth<42], ['暗底亮点','#32445e',a=>a.visual.darkRatio>45&&(a.visual.lightRatio>12||accent(a).s>58)]];
const hasWords=(a:Album,words:string[])=>[...a.genres,...a.descriptors].some(x=>words.some(w=>x.toLowerCase().includes(w)));
const semanticBasketDefs: typeof visualBasketDefs=[['氛围与梦境','#9b86d7',a=>hasWords(a,['atmospheric','dream','ethereal','ambient'])],['躁动与侵略','#e75b4f',a=>hasWords(a,['aggressive','noisy','energetic','chaotic'])],['忧郁与内省','#6688b8',a=>hasWords(a,['melancholic','introspective','lonely','sad'])],['明亮与欢快','#f0c744',a=>hasWords(a,['uplifting','happy','playful','optimistic'])],['黑暗与不祥','#3f4354',a=>hasWords(a,['dark','ominous','nocturnal','cold'])],['实验与抽象','#6f55bd',a=>hasWords(a,['experimental','abstract','avant-garde','complex'])],['叙事与诗意','#d47ba5',a=>hasWords(a,['poetic','concept album','storytelling','literary'])],['灵性与冥想','#58aa91',a=>hasWords(a,['spiritual','meditative','hypnotic','ritualistic'])],['未来与机械','#4d9ec4',a=>hasWords(a,['futuristic','mechanical','sci-fi','cyberpunk'])],['复古与怀旧','#c58d59',a=>hasWords(a,['nostalgic','retro','vintage','sentimental'])],['迷幻感','#b16fcd',a=>hasWords(a,['psychedelic','surreal','trippy'])],['极繁主义','#ed7659',a=>hasWords(a,['maximalist','dense','wall of sound'])]];
const combinedBasketDefs: typeof visualBasketDefs=[['霓虹未来','#5c83ef',a=>accent(a).s>58&&hasWords(a,['futuristic','electronic','sci-fi','cyberpunk'])],['幽暗氛围','#455074',a=>a.visual.darkRatio>45&&hasWords(a,['atmospheric','dark','nocturnal','ominous'])],['明亮治愈','#e8c83e',a=>a.visual.brightness>58&&hasWords(a,['uplifting','happy','warm','summer'])],['极简冥想','#77b7a0',a=>a.visual.detail<8&&hasWords(a,['minimal','meditative','ambient','sparse'])],['多彩迷幻','#b16fcd',a=>(a.visual.hueDiversity||0)>=2&&hasWords(a,['psychedelic','surreal','trippy'])],['黑白内省','#71819b',a=>a.visual.saturation<24&&hasWords(a,['introspective','melancholic','lonely'])],['高密度实验','#7354bd',a=>a.visual.detail>17&&hasWords(a,['experimental','complex','avant-garde','chaotic'])],['暖色怀旧','#d98b51',a=>a.visual.warmth>62&&hasWords(a,['nostalgic','retro','sentimental'])],['冷峻机械','#4b9db5',a=>a.visual.warmth<42&&hasWords(a,['mechanical','industrial','cold'])],['强烈躁动','#e85749',a=>a.visual.contrast>62&&hasWords(a,['aggressive','energetic','noisy'])]];
function BasketView(props:{data:Album[];open:(a:Album)=>void;sorts:SortKey[];setSorts:(sorts:SortKey[])=>void}){const [active,setActive]=useState(0),jump=(i:number)=>{setActive(i);document.querySelectorAll<HTMLElement>('.basketPanel, .basketPage>h2')[i]?.scrollIntoView({behavior:'smooth',block:'start'})};return <div className="basketPage"><nav className="basketDirectory" aria-label="主题篮子章节">{['视觉篮子','语义篮子','综合篮子','网格目录'].map((label,i)=><button className={active===i?'active':''} onClick={()=>jump(i)} key={label}>{label}</button>)}</nav><Baskets {...props}/></div>}
function Baskets({ data, open, sorts, setSorts }: {
    data: Album[];
    open: (a: Album) => void;
    sorts: SortKey[];
    setSorts: (sorts: SortKey[]) => void;
}) { const [s, setS] = useState<string[]>([]), [m, setM] = useState<Mode>('all'), allDefs=[...visualBasketDefs,...semanticBasketDefs,...combinedBasketDefs], active = allDefs.filter(x => s.includes(x[0])), result = data.filter(a => !s.length || (m === 'all' ? active.every(x => x[2](a)) : active.some(x => x[2](a)))), toggle = (n: string) => setS(s.includes(n) ? s.filter(x => x !== n) : [...s, n]); const panel=(title:string,note:string,defs:typeof visualBasketDefs)=><section className="basketPanel"><header><h2>{title}</h2><p>{note}</p></header><div className="baskets">{defs.map(d=>[...d,data.filter(d[2]).length] as const).sort((a,b)=>b[3]-a[3]).map(([n,bg,f,total],i) => { const a = data.filter(f), selected = s.includes(n); return <article role="button" tabIndex={0} aria-pressed={selected} aria-label={`${n} · ${total} 张专辑`} style={{ '--basket-tint': bg } as React.CSSProperties} className={selected ? 'active' : ''} onClick={() => toggle(n)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(n); } }} key={n}><header><small>{String(i + 1).padStart(2, '0')}</small><b>{n}</b><span>{total}<em>张专辑</em></span></header><div>{a.slice(0, 48).map(x => <button className="basketAlbum" key={x.id} onClick={e => { e.stopPropagation(); open(x); }} aria-label={`查看 ${x.title}`}><img src={x.cover} alt=""/></button>)}</div></article>; })}</div></section>; return <><div className="tagTools basketTools"><button className={m === 'all' ? 'active' : ''} onClick={() => setM('all')}>交集 · 全部满足</button><button className={m === 'any' ? 'active' : ''} onClick={() => setM('any')}>并集 · 满足任一</button><button onClick={() => setS([])}>清空已选</button><span>三组篮子共用 · 已选 {s.length}</span></div>{panel('01 · 视觉显著类型','由色相、明暗、饱和度、纹理密度、视觉熵、冷暖与对称性直接提取。',visualBasketDefs)}{panel('02 · 流派 / 标签语义','从流派与描述词中归并情绪、叙事、时代感和审美倾向。',semanticBasketDefs)}{panel('03 · 视觉 × 语义','将封面信号与音乐语义交叉，形成更具体的复合主题。',combinedBasketDefs)}<h2>组合结果 · {result.length} 张</h2><Grid data={result} open={open} sorts={sorts} setSorts={setSorts}/></>; }
function Grid({ data, open, sorts, setSorts }: {
    data: Album[];
    open: (a: Album) => void;
    sorts: SortKey[];
    setSorts: (sorts: SortKey[]) => void;
}) { const opts: [
    SortKey,
    string
][] = [['year', '年份'], ['userRating', '个人评分'], ['communityRating', 'RYM 评分'], ['ratingCount', '评分人数'], ['title', '标题'], ['hue', '主题色相']]; const sorted = useMemo(() => [...data].sort((a, b) => { for (const k of sorts) {
    const av = k === 'hue' ? hue(a) : a[k] ?? '', bv = k === 'hue' ? hue(b) : b[k] ?? '', d = typeof av === 'string' ? String(av).localeCompare(String(bv)) : Number(bv) - Number(av);
    if (d)
        return d;
} return 0; }), [data, sorts]), [sortOpen,setSortOpen]=useState(true); return <><div className={`sorter ${sortOpen?'open':'collapsed'}`}><button className="sorterToggle" aria-expanded={sortOpen} onClick={()=>setSortOpen(v=>!v)}><b>排序优先级</b><span aria-hidden="true">{sortOpen?'−':'＋'}</span></button><div className="sorterOptions">{opts.map(([k, n]) => <button className={sorts.includes(k) ? 'active' : ''} onClick={() => setSorts(sorts.includes(k) ? sorts.filter(x => x !== k) : [...sorts, k])} key={k}>{sorts.includes(k) ? `${sorts.indexOf(k) + 1} · ` : ''}{n}</button>)}<button className="sortClear" onClick={() => setSorts([])}>清除排序 ×</button></div></div><div className="grid">{sorted.map(a => <button onClick={() => open(a)} key={a.id}><img src={a.cover} alt=""/><b>{a.title}</b><span>{a.artist}</span><span>{a.year}</span></button>)}</div></>; }
function formatDate(a: Album) { if (!a.releaseDate)
    return a.year ? `${a.year}-01-01` : '日期未知'; const d = new Date(a.releaseDate); return Number.isNaN(d.getTime()) ? a.releaseDate : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
function Detail({ a, close }: {
    a: Album;
    close: () => void;
}) { const yearRank = a.ranks.find(r => r.scope === 'year'), overall = a.ranks.find(r => r.scope === 'overall'), lengthClass = a.title.length > 54 ? 'extraLongTitle' : a.title.length > 32 ? 'longTitle' : '', titleClass = [lengthClass, a.title.split(/\s+/).some(word => word.length >= 16) ? 'wideWordTitle' : ''].filter(Boolean).join(' '); return <div className="back" onClick={close}><aside className="detailPanel" style={{ '--accent': accent(a).hex } as React.CSSProperties} onClick={e => e.stopPropagation()}><button className="detailClose" onClick={close}>×</button><div className="detailArt"><img src={a.cover} alt=""/><div className="palette">{a.visual.palette.map((p, i) => <i key={i} style={{ background: p.hex, flex: p.weight }}/>)}</div></div><div className="detailCopy"><small>{formatDate(a)} · {a.releaseType} · {a.language || '无语言信息'}</small><h1 className={titleClass}>{a.title}</h1><h3>{a.artist}</h3><div className="scores"><span><b>{a.userRating || '—'}</b>个人评分 / 10</span><span><b>{a.communityRating || '—'}</b>RYM / 5</span><span><b>{a.ratingCount?.toLocaleString()}</b>评分人数</span><span><b>{a.trackCount}</b>曲目</span><span><b>{a.durationSeconds ? Math.round(a.durationSeconds / 60) : '—'}</b>分钟</span><span><b>{yearRank ? `#${yearRank.position}` : '—'} / {overall ? `#${overall.position}` : '—'}</b>年度 / 历史排名</span></div><h4>流派 · {a.genres.length}</h4><p className="pills">{a.genres.map(x => <i key={x}>{x}</i>)}</p><h4>语义标签 · {a.descriptors.length}</h4><p className="pills">{a.descriptors.map(x => <i key={x}>{x}</i>)}</p><h4>视觉指标</h4><div className="metricBars">{metrics.slice(0, 8).map(m => <span key={m}>{names[m]}<i><b style={{ width: `${value(a, m)}%` }}/></i><em>{value(a, m).toFixed(1)}</em></span>)}</div>{a.url && <a href={a.url} target="_blank" rel="noreferrer">在 RYM 查看 ↗</a>}</div></aside></div>; }
