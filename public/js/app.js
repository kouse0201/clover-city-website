const search=document.querySelector('#search');
if(search){search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();document.querySelectorAll('[data-search]').forEach(el=>{el.style.display=!q||el.dataset.search.includes(q)?'':'none'});});}
const links=[...document.querySelectorAll('.nav-item[href^="#"]')];
const targets=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
const io=new IntersectionObserver(entries=>{const v=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!v)return;links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+v.target.id));},{rootMargin:'-20% 0px -65% 0px',threshold:[0,.1,.5]});targets.forEach(t=>io.observe(t));
