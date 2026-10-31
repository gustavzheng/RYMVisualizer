'use client';

import { useEffect, useMemo, useState } from 'react';
import { BottomDock, Detail, type Album } from '../album-lab-v2';
import './year-in-music.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const count = (items:string[]) => Object.entries(items.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {} as Record<string,number>)).sort((a,b)=>b[1]-a[1]);
const average = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0;
const monthOf = (a:Album) => {
  if (!a.releaseDate) return -1;
  const d = new Date(a.releaseDate);
  return Number.isNaN(d.getTime()) ? -1 : d.getMonth();
};
const cover = (a:Album) => a.cover.startsWith('/') ? `${basePath}${a.cover}` : a.cover;
const accent = (a:Album) => a.visual.accent ?? a.visual.dominant;

export default function YearInMusic(){
  const [all,setAll] = useState<Album[]>([]), [year,setYear] = useState(new Date().getFullYear()), [focus,setFocus] = useState<Album|null>(null);
  useEffect(()=>{ fetch(`${basePath}/data/albums.json`).then(r=>r.json()).then((data:Album[])=>{
    setAll(data);
    const years=[...new Set(data.flatMap(a=>a.year?[a.year]:[]))].sort((a,b)=>b-a);
    const current=new Date().getFullYear(); setYear(years.includes(current)?current:(years[0]??current));
  }); },[]);
  const years=useMemo(()=>[...new Set(all.flatMap(a=>a.year?[a.year]:[]))].sort((a,b)=>b-a),[all]);
  const data=useMemo(()=>all.filter(a=>a.year===year),[all,year]);
  const ranked=useMemo(()=>[...data].sort((a,b)=>(b.communityRating||0)-(a.communityRating||0)||b.ratingCount-a.ratingCount),[data]);
  const genres=useMemo(()=>count(data.flatMap(a=>a.genres)),[data]);
  const moods=useMemo(()=>count(data.flatMap(a=>a.descriptors)).slice(0,16),[data]);
  const languages=useMemo(()=>count(data.flatMap(a=>a.language?a.language.split(',').map(x=>x.trim()):['无语言信息'])).slice(0,6),[data]);
  const months=useMemo(()=>Array.from({length:12},(_,i)=>data.filter(a=>monthOf(a)===i)),[data]);
  const colorSorted=useMemo(()=>[...data].sort((a,b)=>accent(a).h-accent(b).h),[data]);
  const totalMinutes=Math.round(data.reduce((s,a)=>s+(a.durationSeconds||0),0)/60);
  const avgRating=average(data.flatMap(a=>a.communityRating?[a.communityRating]:[]));
  const best=ranked[0];
  const hidden=[...data].filter(a=>a.communityRating&&a.ratingCount<500).sort((a,b)=>(b.communityRating||0)-(a.communityRating||0)).slice(0,6);
  const yi=years.indexOf(year), previous=years[yi+1], next=years[yi-1];
  useEffect(()=>{
    if (!data.length || !window.location.hash) return;
    const id=window.location.hash.slice(1);
    requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({block:'start'}));
  },[data.length]);
  return <main className="yearReport">
    <header className="yrTop"><a href={`${basePath}/`} className="yrBrand">◉ CHROMA <small>MUSIC DATA ATLAS</small></a><nav><a className="backAtlas" href={`${basePath}/`}>← 返回主图谱</a><a href="#highlights">年度精选</a><a href="#genres">声音版图</a><a href="#calendar">发行节奏</a><a href="#colors">封面色谱</a></nav><span>{data.length} ALBUMS</span></header>
    <BottomDock className="yearControl" label="切换年度报告"><button disabled={!previous} onClick={()=>previous&&setYear(previous)} aria-label={previous?`切换到 ${previous} 年`:'没有更早年份'}>←</button><label><span>年度报告</span><select value={year} onChange={e=>setYear(+e.target.value)} aria-label="选择年份">{years.map(y=><option key={y}>{y}</option>)}</select></label><button disabled={!next} onClick={()=>next&&setYear(next)} aria-label={next?`切换到 ${next} 年`:'没有更新年份'}>→</button></BottomDock>
    <section className="yrHero" style={{'--hero-accent':best?accent(best).hex:'#d8ff38'} as React.CSSProperties}>
      <p className="yrKicker">THE YEAR IN ALBUMS · 年度唱片报告</p>
      <h1><span>{year}</span><em>听见这一年</em></h1>
      <div className="heroStatement"><p>把这一年的发行记录折叠成一张声音地图：从最受好评的唱片，到流派的潮汐、月份的节拍与封面的集体色彩。</p><a href="#highlights">开始回顾 ↓</a></div>
      <div className="heroStats"><div><strong>{data.length}</strong><span>张专辑</span></div><div><strong>{genres.length}</strong><span>种流派</span></div><div><strong>{totalMinutes.toLocaleString()}</strong><span>分钟音乐</span></div><div><strong>{avgRating.toFixed(2)}</strong><span>平均社区评分</span></div></div>
      <div className="heroCovers">{ranked.slice(0,16).map((a,i)=><button onClick={()=>setFocus(a)} key={a.id} style={{transform:`rotate(${(i%2?1:-1)*(1+i%3)}deg) translateY(${i%3*3}px)`}}><img src={cover(a)} alt={a.title}/></button>)}</div>
      <div className="heroSignals"><small>YEAR AT A GLANCE</small><div><span>年度主导流派<b>{genres[0]?.[0]??'—'}</b></span><span>发行高峰<b>{String(months.findIndex(x=>x.length===Math.max(...months.map(m=>m.length)))+1).padStart(2,'0')} 月</b></span><span>年度最高分<b>{best?.communityRating?.toFixed(2)??'—'} · {best?.title??'—'}</b></span></div></div>
      <div className="heroPulse"><small>RELEASE PULSE / 年度发行脉冲</small><div>{months.map((list,i)=><span key={i}><i style={{height:`${18+list.length*6}px`}}/><b>{String(i+1).padStart(2,'0')}</b><em>{list.length}</em></span>)}</div></div>
    </section>

    <section id="highlights" className="yrSection highlights"><div className="sectionIntro"><span>01 / HIGHLIGHTS</span><h2>这一年的<br/><i>关键唱片</i></h2><p>以社区评分为主、评分人数为辅，勾勒最受认可的发行。点击封面可打开专辑档案。</p></div><div className="podium">{ranked.slice(0,12).map((a,i)=><button onClick={()=>setFocus(a)} key={a.id} className={i===0?'winner':''}><span>#{i+1}</span><img src={cover(a)} alt=""/><strong>{a.title}</strong><small>{a.artist}</small><em>{a.communityRating?.toFixed(2)??'—'}</em></button>)}</div></section>

    <section id="genres" className="yrSection genreStory"><div className="sectionIntro light"><span>02 / SOUND MAP</span><h2>声音版图</h2><p>{year} 年的流派不是一份榜单，而是一组彼此重叠的大陆。</p></div><div className="genreBars">{genres.slice(0,12).map(([g,n],i)=><div key={g}><span>{String(i+1).padStart(2,'0')}</span><b>{g}</b><i><u style={{width:`${Number(n)/Number(genres[0]?.[1]||1)*100}%`}}/></i><em>{n}</em></div>)}</div><div className="moodCloud"><span>年度气质</span>{moods.map(([m,n],i)=><b key={m} style={{fontSize:`${Math.max(13,31-i)}px`,opacity:.96-i*.035}}>{m}<sup>{n}</sup></b>)}</div></section>

    <section id="calendar" className="yrSection calendarStory"><div className="sectionIntro"><span>03 / RELEASE PULSE</span><h2>十二个月，<br/>十二种节拍</h2><p>按发行日期观察这一年的速度变化。每个方块都是一张专辑。</p></div><div className="monthChart">{months.map((list,i)=><div key={i} className={list.length===Math.max(...months.map(x=>x.length))?'peak':''}><header><b>{String(i+1).padStart(2,'0')}</b><span>{list.length} 张</span></header><div>{list.map(a=><button key={a.id} onClick={()=>setFocus(a)} style={{background:accent(a).hex}} aria-label={a.title}/>)}</div><small>{['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][i]}</small></div>)}</div></section>

    <section id="colors" className="yrSection colorStory"><div className="sectionIntro"><span>04 / COVER SPECTRUM</span><h2>这一年，<br/><i>是什么颜色？</i></h2><p>依据每张封面的强调色相排序，生成属于 {year} 的唱片色谱。每张封面右下角的圆点是从该封面提取出的强调色。</p></div><div className="spectrum">{colorSorted.map(a=><button key={a.id} onClick={()=>setFocus(a)} style={{background:accent(a).hex,flexGrow:1+Math.round(a.visual.colorfulness/25)}} aria-label={a.title}/>)}</div><div className="colorCovers">{colorSorted.map(a=><button key={a.id} onClick={()=>setFocus(a)} style={{'--c':accent(a).hex} as React.CSSProperties}><img src={cover(a)} alt=""/><span>{a.title}</span><i/></button>)}</div></section>

    <section className="yrSection discovery"><div><span>05 / DISCOVERIES</span><h2>被低估的<br/>隐藏宝石</h2><p>评分人数少于 500，却在小范围听众中获得高分的唱片。</p></div><div>{hidden.map(a=><button key={a.id} onClick={()=>setFocus(a)}><img src={cover(a)} alt=""/><span><b>{a.title}</b><small>{a.artist}</small></span><em>{a.communityRating?.toFixed(2)}</em></button>)}</div><aside><b>语言切面</b>{languages.map(([l,n])=><p key={l}><span>{l}</span><i style={{width:`${Number(n)/data.length*100}%`}}/><em>{n}</em></p>)}</aside></section>
    <footer><b>◉ CHROMA</b><span>{year} 年度唱片报告 · 基于收藏数据生成</span><a href={`${basePath}/`}>← 返回音乐数据图谱</a></footer>
    {focus&&<Detail a={{...focus,cover:cover(focus)}} close={()=>setFocus(null)}/>}
  </main>;
}
